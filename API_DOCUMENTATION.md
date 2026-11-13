# API documentation

JSON over HTTPS. All routes are same-origin only (cross-site writes are rejected with `403 forbidden`).
Errors always have the shape `{ "error": { "code": string, "message": string, "retryable": boolean } }`.
Session cookies are HttpOnly; there are no API keys for clients.

Common error codes: `unauthorized` (401), `forbidden` (403), `not_found` (404), `invalid_request` / `invalid_id`
(400), `conflict` / `duplicate` (409), `subscription_inactive` / `plan_limit_reached` (403), `invitation_invalid`
(400), `rate_limited` (429), `accounts_unconfigured` / `ai_unconfigured` (503), `database_error` / `internal_error` (500).

The patient-app endpoints (`/api/care-plans`, `/api/documents`, `/api/medications/[id]`, …) are unchanged; see the
route files under `src/app/api/`.

## Clinic portal — `/api/clinic/*`

Every route requires a signed-in user with an **active** clinic membership. The organization is the caller's active
clinic (derived from memberships; switchable via `active-org`). "Permission" refers to `src/lib/clinic/permissions.ts`.

| Method & path | Permission | Body / query | Response |
|---|---|---|---|
| `GET /me` | signed in | — | user, memberships, active org, member role, permissions, entitlements |
| `POST /active-org` | member of target | `{ organization_id }` | sets active clinic |
| `POST /organization` | signed in | `{ name, org_type, city?, contact_email?, contact_phone?, owner_name, owner_is_clinician }` | `201 { organization_id }` |
| `PATCH /organization` | `org.manage` | profile, communication hours, emergency instructions | `{ organization }` |
| `POST /join` | signed in (invited email) | `{ token, display_name? }` | `{ organization_id }` |
| `GET /staff` | member | — | members, pending invitations (owner/admin), assignable roles |
| `POST /staff` | `staff.manage` | `{ email, role, clinical_reviewer }` | `201 { link, expires_at, delivery: "email" }` or `{ …, delivery: "manual", email_status: "not_configured" | "failed" }`: the link is emailed to the invited address and also returned once |
| `DELETE /staff/invitations/[id]` | `staff.manage` | — | withdraws invitation |
| `PATCH /staff/members/[id]` | `staff.manage` | `{ role?, clinical_reviewer?, status? }` | role change / revoke / reinstate |
| `GET /dashboard` | member | — | counts, review queue, recent patients, follow-ups, activity (owner/admin) |
| `GET /patients` | `patients.read` | `?q=&status=active\|archived\|all&page=` | `{ patients, total, page, pageSize }` (25/page) |
| `POST /patients` | `patients.write` | patient fields + optional `episode`, `confirm_duplicate` | `201 { patient, episode_id }` or `409 { duplicate: true, matches }` |
| `GET /patients/[id]` | `patients.read` | — | patient, episodes, documents, plans, invitations, questions, progress, follow-ups |
| `PATCH /patients/[id]` | `patients.write` (`status`: `patients.archive`) | partial patient fields | `{ patient }` |
| `POST /patients/[id]/episodes` | `patients.write` | `{ title, department?, admission_date?, discharge_date? }` | `201 { episode }` |
| `POST /patients/[id]/invitations` | `invitations.manage` | optional `{ send_email: boolean }` | `201 { link, expires_at, delivery }`; with `send_email` and an address on file the link is emailed (clinic name only, no health information), otherwise `delivery: "manual"` with `email_status` (needs an approved plan) |
| `DELETE /invitations/[id]` | `invitations.manage` | — | withdraws patient invitation |
| `POST /documents/upload` | `documents.upload` | `{ episode_id, filename, size, document_type }` | `201 { document, uploadUrl, contentType }` |
| `POST /documents/[id]/finalize` | `documents.upload` | — | verifies bytes; rejects mismatches |
| `POST /documents/[id]/process` | `documents.upload` | — | AI extraction into the episode's draft plan → `{ plan_id, version_id, embedded_instructions_detected }` |
| `GET /documents/[id]/file` | `patients.read` | — | file stream (audited) |
| `PATCH /documents/[id]` | `documents.upload` (`shared_with_patient`: `documents.share`) | `{ document_type?, shared_with_patient? }` | `{ document }` |
| `DELETE /documents/[id]` | `documents.delete` | — | deletes file and record |
| `POST /episodes/[id]/plan` | `plans.edit` | — | `201 { plan_id, version_id }` (empty plan for manual entry) |
| `GET /plans/[id]` | `patients.read` | — | plan, patient, episode, documents, versions, approvals, current + approved version, readiness |
| `POST /plans/[id]/revise` | `plans.edit` | — | `201 { version_id }` new draft |
| `POST /plans/[id]/revoke-approval` | `plans.decide` | `{ reason }` | withdraws approval |
| `PATCH /versions/[id]` | `plans.edit` | `{ expected_updated_at, edit }` — `edit.op`: `correct`, `add`, `remove`, `flag_item`, `resolve_flag`, `title` | `{ version, readiness }`; `409 conflict` on concurrent edits |
| `POST /versions/[id]/submit` | `plans.submit` | — | refuses open flags / empty plans |
| `POST /versions/[id]/decision` | `plans.decide` | `{ decision: approved\|rejected\|changes_requested, comments?, attest? }` | approval needs `attest: true`; others need a comment |
| `GET /review` | member | — | pending and in-preparation versions with open-flag counts |
| `GET /follow-ups` | member | — | follow-ups from approved plans with due state, patient-reported and staff-verified status |
| `POST /follow-ups` | `followups.verify` | `{ plan_id, item_id, status, note? }` | staff verification |
| `GET /questions` | `questions.respond` | `?status=open\|responded\|closed\|all` | list |
| `GET /questions/[id]` | `questions.respond` | — | question, messages, staff list |
| `POST /questions/[id]` | `questions.respond` | `{ body }` | reply (marks responded, notifies patient) |
| `PATCH /questions/[id]` | `questions.respond` | `{ status?, assigned_to? }` | update |
| `GET /audit` | `audit.read` | `?page=` | 50/page |
| `GET /billing` | `billing.read` | — | entitlements, subscription, billing events |

## Patient — care team

| Method & path | Who | Body | Response |
|---|---|---|---|
| `POST /api/invitations/redeem` | signed-in patient | `{ token, date_of_birth }` | `{ linked: true }` or `400` with a reason |
| `GET /api/care-team` | signed-in patient | — | linked clinics with approved plans, approver, progress, follow-up reports, questions, shared documents |
| `POST /api/care-team/progress` | patient | `{ version_id, item_kind, item_id, action, done }` | acknowledgement / completion |
| `POST /api/care-team/follow-ups` | patient | `{ plan_id, item_id, status, note? }` | patient-reported attendance |
| `POST /api/care-team/questions` | patient | `{ patient_id, plan_id?, subject, body }` | `201 { question_id, urgent }` |
| `GET/POST /api/care-team/questions/[id]` | patient | `{ body }` | thread / add message |
| `GET /api/care-team/documents/[id]` | patient | — | file stream (only documents shared with them) |

## Shared

| Method & path | Who | Notes |
|---|---|---|
| `GET /api/notifications` | signed in | latest 30 in-app notifications, unread count |
| `PATCH /api/notifications/[id]` | recipient | marks read |
| `POST /api/auth/signup` | public | now accepts `audience: "patient" \| "clinic"` (chooses the welcome email) |
| `POST /api/auth/login` | public | now returns `home` (`/clinic/dashboard` for staff, `/dashboard` otherwise) |
