# Pilot readiness

Target: a supervised pilot with **one clinic, one department, a small patient cohort**, after synthetic testing.

**Current assessment: not ready for real patients.** The software is technically implemented and tested with
synthetic data, including a full signed-in workflow against a separate Supabase test project. Operational, legal and
clinical approvals have not happened, and the clinic portal is not deployed to production.

## Status by dimension

| Area | Technically implemented | Tested (automated) | Independently reviewed | Operationally configured | Legally reviewed | Clinically approved |
|---|:-:|:-:|:-:|:-:|:-:|:-:|
| Multi-tenant data model + RLS | ✓ | ✓ (PGlite 37 + live test project 11) | ✗ | ◐ (test project only; not production) | — | — |
| Clinic onboarding, staff, roles | ✓ | ✓ DB + live | ✗ | ✗ | — | — |
| Patient registration, episodes | ✓ | ✓ DB + live | ✗ | ✗ | ✗ (data minimisation, consent wording) | — |
| Document upload (private storage) | ✓ | ✓ live (Supabase Storage) | ✗ | ✗ (no malware scanning) | ✗ | — |
| AI extraction (existing pipeline) | ✓ | ✓ synthetic only | ✗ | ✗ (needs paid-tier Gemini key) | ✗ (Google as processor, DPA) | ✗ (accuracy on real documents) |
| Clinical review + approval + versioning | ✓ | ✓ | ✗ | ✗ | — | ✗ |
| Patient invitations + account linking | ✓ | ✓ DB + live | ✗ | ✗ (manual delivery only) | ✗ | — |
| Patient care-team view | ✓ | ✓ live | ✗ | ✗ | — | ✗ |
| Follow-ups, questions, urgent screen | ✓ | ✓ | ✗ | ✗ | — | ✗ (keyword list + wording) |
| Notifications | in-app ✓ | ✓ | ✗ | email/SMS not configured | — | — |
| Subscriptions | manual ✓ | ✓ | ✗ | ✗ | ✗ (B2B terms) | — |
| Audit log | ✓ | ✓ | ✗ | ✗ | ✗ (retention period) | — |

✓ done · ◐ partial · ✗ not done · — not applicable

## Outstanding work

### Critical blockers (before any real patient)

1. ~~Test on a separate Supabase test project~~ — **done 2026-11-13**: `aftercare-ai-test`, 11/11 live workflow tests
   pass (TESTING.md). Remaining: apply 0003 to **production** after a backup (needs owner approval).
2. **Legal:** the current Terms of Service and Privacy Policy describe a free patient app ("no charges … subscriptions")
   and do not cover clinics as customers. A **B2B agreement / data-processing agreement** with the pilot clinic, updated
   privacy notices (clinic as controller, AFTERCARE AI as processor), consent wording for clinic-registered patients,
   cross-border transfer to Supabase/Google/Vercel, and retention periods must be drafted **by a qualified lawyer**
   for Pakistan (and any other applicable law). No compliance claim is made.
3. **Clinical safety sign-off** (CLINICAL_SAFETY.md): hazard log, urgent-keyword list and emergency wording,
   escalation procedure for flagged questions, reviewer training, incident process.
4. **AI accuracy evaluation** on de-identified documents from the pilot department with clinician-agreed criteria;
   requires a paid-tier Gemini key (cost decision for the owner).
5. **Independent security review / penetration test** of the clinic portal (the earlier Strix attempt was blocked by
   model costs).

### High priority

- Malware scanning for uploads (e.g. a scanning service before files become processable).
- Staff MFA (Supabase Auth MFA) and a session timeout policy for shared clinic workstations.
- Shared rate-limit store across Vercel instances.
- Signed-in Playwright E2E for the clinic workflow against the test project (Clinic A/B, roles, patients A/B).
- Decide invitation delivery (manual link vs. email/SMS/WhatsApp provider) and update copy.
- Data-retention job for clinic data once the period is agreed.

### Medium priority

- Enforce storage quota and feature entitlements (currently reported only).
- Payment provider evaluation for Pakistani businesses; until then manual subscriptions.
- Clinic branding (logo upload) — column exists, UI not built.
- Reminder scheduling for follow-ups (status exists; no reminders are sent).
- Clean up orphaned objects from rejected uploads.

### Low priority

- Advanced analytics; integrations; per-department scoping within a clinic.
- Patient-facing Urdu for clinic plans after bilingual clinical review.

## Pilot checklist

- [ ] Signed pilot agreement + DPA with the clinic
- [ ] Updated Terms / Privacy / patient consent text approved by a lawyer
- [ ] Clinical safety lead appointed; hazard log and this checklist approved
- [ ] Migration applied to production after backup; clinic portal deployed
- [ ] Synthetic end-to-end run completed on production; synthetic data removed
- [ ] Paid-tier AI key configured (or manual-entry-only pilot agreed)
- [ ] Staff accounts created via invitations; MFA enabled; roles reviewed
- [ ] Reviewer training completed (source comparison, approval meaning, withdrawing approval)
- [ ] Patient consent recorded for each pilot patient (`consent_status`)
- [ ] Escalation procedure for urgent questions agreed and staffed during communication hours
- [ ] Incident response contacts and procedure documented
- [ ] Retention period configured
- [ ] Weekly audit-log review by the clinic owner during the pilot
- [ ] Exit criteria and success measures agreed
