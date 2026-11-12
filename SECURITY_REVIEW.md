# Security Review and Hardening

**Date:** 2026-11-12. **Branch:** `security-hardening`, deployed as a preview only. Production is unchanged until the owner approves.

**Scope:** auth, secrets, data, network, files, inputs, packages and payments, for AFTERCARE AI: Next.js 16 on Vercel, with Supabase for Auth, Postgres and Storage.

## Findings fixed in this review

| # | Severity | Finding | Fix | Verified by |
| --- | --- | --- | --- | --- |
| F1 | **Medium** | Supabase session cookies were **not HttpOnly and not Secure**, because they were created by the browser client: any script injected into the page could read the session token. | Sign-in, sign-up, sign-out and password changes now run on the server (`/api/auth/*`). Cookies are `HttpOnly; Secure (prod); SameSite=Lax`, with a 7-day maximum. There is no Supabase client or token left in browser code. | Unit test on the cookie attributes; code search confirms no browser client remains. |
| F2 | **Medium** | Supabase's own minimum password length was **6**, while the app required 8. Anyone calling the Supabase API directly with the public key could create weaker passwords. | Set to **8** in Supabase Auth. The server also validates 8–72 characters, because bcrypt ignores bytes beyond 72. | Dashboard value re-read after save; unit and E2E validation tests. |
| F3 | Low | Email confirmation and reset links were valid for **60 minutes**. | Set to **15 minutes** (`MAILER_OTP_EXP=900`). Supabase links are single-use. | Dashboard value re-read after save. |
| F4 | Low (bug) | Email-confirmation links landed on `/onboarding?code=…` and the code was never exchanged, so users had to sign in manually after confirming. | Added `/auth/callback`, which exchanges the one-time code. Forged, used or expired codes are rejected and the user is redirected to a clear message. | E2E: a forged code leads to `/login?reason=link-invalid`. |
| F5 | Low (gap) | There was no password-reset flow at all. | Added `/forgot-password` → single-use 15-minute link → `/reset-password`. Changing the password signs out every other session. The same reply is given whether or not the email exists. | E2E checks the pages; routes are rate-limited. |
| F6 | Low | There was no explicit CSRF defence; the app relied on SameSite and JSON content types. | The proxy rejects cross-site POST, PATCH, PUT and DELETE requests based on the `Origin` and `Sec-Fetch-Site` headers (OWASP's recommended defence alongside SameSite cookies). | E2E: 5 endpoints return 403 for `Origin: https://evil.example`; unit tests cover the decision logic. |
| F7 | Low | There was no general API rate limit, no failed-login monitoring, and no security logging. | Proxy: 300 requests per minute per IP (5 per second average), returning **429** with `Retry-After`.<br>Per-endpoint limits: login 20 per 10 minutes per IP and 10 per 15 minutes per account; sign-up 5 per hour; reset 3–5 per hour.<br>**5 failed logins in 60 seconds** from one IP logs `suspicious_login_activity` and blocks with 429.<br>Structured security events are written to the Vercel logs, with emails and IPs one-way hashed. | E2E: 429 and `Retry-After`; unit test for the burst detector. |
| F8 | Moderate (deps) | 6 production advisories (`deepmerge`, `minimatch` via the `shadcn` CLI, which was a runtime dependency only for one stylesheet) and 7 development advisories (`minimatch` via `typescript-eslint`). | Copied the MIT-licensed stylesheet into the project and removed the `shadcn` package. Added an override pinning `minimatch` to the fixed 11.0.8. | `npm audit`: **0 vulnerabilities** (production and development). |
| F9 | Info | "Secure password change" (requiring a recent sign-in) was off in Supabase. | Turned on. | Dashboard value re-read after save. |
| F10 | Info | Errors and missing pages used Next.js's bare default pages. | Generic `error.tsx`, `global-error.tsx` and `not-found.tsx`, which show no details or stack traces, only an opaque reference ID. | E2E: custom 404 page. |

**No critical or high-severity issues were found.**

## Checklist

| # | Item | Status | Notes |
| --- | --- | --- | --- |
| 1 | Proper authentication | ✅ | Supabase Auth with email confirmation required, server-side login (F1), 8–72 character passwords (F2), rate limits (F7), no account enumeration in login, sign-up or reset replies, and secure email and password change. |
| 2 | API keys server-only | ✅ | Gemini and service-role keys are read only in server modules (`server-only`). The browser receives only the Supabase **publishable** key, which is designed to be public and protected by RLS. Checked on every build by the bundle secret-scan test. |
| 3 | Owner-only database access | ✅ | RLS is on all 11 tables (verified live). Policies require `user_id = auth.uid()`, and child rows also check that the parent plan and document belong to the same user. Storage is a private bucket scoped to the user's folder. Anonymous REST and storage requests return nothing (verified live). |
| 4 | HTTPS enforced | ✅ | Vercel 308-redirects HTTP to HTTPS (verified live). HSTS is set for 2 years with subdomains, plus `upgrade-insecure-requests` in the CSP. Supabase is HTTPS-only. |
| 5 | Argon2id password hashing | ➖ | AFTERCARE AI never stores or hashes passwords itself. Supabase Auth stores them as **bcrypt** hashes, a one-way, salted algorithm that OWASP still lists as acceptable, and it cannot be changed to Argon2id on Supabase. Writing a custom password store just to use Argon2id would add far more risk than it removes. The 72-character limit is enforced because of bcrypt. |
| 6 | Server-side form validation | ✅ | Every API route validates input with Zod: types, enums, lengths (for example display name ≤ 80, notes ≤ 500, corrections ≤ 2000), dates, UUIDs, and file size and type. Consents must be literally `true`. Out-of-range values return 400. E2E test `server-side validation…`. |
| 7 | XSS protection | ✅ | React escapes all output. There is no `dangerouslySetInnerHTML`, `innerHTML` or `eval` (verified by search). The CSP blocks third-party scripts, `object-src` and framing. E2E test: a `<script>` and `onerror` payload saved as a correction renders as visible text, with no script, image or alert. |
| 8 | Log and monitor suspicious activity | ✅ / ⚠️ | F7 adds security events: failed logins, login bursts, rate limits, CSRF blocks, rejected uploads, password resets and changes. Supabase also keeps Auth audit logs. **Limitation:** events go to Vercel runtime logs, which have short retention on the free plan and no automatic alerting. Real alerting needs a log drain (a paid feature). |
| 9 | Admin routes locked by role | ➖ | The app has **no admin routes or roles**. Every user can see only their own data. If an admin area is ever added, it should check a server-side role claim and return 403. |
| 10 | Parameterized queries | ✅ | All database access goes through supabase-js and PostgREST, which sends values as parameters. The app builds no SQL strings from user input. The single `.or()` filter uses a server-generated timestamp only. |
| 11 | No secrets in client bundle | ✅ | The bundle secret-scan test runs in CI. Only `NEXT_PUBLIC_*` values (Supabase URL, publishable key, legal contact) reach the browser. |
| 12 | Rate limiting | ✅ / ⚠️ | F7. **Limitation:** the counters are in memory per server instance, so on serverless hosting the limit is best-effort. A shared store (for example Upstash Redis or Postgres) would make it exact. Supabase enforces its own Auth limits (30 sign-ins per 5 minutes per IP; 2 emails per hour). |
| 13 | Restrict CORS | ✅ | The API sends **no** CORS headers, so browsers block every other origin from reading responses (same-origin only, the most restrictive setting). Preflight requests from other origins receive no `Access-Control-Allow-Origin`. The app's own domain is `aftercare-ai-pi.vercel.app`. E2E-tested. |
| 14 | Security headers | ✅ | CSP, HSTS, `X-Frame-Options: DENY`, `nosniff`, Referrer-Policy, Permissions-Policy, COOP and CORP; `X-Powered-By` removed. E2E-tested; OWASP ZAP passes. |
| 15 | Secure session cookies | ✅ | F1: `Secure; HttpOnly; SameSite=Lax`. The demo-mode flag cookie stays script-readable by design: it holds only `1` and no personal data, and is `Secure` on HTTPS. |
| 16 | CSRF protection | ✅ | F6: Origin and Sec-Fetch-Site enforcement plus SameSite=Lax cookies. There are no cookie-authenticated HTML form endpoints, so a separate synchroniser token is not needed. |
| 17 | Password-reset links expire (15 min, single-use) | ✅ | F3 and F5. |
| 18 | Restrict file uploads | ✅ | PDF, JPEG and PNG only, checked by the file's actual bytes, not its name. Maximum 10 MB, enforced in the app and by the bucket. Server-generated storage paths. Disguised files are deleted, and rejections are logged. |
| 19 | Server-side price verification | ➖ | The app has no payments or prices. |
| 20 | Production debug mode off | ✅ | Production build. API errors return `{code, message}` with no stack traces (E2E-checked). Custom generic error pages (F10). Server logs never include document content or credentials. |
| 21 | Update vulnerable dependencies | ✅ | F8: `npm audit` reports 0. |
| 22 | Remove unused packages | ✅ | `depcheck` found no unused packages. The `shadcn` CLI was removed from runtime dependencies (F8). |
| 23 | Block exposed files | ✅ | Vercel serves only `public/` and build output. `/.env*`, `/.git/config` and `/.git/HEAD` returned 404 on production. A further 15 sensitive paths return 404 in the E2E suite. During live probing, Vercel's bot protection began challenging the scanner, which was itself a useful defence. |
| 24 | Scan git history for secrets | ✅ | Pattern scan of all 16 commits: no API keys, secret keys, JWTs, private keys or tokens. The only `.env*` file ever committed is `.env.example`, with empty values. **gitleaks** now scans the full history in CI on every run, and passed. |
| 25 | Revoke and replace compromised keys | ✅ / ⚠️ | **No key was found exposed** in code, history, logs or the client bundle. Recommended precaution: the owner's Gemini key was used with the free-tier Strix experiment and is still stored as the unused `LLM_API_KEY` GitHub secret. Delete that secret, and rotate the key in Google AI Studio if you keep using it. The Supabase publishable key is public by design and does not need rotating. |
| 26 | Thorough security review | ✅ | This document, plus `QA_REPORT.md` (ZAP and headers) and `SECURITY_AUDIT.md` (the Strix attempts). |
| 27 | Test the protections and report | ✅ | See below. |

## Test results

| Suite | Result |
| --- | --- |
| Unit and integration (Vitest) | **102 passed**, 2 skipped (live cross-user RLS test; needs owner-created test accounts) |
| End-to-end (Playwright, production build) | **46 passed**, including 9 security tests: CSRF ×2, CORS, 429 rate limit, sensitive files, server-side validation, XSS, auth links, 404 page |
| Security suite repeated 3× | 27/27 passed |
| CI on `security-hardening` (run 43277744404) | ✅ lint, types, tests, E2E · ✅ Lighthouse · ✅ OWASP ZAP baseline · ✅ gitleaks |
| `npm audit` | 0 vulnerabilities |
| Preview deployment checks | `accounts: true` · cross-site POST returns 403 · invalid input returns 400 · forged auth code redirects to an error · `/.env` returns 404 · reset page renders |

**Not yet verified:**
- **A real sign-up, sign-in and sign-out through the new server-side flow.** Creating accounts on a deployed site is something only the owner can do, so it must be tested on the preview before production. Until then, the HttpOnly and Secure attributes of real session cookies have not been observed directly; they are configured in code and covered by a unit test.

## Remaining risks

1. **Rate limits are per instance.** They are best-effort on serverless; use a shared store if abuse appears.
2. **No alerting on security events.** Logs exist, but nobody is notified automatically; that needs a log drain or a monitoring service.
3. **Supabase free-plan limits.** Leaked-password protection and custom SMTP (needed for higher email volume) are paid features.
4. **The CSP allows inline scripts.** This is required by Next.js static rendering; nonces would require fully dynamic rendering.
5. **AI processing is off.** When it is enabled, prompt-injection defences exist (structured output, validation, sanitisation, injection detection) but have not been tested against the live model in production.
