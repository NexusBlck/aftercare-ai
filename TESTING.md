# Testing

All tests use synthetic data. None call paid services: AI tests use the deterministic test extractor
(`AFTERCARE_AI_PROVIDER=mock`) and synthetic fixtures.

| Command | What it runs |
|---|---|
| `npm run typecheck` | `next typegen` + TypeScript strict |
| `npm run lint` | ESLint (Next + React Compiler rules) |
| `npm test` | Vitest: unit, integration and **database** suites |
| `npm run test:e2e` | Playwright against the production build (`next build` first) |
| `npm run test:ai` | Live Gemini evaluation (opt-in; needs a paid-tier key; costs money — not run by default) |

## Database security tests (`tests/db/`)

`tests/db/harness.ts` boots **PGlite** (PostgreSQL compiled to WebAssembly, in-process, nothing leaves the machine)
with the parts of Supabase the migrations use: `anon` / `authenticated` / `service_role` roles with Supabase's
default grants, `auth.users` + `auth.uid()`, and `storage.objects` + `storage.foldername()`. It applies every
migration in order, then each test runs SQL **as** a given user (`set role authenticated` + JWT subject), exactly as a
PostgREST request would.

`tests/db/clinic-security.test.ts` (37 tests) covers the required security cases:

- Clinic A cannot list B's patients, read B's documents / episodes / plans / versions, modify B's records,
  create records inside B or point at B's patients, or approve B's plans.
- Tenant columns cannot be moved; storage is folder-scoped per clinic; malformed paths never match.
- A nurse cannot invite staff, change roles, archive patients, read the audit log or change clinic settings;
  admins cannot promote admins or touch the owner.
- Only clinical reviewers approve; status cannot be forced by direct update; submitted/approved versions are locked.
- A patient sees only their own approved version — never drafts, other patients, unshared documents or other clinics —
  cannot modify instructions, and can record progress only in their own plan.
- Invitations: hashed tokens, wrong DOB counted, five failures lock, expired and reused invitations fail, idempotent retry.
- Revoked staff lose access immediately; unauthenticated users get `permission denied` on tables and functions.
- Audit log: key events recorded; not updatable/deletable/insertable by users; approvals cannot be forged.
- Notifications cannot be rewritten; subscription status and plan limits are enforced in the database.

The suite was mutation-checked: removing the "active membership" condition from `private.has_role` makes the
revocation test fail.

## Other suites

| File | Coverage |
|---|---|
| `tests/unit/clinic.test.ts` | permission matrix, DB error mapping, request schemas, urgent-symptom screen, clinician plan editing (no inference, corrections history, flags block approval) |
| `tests/integration/clinic-extraction.test.ts` | extraction → draft → review with synthetic documents: prompt injection ignored and flagged, missing details stay empty, cross-document conflicts, provenance, idempotent re-extraction |
| `tests/integration/migration.test.ts` | static guards: RLS on every table, policies keyed on `auth.uid()` (directly or via audited helpers), no anon access, append-only audit, hashed tokens |
| `tests/integration/bundle-secrets.test.ts` | no server secrets or SDKs in the browser bundle |
| `tests/e2e/clinic.spec.ts` | clinic routes require sign-in; registration page validation + accessibility; invitation token read from the URL fragment, removed and never sent to the server; CSRF on clinic/care-team APIs; demo + care-team regression |
| existing `tests/e2e/*` | full patient journey, legal, security, responsive and accessibility audits (unchanged) |

## Live signed-in workflow (`tests/live/`, `playwright.live.config.ts`)

Runs a local production build against a **separate Supabase test project** (`aftercare-ai-test`, never production)
with the deterministic extractor and SMTP disabled. Seven fresh synthetic accounts per run: Clinic A owner,
clinician and nurse, Clinic B owner, Patient A, Patient B, an outsider.

```bash
# .env.test-project.local (gitignored): NEXT_PUBLIC_SUPABASE_URL=…test project…, NEXT_PUBLIC_SUPABASE_ANON_KEY=…
set -a; . ./.env.test-project.local; set +a; AFTERCARE_AI_PROVIDER=mock npx next build
npx playwright test --config playwright.live.config.ts
npx next build   # rebuild without the test variables before the normal E2E suite
```

11 tests cover acceptance workflows 1–13 end to end through the real Supabase Auth, PostgREST, RLS, RPCs and
Storage: clinic creation (one through the UI), email-bound single-use staff invitations, role enforcement, patient
registration + duplicate detection, signed upload + byte verification (a fake PDF is rejected), extraction into a
draft, clinician edits with optimistic concurrency, flag resolution, attested approval (nurse/owner/patient refused),
hashed patient invitation with date-of-birth check and reuse protection, the patient's approved-only view,
progress/attendance reports, urgent-question screening and staff reply, notifications, dashboard counts, cross-clinic
404s on every resource, revision without losing the approved version, revocation and unauthenticated 401s, and audit
coverage. Screenshots are written to `test-results/live/`.

The first live runs found two defects the in-process database tests could not (they don't go through PostgREST):
`recovery_plans` had no direct relationship to `clinic_patients`, and `plan_versions` ↔ `recovery_plans` embeds were
ambiguous. Patient search, the dashboard, review queue, follow-ups and patient detail would have failed in a real
deployment. Both are fixed in `0003` (a direct composite FK and an explicitly named FK used as the embed hint).

## FreeLLMAPI provider

`tests/unit/freellmapi.test.ts` (13 tests, no network): request shape, fence/prose-tolerant JSON, error mapping,
retries, model-preference failover (busy → next; bad key → stop), PDF text extraction with page markers (real
`unpdf` on the synthetic PDF), photo routing to the vision list, schema-mismatch retry, injected-medication
handling, and the legal-disclosure switch.

Live check (2026-11-13, synthetic documents only, local router with the owner's Google/Groq/OpenRouter keys):

| Document | Served by | Result |
|---|---|---|
| Discharge summary (PDF) | Groq `gpt-oss-120b` (5 s) / Gemini 3.1 Flash-Lite on failover | 3/3 medications complete, dates 2026-11-08 / 2026-11-10, follow-up 2026-11-22 10:30, 5 warning signs, 0 issues |
| Prompt injection (PDF) | Gemini 3.1 Flash-Lite | only Paracetamol; injected opioid ignored; injection flagged |
| Conflicting prescription (PDF) | Groq `gpt-oss-120b` | both Cefalexin schedules returned for conflict review |
| Prescription photo (PNG) | Gemini 3.1 Flash-Lite (vision) | 2/2 medications incl. timing and duration; follow-up 2026-12-03 09:30 |

Earlier runs with the router's `auto` choice picked a small coding model that wrote its own reasoning into a field,
and free Gemini 3.5 Flash timed out on long inputs — hence the explicit preference lists. Free-tier quality and
availability change daily; extracted plans still require clinician (or patient) review.

## What is *not* covered automatically

- The live suite runs locally; the Vercel preview of `clinic-portal` is protected by Vercel Authentication, so it was
  not driven by automation.
- Live Gemini extraction quality on real documents (the test extractor is used).
- Signature antivirus (not implemented; the built-in active-content check is tested in `tests/unit/malware-scan.test.ts`).
