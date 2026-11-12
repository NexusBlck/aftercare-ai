# Progress

## Clinic portal (branch `clinic-portal`, 2026-11-13)

Not pushed, not deployed, migration 0003 not applied to any Supabase project. All data synthetic.

| Check | Command | Result |
| --- | --- | --- |
| Types | `next typegen && tsc --noEmit` | ✅ 0 errors |
| Lint | `npx eslint src tests` | ✅ 0 problems |
| Dependencies | `npm audit --omit=dev` | ✅ 0 vulnerabilities |
| Unit + integration + DB | `npx vitest run` | ✅ 168 passed, 2 skipped (live Supabase RLS — no test project) |
| DB security (PGlite, real migrations) | `npx vitest run tests/db` | ✅ 37 passed; mutation check confirmed the revocation test catches a removed status check |
| Production build | `next build` | ✅ all routes compile (clinic + care-team pages included) |
| E2E (desktop + mobile) | `npx playwright test` | ✅ 52 passed (incl. 6 new clinic tests) |

Completed: multi-tenant schema + RLS + RPCs (0003), server-side tenancy/permissions, 40 new API routes (clinic, care-team, invitations, notifications),
clinic portal UI (dashboard, patients, registration, patient record with uploads + AI extraction, review workspace,
follow-ups, questions, staff, settings, subscription, audit), clinic registration, staff join, patient invitation,
patient Care-team area, in-app notifications, docs (DATABASE_SCHEMA, SECURITY, CLINICAL_SAFETY, API_DOCUMENTATION,
TESTING, DEPLOYMENT, PILOT_READINESS).

Fixed along the way: the 0002 sign-up trigger failed when user metadata lacked `marketing_opt_in` (e.g. users created
from the Supabase dashboard); fixed in 0003.

### Live test project (2026-11-13, owner-approved)

- Separate free Supabase project `aftercare-ai-test` (`lpnhqogpyamvbtsnsjxc`); migrations 0001–0003 applied
  (29 tables, all RLS; 53 policies; private bucket; anon has no table access). Email confirmation off on that project only.
- Vercel preview of `clinic-portal` with one-off overrides (test DB, test extractor, service-role key disabled, SMTP to
  localhost): https://aftercare-hol1x0rnf-nexus-blck.vercel.app (Vercel-Authentication protected). Production project,
  production env vars and shared preview env vars were not changed.
- `npx playwright test --config playwright.live.config.ts`: ✅ **11 passed** — full signed-in workflow with seven synthetic
  accounts (see TESTING.md). Found and fixed two Data API relationship defects in 0003; added code-only DB error logging.

Not done / blocked: malware scanning, staff MFA, legal B2B terms, clinical safety sign-off, independent security review.
See PILOT_READINESS.md.

---

Last updated: 2026-11-12. Status reflects commands actually run in this environment.

## Verification results

| Check | Command | Result |
| --- | --- | --- |
| Lint | `npx eslint` | ✅ 0 problems |
| Types | `next typegen && tsc --noEmit` | ✅ 0 errors (strict mode) |
| Production build | `next build` | ✅ all 35 routes compile; static shells prerender |
| Unit + integration | `npx vitest run` | ✅ 90 passed, 2 skipped (live Supabase RLS — no test project credentials) |
| End-to-end (desktop + Pixel 7) | `npx playwright test` | ✅ 9 passed |
| Client bundle secret scan | `tests/integration/bundle-secrets.test.ts` (after build) | ✅ no secret names/values, no Gemini SDK or prompts in client JS |
| Live Gemini evaluation | `npm run test:ai` with the machine's `GEMINI_API_KEY` | ⚠️ partial — see below |
| Production deployment | `vercel deploy --prod` | ✅ https://aftercare-ai-pi.vercel.app returns 200; sample-plan demo checked in a browser; AI and accounts intentionally unconfigured |
| Browser QA | Built-in browser at 1440×900 and 375×812 | ✅ landing, onboarding, dashboard, review, medications (EN + Urdu) inspected |

### Live Gemini evaluation detail

- `gemini-2.5-flash` returns 404 "no longer available to new users". Probing showed that `gemini-3.5-flash` works with structured JSON output, so it is now the default model.
- Run 1, default thinking: cases 1, 2, 3, 4, 8, 9 and 10 passed. Cases 5, 6 and 7 hit the 90 s timeout.
- Run 2: cases 1–6 and 9 passed. Case 7 timed out, case 8 got a 429 rate limit, and case 10 timed out.
  - A test later caught a regex bug: the LOW thinking level was not actually sent during this run. It is fixed now, and a unit test asserts it.
- **9 of 10 cases have passed against the real model at least once.** Case 7 (contradictory activity) has never finished: every attempt ended in a timeout or a 429.
- No case has ever failed on a safety assertion. The injected opioid was never extracted, missing durations and dates stayed null, and the cross-document conflict was detected.
- Further live runs were stopped because the key hit its rate limit.

## QA audit (2026-11-12)

See `QA_REPORT.md`. Nine issues were fixed, including an open redirect, missing security headers, contrast and other accessibility gaps, and a slow sign-in render. CI (lint, types, tests, 30 E2E, Lighthouse, OWASP ZAP baseline) is green on `feat/aftercare-initial-build`.

## Definition of done

| Requirement | Status | Evidence |
| --- | --- | --- |
| Application starts | ✅ | `next start` via Playwright and the preview server |
| Production build succeeds | ✅ | `next build` |
| TypeScript checks pass | ✅ | `tsc --noEmit` |
| Lint checks pass | ✅ | `eslint` |
| Landing page complete | ✅ | hero, how it works, features, benefits, safety, privacy, CTA, footer |
| Authentication or labelled demo access | ✅ demo / ⚠️ auth untested live | Demo is E2E-tested. Supabase auth is implemented but not run against a live project (no credentials). |
| Upload accepts supported formats | ✅ | E2E upload of a synthetic PDF; JPEG/PNG signatures unit-tested |
| Upload rejects unsupported formats | ✅ | E2E: `.txt` and text disguised as `.pdf`; API returns `unsupported_type` |
| Documents stored privately | ⚠️ implemented, not live-verified | Private bucket and folder-scoped policies in the migration (static test). Live test is written but skipped. |
| Gemini integration works when configured | ⚠️ partial | Real calls succeed on `gemini-3.5-flash`; see live evaluation above |
| Structured extraction works | ✅ | Real model output passed Zod on 9 cases; deterministic pipeline tests |
| Invalid AI output is rejected | ✅ | Truncated, malformed, missing-property, safety-blocked and empty outputs are rejected |
| Source references preserved | ✅ | Excerpt and page on every item; source dialog E2E-tested |
| Missing clinical info stays missing | ✅ | Sanitizer tests; live case 2 (duration null) and case 5 (no invented date) |
| Conflicts highlighted | ✅ | Unit, E2E, and live case 6 |
| Medication details require review | ✅ | All items start as `needs_review`; conflicting items can't be confirmed |
| Patient can correct extracted info | ✅ | E2E correction with audit record |
| Confirmed data persists | ✅ demo / ⚠️ account | localStorage persistence E2E; Supabase persistence via `persistDiff` not run live |
| Recovery dashboard / medications / tasks / follow-ups / documents | ✅ | E2E journey and mobile overflow test |
| PDF export works | ✅ | E2E download; PDF parsed in a unit test |
| RLS policies verified | ⚠️ static only | Migration tests pass; live cross-user test is written and skipped (no test project) |
| Cross-user access tests pass | ⚠️ not run | Same as above |
| Mobile layout works | ✅ | Pixel 7 E2E: no horizontal overflow on any screen; 44 px+ nav targets |
| Synthetic demo works without credentials | ✅ | E2E with Supabase and Gemini variables empty |
| No exposed API keys | ✅ | Bundle scan; secrets only in server-only modules |
| No fabricated AI interactions | ✅ | Sample data is labelled; the test extractor is labelled; processing stages are streamed from real server steps |
| README / demo script / submission summary | ✅ | `README.md`, `DEMO_SCRIPT.md`, `SUBMISSION_SUMMARY.md` |
| Known limitations documented | ✅ | Below |
| No critical unresolved security or clinical-safety defects | ✅ to our knowledge | Remaining items below are verification gaps, not known defects |

## Known limitations

1. **No live Supabase verification yet.** Account mode is implemented and type-checked: auth, signed uploads, RLS persistence, the process stream, export and account deletion. It has not been run against a real project. To close this, provision a test project, apply the migration, and run the RLS test and a manual account journey.
2. **Live AI evaluation is incomplete.** Case 7 has not finished because of timeouts and rate limits. Gemini 3.x latency under load can approach the 90 s timeout.
3. **Daily tasks use a single completion flag.** A task ticked today stays ticked; there is no per-day log.
4. **Interface in English only.** Urdu is offered for plain-language explanations only. Urdu is not drawn in the PDF (standard PDF fonts cannot render it).
5. **Demo mode on Vercel.** `/api/extract` receives the file directly, so it is subject to the platform body limit (about 4.5 MB). Account mode uploads straight to Storage.
6. **Rate limiting is per instance and in memory.** It is a best-effort guard; a shared limiter (for example Upstash or Postgres) would be needed at scale.
7. **Image documents.** JPEG and PNG are accepted and sent to Gemini, but there is no image fixture or live image evaluation yet.
8. **Deployed as demo only.** The live site has no Gemini key (owner's choice) and no Supabase project, so live AI processing and accounts are off there. It does not redeploy on push yet; run `vercel git connect` to enable that.
9. **No compliance claims.** No HIPAA or GDPR assessment has been done, and there is no clinical validation.

## Next highest-priority tasks

1. Provision a Supabase test project, then run `tests/integration/rls.test.ts` and an account-mode journey.
2. Re-run `npm run test:ai` once the Gemini quota resets (LOW thinking is now actually applied), and add an image fixture.
3. Record the demo video against https://aftercare-ai-pi.vercel.app, and connect the GitHub repository to Vercel so pushes redeploy.
