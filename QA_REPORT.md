# QA Audit Report

**Date:** 2026-11-12. **Branch:** `feat/aftercare-initial-build`, commit `99ff301`. **CI run:** [43219566416](https://github.com/NexusBlck/aftercare-ai/actions/runs/43219566416), all 3 jobs green.

**Tools:** Playwright 1.65 with axe-core 4.14 (WCAG 2.1 AA), Lighthouse 13.6, OWASP ZAP baseline (`zaproxy/action-baseline@v0.15.0`), GitHub Actions, Vitest 5.

**Cost:** nothing paid. E2E, Lighthouse and ZAP ran against a production build using the deterministic **test extractor**, not Gemini. No Gemini calls were made during this audit.

## What was tested and how

| Area | Method | Verified for real? |
| --- | --- | --- |
| All 11 screens plus not-found | Playwright, desktop 1440×900 and Pixel 7 | ✅ real browser, production build |
| Buttons and navigation (landing anchors, CTAs, sidebar, mobile bottom nav, menu sheet) | Playwright | ✅ |
| Upload: valid PDF, `.txt`, text disguised as `.pdf`, 11 MB file, cancel/dismiss | Playwright | ✅ |
| Documents: preview, reclassify, reprocess (patient classification kept), delete with confirmation | Playwright | ✅ |
| Extraction → review → correct → confirm; conflicts block confirmation; marking discussed unblocks | Playwright | ✅ with the **test extractor**; the real Gemini path is covered by mocked unit tests and the earlier live evaluation (9/10 cases) |
| Medications, tasks (complete/undo, persists after reload), appointments (attended/rescheduled/reset) | Playwright | ✅ |
| Settings: Urdu explanations, rename plan, reset sample, delete demo data, exit demo | Playwright | ✅ |
| PDF export (download, `%PDF` header, size) | Playwright and pdf-lib parse | ✅ |
| Accessibility | axe on every page, phone layout, menu sheet and 4 dialogs; keyboard skip link | ✅ 0 violations after fixes |
| Console errors | Playwright on every page | ✅ none |
| Performance, best practices, SEO | Lighthouse, mobile and desktop, 3 public pages | ✅ |
| Security headers, CSP compatibility | Playwright assertions; ZAP passive scan (63 rules) | ✅ |
| API safety (no auth → 503, bad bytes → 400, no stack traces) | Playwright API tests | ✅ |
| Client bundle secrets | Vitest scan of the `.next/static` build | ✅ |
| Supabase auth, RLS, private storage | static migration tests only; live cross-user test written but **skipped** | ⚠️ **unverified**: no Supabase project is connected |
| Live Gemini extraction | not re-run (no paid calls without permission) | ⚠️ last live run: 9/10 cases passed at least once |

## Issues found and fixed

| # | Severity | Issue | Found by | Fix | Verified by |
| --- | --- | --- | --- | --- | --- |
| 1 | **High (security)** | Open redirect after login: `?next=/\evil.com` passed the "starts with `/`, not `//`" check, and browsers treat `\` as `/` | code review during the Lighthouse fix | `safeNext` now resolves against the current origin and requires the same origin (`src/lib/security/redirect.ts`) | unit test with backslash, tab and scheme variants |
| 2 | **Medium (security)** | No security headers: no CSP, no clickjacking protection, `X-Powered-By` exposed | ZAP / review | CSP (self + Supabase only; `frame-ancestors 'none'`, `object-src 'none'`), X-Frame-Options, nosniff, Referrer-Policy, Permissions-Policy, COOP, CORP, HSTS; `no-store` on `/api/*` | E2E header test; ZAP 0 warnings; E2E confirms the CSP doesn't break preview or export |
| 3 | Low (security) | Demo cookie was not `Secure` on HTTPS | ZAP 10010 | `Secure` when served over HTTPS (it stays script-readable by design and holds no personal data) | code; ZAP override documented |
| 4 | Medium (a11y) | Amber "needs review" text contrast was 4.44:1, below the AA minimum of 4.5:1 (badges, demo banner) | axe | Darkened the amber token | axe, all pages |
| 5 | Medium (a11y) | "Ask clinician" buttons had an accessible name ("Ask my clinician about…") that doesn't contain the visible label (WCAG 2.5.3) | axe | Name now starts with the visible text | axe |
| 6 | Medium (a11y) | Document preview's scrollable text area couldn't be reached by keyboard | axe (dialog scan) | Focusable labelled region | axe and E2E |
| 7 | Low (a11y) | App loading screen had no `<main>` landmark | Lighthouse | Fallback wrapped in `<main>` | Lighthouse a11y 100 |
| 8 | Medium (perf) | The whole sign-in form rendered only after JavaScript loaded (Suspense around the form just to read `?reason`) | Lighthouse (mobile LCP 3.3 s) | Suspense limited to the notice banner; form is server-rendered | mobile LCP **0.9 s**, performance 100 |
| 9 | Low (best practices) | Zod's `Function("")` feature probe was logged as a CSP eval violation | Lighthouse (best practices 96) / DevTools issues | Zod set to `jitless` (`src/schemas/zod-config.ts`) instead of loosening the CSP | Lighthouse best practices 100 |

Test-only corrections, not app bugs:
- A selector that matched both the password field and the show-password button.
- A shell escaping slip that stripped a backslash from a test string.
- Waiting for animations to finish before axe scans, so colours aren't measured mid-fade.

## Results after fixes

| Suite | Local | CI (Linux) |
| --- | --- | --- |
| ESLint, TypeScript strict, `next build` | ✅ | ✅ |
| Vitest unit and integration | ✅ 91 passed, 2 skipped | ✅ |
| Playwright E2E (journey, audit, axe, headers, mobile) | ✅ 30 passed | ✅ 30 passed |
| Lighthouse (asserts a11y ≥95, best practices/SEO ≥90) | ✅ | ✅ |
| OWASP ZAP baseline | n/a (no Docker locally) | ✅ FAIL 0, WARN 0, PASS 63, 5 justified overrides |

**Lighthouse in CI (performance / accessibility / best practices / SEO):**

| Page | Mobile | Desktop |
| --- | --- | --- |
| Home | 100 / 100 / 100 / 100 | 100 / 100 / 100 / 100 |
| Login | 100 / 100 / 100 / 100 | 100 / 100 / 100 / 100 |
| Onboarding | 92 / 100 / 100 / 100 (LCP 3.3 s) | 100 / 100 / 100 / 100 |

**ZAP overrides** (each justified in `.zap/rules.tsv`):
- CSP `unsafe-inline`: required by Next.js inline bootstrap scripts without per-request nonces.
- Demo cookie not HttpOnly: intentional, see fix 3.
- COEP: not needed, and it would block signed Supabase previews.
- Two informational notices.

## What these results do and don't prove

- **Verified against the real running app:** everything marked ✅ above. It ran in real Chromium against a production build, both locally and on GitHub's Linux runners.
- **Mocked:**
  - All E2E document processing uses the deterministic test extractor, which recognises only the synthetic fixtures and is labelled "not AI output" in the UI.
  - Gemini error handling (timeouts, 429, malformed output) is tested with a mocked SDK.
- **Unverified integrations:**
  - **Supabase:** auth, RLS cross-user isolation, private storage, account-mode persistence and the server PDF export. None of these have run against a real project.
  - **Live Gemini:** this audit made no new calls. The earlier live run passed 9 of 10 cases; one has never completed because of timeouts and rate limits.

## Remaining limitations

1. Onboarding and the app screens render in the browser by design, because demo data lives in browser storage. That costs about 3 s of mobile LCP under Lighthouse's slow-4G simulation.
2. The CSP needs `'unsafe-inline'` for scripts. Removing it would mean per-request nonces and fully dynamic rendering.
3. ZAP ran only the passive baseline. No authenticated or active (attack) scan was run, because there is no account backend to authenticate against.
4. Lighthouse covered only public and onboarding URLs; the app screens need browser-stored demo data. Those screens are covered by the axe and Playwright checks instead.
5. The live site (https://aftercare-ai-pi.vercel.app) was redeployed from `main` after the audit. It is verified live: all security headers present, no console or CSP errors on any screen, demo journey and PDF export work, and Lighthouse scores 100 across the board except onboarding mobile performance (97).
6. The limitations listed in `PROGRESS.md` still apply: the single daily completion flag, Urdu not shown in the PDF, the demo upload size cap on Vercel, and the per-instance rate limiter.

## How to reproduce

```bash
npm run build && npm test && npm run test:e2e
```
For Lighthouse, start the app with `npm start`, then run `npx tsx scripts/lighthouse.mts http://localhost:3000`. ZAP runs in GitHub Actions (`.github/workflows/ci.yml`).
