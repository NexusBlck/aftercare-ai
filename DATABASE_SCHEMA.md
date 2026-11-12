# Database schema

PostgreSQL on Supabase. Migrations live in `supabase/migrations/` and are applied in filename order.

| Migration | Contents |
|---|---|
| `0001_init.sql` | Patient-owned data: `profiles`, `care_plans`, `documents`, `medications`, `recovery_tasks`, `follow_ups`, `warning_signs`, `review_flags`, `corrections`, `extraction_runs`; private `medical-documents` bucket |
| `0002_legal_consent_retention.sql` | `legal_acceptances`, marketing preference, sign-up consent trigger, retention job |
| `0003_clinic_portal.sql` | Multi-tenant clinic portal (below). **Additive only**, plus a fix to the 0002 sign-up trigger |

All three migrations are applied and tested together in an in-process PostgreSQL (PGlite) by `tests/db/`.

## Two data domains

```
 Patient-owned (0001)                       Clinic-owned (0003)
 ─────────────────────                      ──────────────────────────────────────────
 auth.users ──< care_plans ──< items        organizations ──< organization_memberships >── auth.users
   (a person's own uploads,                      │
    demo + account mode)                         ├──< staff_invitations (token_hash only)
                                                 ├──1 subscriptions, ──< billing_events
                                                 └──< clinic_patients ──o auth.users (linked patient)
                                                         │
                                                         ├──< care_episodes ──< clinic_documents
                                                         │         │
                                                         │         └──1 recovery_plans ──< plan_versions ──< clinical_approvals
                                                         │                   │                 (bundle jsonb)
                                                         │                   ├──< follow_up_tracking
                                                         │                   └──< patient_questions ──< question_messages
                                                         ├──< patient_invitations (token_hash only)
                                                         └──< patient_progress (per approved version)
 notifications (per recipient)        audit_logs (per organization, append-only)
```

The patient-owned tables are unchanged. A patient who is invited by a clinic keeps their own plans and
additionally sees the clinic's **approved** plans in the Care team area.

## Clinic tables (0003)

| Table | Purpose | Key constraints |
|---|---|---|
| `organizations` | A clinic or hospital (tenant) | `slug` unique and random-suffixed; created only via `create_organization()` |
| `organization_memberships` | Staff access: role `owner \| admin \| clinician \| nurse`, `clinical_reviewer`, `status active \| revoked` | unique (org, user); exactly one owner; clinicians always reviewers, nurses never; no direct writes |
| `staff_invitations` | One-time staff invitations | `token_hash` (SHA-256 hex) unique; expiry ≤ 14 days; email must match on acceptance |
| `subscriptions` | Plan `starter \| professional \| enterprise`, status, trial end | one per org; writable only by the operator (service role) |
| `billing_events` | Billing history foundation | operator-written |
| `clinic_patients` | Patient record within one clinic | unique (org, MRN); unique (org, linked user); `date_of_birth` required (identity verification) |
| `care_episodes` | A procedure/admission/discharge | composite FK `(patient_id, organization_id)`; discharge ≥ admission |
| `clinic_documents` | Uploaded discharge documents | composite FK to episode+patient+org; `file_path` must equal `clinic/{org}/{patient}/{id}.{ext}` |
| `recovery_plans` | One plan per episode | `approved_version_id` = the version patients see |
| `plan_versions` | Immutable snapshots (`bundle jsonb`, same `PlanBundle` shape as the patient app) | unique (plan, version); at most one open version per plan; approved/rejected/superseded are immutable |
| `clinical_approvals` | Decisions: approved / rejected / changes requested | clinician id + name, version, time, comment; written only by `decide_plan_version()` |
| `patient_invitations` | One-time patient invitations | `token_hash` only; expiry; failed attempts (5 → locked); revocable |
| `patient_progress` | Patient acknowledgements / completed tasks | per approved version; unique per item+action |
| `follow_up_tracking` | Patient-reported vs staff-verified attendance | separate columns; unique (plan, follow-up item) |
| `patient_questions`, `question_messages` | Patient ↔ care-team messages | status `new → assigned → in_progress → responded → closed`; `urgent_keywords` flag |
| `notifications` | In-app notifications | generic titles only; recipient may only set `read_at` |
| `audit_logs` | Append-only audit trail | written only by SECURITY DEFINER functions; non-sensitive metadata |

### Tenant integrity

Every clinic-owned row carries `organization_id`. Child tables reference parents with **composite foreign
keys** that include `organization_id` (and `patient_id` where relevant), so a row can never point at another
clinic's patient, episode or plan — even if application code had a bug.

### Plan versioning

```
draft ──submit──▶ pending_review ──approve──▶ approved ──(new version approved)──▶ superseded
  ▲                    │  └──reject──▶ rejected
  └── changes_requested ◀┘
approved ──revise_plan()──▶ new draft (approved version stays visible until the new one is approved)
approved ──revoke_plan_approval()──▶ superseded (patient sees nothing until re-approval)
```

Status changes happen only inside the functions below; a trigger rejects direct status changes and any edit to a
submitted, approved, rejected or superseded version.

## Functions (RPC)

All are `SECURITY DEFINER` with `search_path = ''`, re-check the caller's role, and write `audit_logs` in the same
transaction. `EXECUTE` is granted to `authenticated` only.

| Function | Who | Effect |
|---|---|---|
| `create_organization(...)` | any signed-in user (max 3 owned) | org + owner membership + 30-day Starter trial |
| `create_staff_invitation(org, email, role, reviewer, ttl)` | owner/admin (admins cannot invite admins) | returns plaintext token once; stores hash |
| `accept_staff_invitation(token, name)` | invited user (email must match) | creates/reactivates membership; single use |
| `revoke_staff_invitation(id)`, `update_member(id, role, reviewer, status)` | owner/admin | role rules; no self-change; owner untouchable |
| `create_recovery_plan(episode, title, bundle)` | staff | plan + version 1 (draft) |
| `submit_plan_version(id)` | staff | draft → pending_review; notifies reviewers |
| `decide_plan_version(id, decision, comment)` | clinical reviewer | approve / reject / request changes; comment required unless approving |
| `revise_plan(plan)` | staff (API: reviewers) | new draft from latest version |
| `revoke_plan_approval(plan, reason)` | clinical reviewer | hides the plan from the patient |
| `create_patient_invitation(patient, ttl)` | staff | requires an approved plan; revokes older pending invitations |
| `redeem_patient_invitation(token, dob)` | signed-in patient | DOB check; counts failures; links account |
| `report_follow_up(...)` / `verify_follow_up(...)` | patient / staff | separate status columns |
| `submit_patient_question`, `add_question_message`, `update_question` | patient / staff | messaging workflow |
| `organization_entitlements(org)` | staff | plan, limits and current usage |
| `log_clinic_event(org, action, ...)` | staff | allow-listed operational events only (cannot forge approvals) |

Private helpers (`private` schema, not exposed by the API): `has_role`, `is_staff`, `is_reviewer`, `is_patient`,
`patient_can_view_version`, `check_entitlement`, `plan_limits`, `audit`, `notify`, token helpers.

## Plan limits

| | Starter | Professional | Enterprise |
|---|---|---|---|
| Active patients | 50 | 1,000 | Unlimited |
| Staff (incl. pending invitations) | 10 | 25 | Unlimited |
| Care episodes / month | 100 | 2,000 | Unlimited |
| Storage | 2 GB | 50 GB | Unlimited |
| Advanced analytics / custom branding / integrations | — | ✓ / ✓ / — | ✓ |

Limits and subscription status (cancelled, suspended or expired trial = read-only) are enforced by database
triggers, not only by the UI. Storage and feature flags are reported but not yet enforced.

## Retention and deletion

- Clinic records are never hard-deleted by staff except documents (owners/admins). Patients are **archived**.
- Deleting an organization cascades to all of its data (operator action only).
- Approved plan versions and clinical approvals are kept for the audit trail.
- **Pending decision:** a retention period for clinic records must be set by the pilot clinic and documented in a
  data-processing agreement before real patients are onboarded (see PILOT_READINESS.md).

## Applying the migration

`0003_clinic_portal.sql` has **not** been applied to the production Supabase project. To apply it to a
**separate test project**: Supabase dashboard → SQL editor → paste the file → run. It is additive (creates new
objects; replaces one trigger function with a fixed version) and does not modify existing rows.
