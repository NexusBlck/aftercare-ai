# Implementation Plan

Environment found at start: empty directory, Node 24.20, npm 11.19, no Git repo, no Supabase
or Gemini configuration. Scaffolded with `create-next-app@16.4.6` (Tailwind 4, Cache Components on),
shadcn/ui (Radix, Nova preset).

| Phase | Scope | Status |
| --- | --- | --- |
| 1 Foundation | Next.js, strict TS, Tailwind, shadcn, env validation, migrations + RLS | Done |
| 2 UI | Landing, auth, onboarding, app shell, all 12 screens | Done, browser-checked |
| 3 Backend | Supabase auth/storage/persistence, ownership checks | Implemented; live verification pending a Supabase project |
| 4 AI | Gemini client, schema, validation, sanitization, explanations, test extractor | Done; live eval 9/10 cases passed at least once |
| 5 Recovery experience | Review, dashboard, tasks, follow-ups, questions, PDF export | Done, E2E-tested |
| 6 QA | Vitest unit/integration, Playwright E2E, mobile checks | 90 unit/integration + 9 E2E passing |
| 7 Deployment | Vercel + hosted Supabase — requires the owner's credentials | blocked on credentials |

Priority order for each loop: security → clinical safety → build breaks → core workflow →
authorization → AI defects → missing features → UI → a11y/perf → docs.
