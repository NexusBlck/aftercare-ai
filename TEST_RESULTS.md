# Test results (2026-11-13, branch `security-audit`)

Only tools and tests that actually ran are listed with results.

| Suite / tool | Command | Result |
|---|---|---|
| TypeScript (strict) | `npx next typegen && npx tsc --noEmit` | 0 errors |
| ESLint | `npx eslint src tests` | 0 problems |
| Unit + integration + DB (PGlite) + pgTAP | `npx vitest run` | **193 passed**, 2 skipped (live Supabase RLS test needs `SUPABASE_TEST_*` credentials) |
| — DB security (RLS, RPCs, triggers) | `tests/db/clinic-security.test.ts` | 39/39 (2 new regressions for AUD-01, AUD-07) |
| — pgTAP | `tests/db/pgtap.test.ts` | 31/31 assertions |
| Production build | `npx next build` | OK |
| E2E (Playwright, desktop + mobile, axe) | `npx playwright test` | **52/52** |
| Live API fuzzing (test project) | `tests/live/api-fuzz.spec.ts` | 67 routes, 2,982 hostile requests, 4 identities: **0 failures** after AUD-13 (first run: 5 × 500) |
| Live upload abuse | same file | 5/5 |
| Live auth boundaries | same file | anonymous 401 on all protected routes; patient 403 on all clinic routes |
| Live signed-in workflow | `tests/live/clinic-workflow.spec.ts` | 11/11 before this audit's schema changes. Re-run: steps 1–3 pass; step 4 fails because the **test database has not received this audit's `last_edited_by` column** (SQL changes through the dashboard were blocked by the safety system). Apply the updated `0003` to the test project and re-run. |
| Promptfoo (AI safety, real models, 9 documents × 2) | `tests/ai/promptfoo/promptfooconfig.yaml` | 16/18 → AUD-12 fixed → re-run of affected cases 4/4; 0 unstable cases |
| Lighthouse (5 pages × 2 devices) | `npx tsx scripts/lighthouse.mts` | Accessibility 100 everywhere; see PERFORMANCE_AUDIT.md |
| Semgrep / Gitleaks / TruffleHog / OSV / npm audit / Trivy / Checkov / Nuclei | see SECURITY_AUDIT.md | 0 real findings (2 Semgrep false positives annotated; Nuclei 6 info) |

## Not run, and why

| Tool | Reason | Substitute |
|---|---|---|
| CodeQL | Large CLI; no local Java | Added to `.github/workflows/security.yml` |
| OWASP ZAP | No Java/Docker locally | Already in `ci.yml` (baseline against a local build) |
| SonarQube | Needs a running server | Semgrep + CodeQL |
| Schemathesis | No OpenAPI schema exists | Route-discovery fuzzer (`api-fuzz.spec.ts`) |
| Nuclei/ZAP against production | Not authorised to scan production dynamically | Read-only header/path checks with curl |

## How to re-run the live suites

```bash
# test project only (never production)
set -a; . ./.env.test-project.local; set +a
AFTERCARE_AI_PROVIDER=mock npx next build
npx playwright test --config playwright.live.config.ts
npx next build   # rebuild normally afterwards
```
