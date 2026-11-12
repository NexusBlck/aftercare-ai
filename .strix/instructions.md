# AFTERCARE AI — Strix rules of engagement

## Authorization and scope
- The repository owner authorizes testing of ONLY:
  1. The source code in this repository (mounted as the code target).
  2. The deployed demo at https://aftercare-ai-pi.vercel.app (and its paths/APIs).
- Out of scope: any other host, Vercel or Supabase platform infrastructure, Google Gemini endpoints,
  third-party services, and other tenants. Do not attempt to attack vercel.com, supabase.co or
  googleapis.com.

## Safety rules
- Non-destructive testing only. No denial of service, load/stress testing, brute forcing at volume,
  or resource exhaustion. Keep request rates low (well under 1 request per second sustained).
- Use only synthetic data. The app ships synthetic fixtures for a fictional patient in
  tests/fixtures/documents and public/samples. Never submit real personal or medical data.
- Do not try to exfiltrate or use secrets you might discover; report them instead.

## Application context
- Next.js 16 App Router app. API route handlers live in src/app/api/**, proxy in src/proxy.ts.
- Supabase (Postgres + RLS, Auth, private Storage) is implemented in code but NOT configured on the
  deployed demo: account endpoints return 503 "accounts_unconfigured". Review auth, RLS policies
  (supabase/migrations/0001_init.sql), ownership checks and storage path handling from source.
- Gemini AI extraction is NOT configured on the deployed demo (POST /api/extract returns
  ai_unconfigured). Review the prompt-injection defenses from source (src/lib/gemini/*,
  src/lib/domain/sanitize.ts).
- Demo mode stores data in the visitor's browser (localStorage/IndexedDB) via the aftercare_demo cookie.

## Priorities
Authentication and session handling, authorization / IDOR, Supabase RLS and patient-data isolation,
document upload validation and storage paths, API input validation and error handling, exposed
secrets (including in client bundles), security headers / CSP, open redirects, and AI prompt injection.

## Reporting
For each finding give: affected file/endpoint, severity, a reproducible proof of concept that is safe
to run, and a suggested fix. Clearly mark findings you could not confirm dynamically.
