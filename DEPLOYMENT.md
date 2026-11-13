# Deployment

Hosting: Vercel (Next.js) + Supabase (Postgres, Auth, Storage). The current production site
(https://aftercare-ai-pi.vercel.app) runs the patient app from `main`. The clinic portal lives on the
`clinic-portal` branch and is **not deployed**.

## Environment variables

| Variable | Required | Notes |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY` | for accounts / clinic portal | without them the app runs in demo mode only |
| `SUPABASE_SERVICE_ROLE_KEY` | for account deletion | server-only; never exposed to the browser; not used by clinic code |
| `SUPABASE_STORAGE_BUCKET` | no (default `medical-documents`) | private bucket |
| `GEMINI_API_KEY`, `GEMINI_PAID_TIER=true` | for AI extraction | AI runs only when the operator confirms a paid-tier key (free-tier content may be used for training) |
| `GEMINI_MODEL`, `GEMINI_TIMEOUT_MS`, `GEMINI_THINKING_LEVEL` | no | defaults in `src/lib/config.ts` |
| `AFTERCARE_AI_PROVIDER=mock` | tests only | deterministic synthetic extractor |
| `AFTERCARE_AI_PROVIDER=freellmapi` + `FREELLMAPI_BASE_URL`, `FREELLMAPI_API_KEY` | optional | free-tier models through a [FreeLLMAPI](https://github.com/tashfeenahmed/freellmapi) server. The Privacy and Subprocessors pages then disclose free-tier processing automatically (free tiers may train on submitted content) |
| `FREELLMAPI_MODEL`, `FREELLMAPI_VISION_MODEL`, `FREELLMAPI_TIMEOUT_MS` | no | ordered model preference lists (text / photos), tried in turn; per-attempt timeout (default 90 s) |
| `MAX_UPLOAD_MB` | no (10) | |
| `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`, `MAIL_FROM` | for welcome and invitation emails | without them, invitations still work and the clinic shares the link itself |
| `SECURITY_LOG_SALT` | recommended | pseudonymisation salt for security logs |
| `LEGAL_*` / operator details | yes for production | see `src/lib/legal.ts` |

## Deploying the clinic portal (checklist)

Each step needs the owner's explicit approval.

1. **Test project first.** Create a separate Supabase project (free tier), apply `0001`, `0002` and `0003` in the SQL
   editor, configure Auth (email/password; Site URL + redirect URLs), and deploy a Vercel **preview** of
   `clinic-portal` pointing at it. Run the signed-in workflow end to end with synthetic accounts:
   Clinic A owner, Clinic A clinician, Clinic A nurse, Clinic B owner, Patient A, Patient B, an unrelated user.
2. Fix anything found; re-run `npm run typecheck && npm run lint && npm test && npm run build && npm run test:e2e`.
3. **Production database:** back up, then apply `0003_clinic_portal.sql` in a maintenance window. It is additive (new
   tables, functions, policies, storage policies) and replaces the sign-up trigger function with a fixed version; it
   does not modify existing rows. Verify with the queries in DATABASE_SCHEMA.md.
4. Merge `clinic-portal` → `main`, deploy, smoke-test with synthetic accounts, then remove them.
5. Before any real patient: complete PILOT_READINESS.md.

## Free-tier AI through FreeLLMAPI (local)

FreeLLMAPI v0.16.12 is installed from source in `../freellmapi` (sibling folder), bound to `127.0.0.1:3001`
(its default listens on all interfaces). Provider keys (Google AI Studio, Groq, OpenRouter) are added by the owner
on its Keys page and stored encrypted by FreeLLMAPI. The app's settings for it are in `.env.freellmapi.local`
(gitignored, deliberately not `.env.local` so normal builds and Vercel deploys are unaffected).

```bash
# start the router
cd ../freellmapi && set -a && . ./.env && set +a && NODE_ENV=production node server/dist/index.js
# build and start the app with free-tier AI
set -a && . ./.env.freellmapi.local && set +a && npx next build && npx next start -p 3400
```

PDFs are converted to page-marked text before sending (the router refuses binary documents); photos go to vision
models. The live Vercel site cannot reach a router on this computer: using it in production would need FreeLLMAPI
hosted on a server reachable from Vercel (with its own HTTPS and access control).

## Operating subscriptions (manual, pilot)

Plans are set by the operator in the Supabase SQL editor (service role), for example:

```sql
update public.subscriptions
set plan = 'professional', status = 'active', current_period_start = now(), current_period_end = now() + interval '1 year', trial_ends_at = null
where organization_id = '<org id>';
```

Billing history rows go into `public.billing_events`. No payment gateway is integrated; a provider that supports
Pakistani businesses must be evaluated and approved before automating billing.

## Rollback

The clinic portal can be hidden by redeploying `main`. The database objects from `0003` can stay in place (patient
features do not depend on them). Dropping them is destructive and must not be done without a backup and approval.
