# Performance and accessibility audit (2026-11-13)

Lighthouse 13 via Playwright Chromium (`scripts/lighthouse.mts`) against a local production build; axe-core (WCAG 2.1 AA)
runs inside the Playwright suite. Reports: `qa/lighthouse/`.

| Page | Device | Perf | A11y | Best practices | SEO | LCP | CLS | TBT |
|---|---|---|---|---|---|---|---|---|
| Home | mobile / desktop | 100 / 100 | 100 / 100 | 100 / 100 | 100 / 100 | 1.21 s / 0.34 s | 0 / 0 | 19 / 0 ms |
| Login | mobile / desktop | 100 / 100 | 100 / 100 | 100 / 100 | 100 / 100 | 1.06 s / 0.29 s | 0 / 0 | 39 / 0 ms |
| Onboarding (demo) | mobile / desktop | 91 / 100 | 100 / 100 | 100 / 100 | 100 / 100 | 3.44 s / 0.71 s | 0 / 0 | 99 / 0 ms |
| Clinic registration | mobile / desktop | 85 / 100 | 100 / 100 | 96 / 96 | 100 / 100 | 3.38 s / 0.29 s | **0.164** / 0.031 | 56 / 0 ms |
| Patient invitation | mobile / desktop | 93 / 100 | 100 / 100 | 96 / 96 | 100 / 100 | 3.17 s / 0.66 s | 0.002 / 0 | 40 / 0 ms |

axe-core: no WCAG 2.1 AA violations on any audited page (public pages, demo app screens, clinic registration, invitation).

## Findings (open, Low)

- **P-1** Clinic registration shifts layout on mobile (CLS 0.164) when the account check finishes and the form replaces the
  loading spinner. Fix: reserve the form's height while loading.
- **P-2** Clinic registration and invitation lose 4 best-practice points because their signed-in check (`/api/clinic/me`,
  `/api/profile`) returns 401 for visitors, which the browser logs as a console error. Expected behaviour; could use a
  dedicated "session?" endpoint returning 200.
- **P-3** Mobile LCP of client-rendered pages is ~3.2–3.4 s on Lighthouse's throttled profile (static shell, then data).
  Acceptable; server-rendering the shells would improve it.
- Signed-in clinic pages were not Lighthouse-audited (they need a session); they were exercised functionally by the live suite.
