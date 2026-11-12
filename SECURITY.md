# Security model

This document covers the multi-tenant clinic portal. The earlier hardening of the patient app (CSRF, CSP,
rate limits, cookies, logging) is described in [SECURITY_REVIEW.md](SECURITY_REVIEW.md) and still applies.

> No claim of compliance (HIPAA, GDPR, Pakistan PDPA or otherwise) is made. These controls have been
> implemented and tested by the development team; they have **not** been independently reviewed or penetration-tested.

## Roles and permissions

| Capability | Owner | Admin | Clinician | Nurse/staff | Patient |
|---|:-:|:-:|:-:|:-:|:-:|
| Clinic settings | ✓ | ✓ | | | |
| Invite staff / change roles / revoke access | ✓ (all roles) | ✓ (clinicians, nurses) | | | |
| View subscription, audit log | ✓ | ✓ | | | |
| Register / edit patients | ✓ | ✓ | ✓ | ✓ | |
| Archive / restore patients | ✓ | ✓ | | | |
| Upload documents, run AI extraction | ✓ | ✓ | ✓ | ✓ | |
| Delete documents | ✓ | ✓ | | | |
| Edit draft plans | reviewer\* | reviewer\* | ✓ | | |
| Submit plan for review | ✓ | ✓ | ✓ | ✓ | |
| **Approve / reject / request changes, withdraw approval** | reviewer\* | reviewer\* | ✓ | | |
| Share a document with the patient | ✓ | ✓ | ✓ | | |
| Invite patients, verify follow-ups, answer questions | ✓ | ✓ | ✓ | ✓ | |
| See own approved plan, acknowledge, mark tasks, report attendance, ask questions | | | | | ✓ (own only) |

\* Owners and admins can be flagged as clinical reviewers (licensed clinicians). Nurses can never be reviewers
(database check constraint).

The same matrix is implemented three times: `src/lib/clinic/permissions.ts` (API fail-fast + UI), RLS policies and
SECURITY DEFINER functions (`0003_clinic_portal.sql`, authoritative).

## Tenant isolation — layers

1. **Organization context is derived, never supplied.** `requireClinic()` reads the caller's *active* memberships
   from the database. The optional active-org cookie only chooses between the caller's own memberships and is
   re-validated on every request. No endpoint accepts an organization id from the client for authorization.
2. **Every query is scoped twice:** explicit `organization_id = <active org>` filters *and* RLS.
3. **RLS on every clinic table**, keyed on `auth.uid()` via `private.*` helper functions that require
   `status = 'active'` membership. Revocation takes effect on the next request.
4. **Composite foreign keys** make cross-tenant references impossible at the schema level.
5. **Write guards (triggers)** stop API users from changing tenant/ownership columns, plan status, approved
   versions, notification content or archive state.
6. **Consequential transitions only through SECURITY DEFINER functions** that re-check the role and write the
   audit log atomically.
7. **Storage:** clinic files live at `clinic/{org}/{patient}/{uuid}.{ext}` in the private bucket. Storage policies
   allow staff of that org only; patients only for documents explicitly shared with them. There are no public URLs;
   downloads stream through authenticated API routes (`Cache-Control: private, no-store`, `nosniff`), and every
   staff view is audited.
8. **Service-role key** is used only by the existing account-deletion path; no clinic code uses it.
   `tests/integration/bundle-secrets.test.ts` checks it never reaches the browser bundle.

## Invitations

- Tokens are 244 bits of randomness generated in the database; only the SHA-256 hash is stored.
- Links put the token in the URL **fragment** (`/invitation#t=…`, `/clinic/join#t=…`), which browsers never send
  to servers or proxies, so tokens do not appear in access logs. The page removes it from the address bar.
- Staff invitations: single use, expire (7 days), signed-in email must match the invited address.
- Patient invitations: single use, expire (72 hours), require date of birth; 5 failures lock the invitation;
  re-using a redeemed link from another account fails; a new invitation revokes older pending ones.
- No invitation is sent by email or SMS: staff copy the link and share it through a channel they trust. The UI
  states that nothing was sent.

## Application security controls (clinic routes)

- Zod validation of every request body and query; strict UUID checks on ids.
- Database errors are mapped to fixed messages (`src/lib/clinic/db-errors.ts`); raw errors are never returned.
- CSRF: cross-site writes are blocked in the proxy (Origin / Sec-Fetch-Site), covered by E2E tests for clinic routes.
- Rate limits: org creation, staff join, invitation creation, invitation redemption (per IP and per user),
  patient questions, uploads and AI processing.
- PostgREST filter strings: search input is stripped of filter metacharacters; LIKE wildcards are escaped.
- Optimistic concurrency on plan edits (`expected_updated_at`) prevents silent overwrites; atomic claims prevent
  double processing; idempotent invitation redemption prevents duplicate access.
- Uploads: extension + declared size checks, signed upload to a server-generated path, then magic-byte and size
  verification; mismatches are rejected.

## Prompt injection

Uploaded documents are untrusted. The extraction prompt instructs the model to ignore embedded instructions and
report them (`embedded_instructions_detected`); output is schema-validated and every value must be supported by a
verbatim excerpt. A detection adds an open flag that blocks approval until a clinician resolves it. Tested in
`tests/integration/clinic-extraction.test.ts` with a synthetic injection document.

## Known gaps (see PILOT_READINESS.md)

- **No malware scanning** of uploads (no scanning service is configured). Files are type-checked by magic bytes and
  never executed or rendered server-side, but a scanner should be added before real patient documents are stored.
- In-memory rate limits are per server instance (not shared across Vercel instances).
- No independent penetration test or security review of the clinic portal.
- Rejected uploads by non-admin staff may leave an orphaned object in private storage (not readable by patients).
- MFA for staff accounts is not enforced.
