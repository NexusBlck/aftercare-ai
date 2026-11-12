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

## What is *not* covered automatically

- **Browser end-to-end tests of signed-in clinic workflows** (register clinic → invite staff → upload → approve →
  invite patient → patient view) need a Supabase project with migration 0003 applied. The E2E server deliberately runs
  without Supabase. To run them, create a **separate** free Supabase test project, apply all migrations, and set
  `NEXT_PUBLIC_SUPABASE_URL` / `NEXT_PUBLIC_SUPABASE_ANON_KEY` for a local run. The live RLS test
  (`tests/integration/rls.test.ts`) also targets such a project via `SUPABASE_TEST_*` variables.
- Real Supabase Storage policy behaviour (the harness models `storage.objects` RLS, not the storage API).
- Live Gemini extraction quality on real documents.
