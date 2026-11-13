# Security audit (2026-11-13, branch `security-audit`)

Scope: the whole repository (patient app, clinic portal, AI providers, database migrations, CI) and, read-only, the
production site's response headers and public paths. Dynamic tests ran against a **local build** connected to the
separate Supabase **test** project. No destructive testing; nothing deployed; no production data touched. No compliance
claim is made. Secrets found during scanning are reported by location only and were never printed.

## Summary

| Severity | Confirmed | Fixed | Open |
|---|---|---|---|
| Critical | 0 | — | 0 |
| High | 2 (AUD-01 account deletion, AUD-05 AI field integrity) | 2 | 0 |
| Medium | 5 (AUD-02, -07, -08, -12, -13) | 5 | 0 |
| Low / hardening | 4 (AUD-06, -09, -10, -14) | 4 | 0 |
| Risks accepted / documented | 4 (AUD-03, AUD-04, R-1…R-5 below) | — | documented |

No cross-tenant exposure, authentication bypass, privilege escalation, unauthorized approval or injection was found.

## Findings

Fixed findings are detailed (root cause, fix, regression test) in [REMEDIATION_LOG.md](REMEDIATION_LOG.md):

- **AUD-01 (High)** — linked clinic patients could not delete their account (check constraint violated by ON DELETE SET NULL). Reproduced, fixed, tested.
- **AUD-05 (High, clinical)** — model commentary in medication text fields was not detected. Fixed with a wording check.
- **AUD-02 (Medium)** — clinic owners could delete their account and orphan the clinic. Now refused.
- **AUD-07 (Medium)** — staff can edit draft plan content via the Data API without attribution. Now stamped + audited in the DB.
- **AUD-08 (Medium)** — anonymous demo AI endpoint could exhaust the shared quota. Overall cap added.
- **AUD-12 (Medium, clinical)** — within-document activity contradictions missed by the model. Deterministic rule added.
- **AUD-13 (Medium)** — empty PATCH bodies produced 500s (fuzzer). Now 400.
- **AUD-06, -09, -10, -14 (Low)** — stuck clinic uploads not cleaned; framework errors swallowed; `//host` notification links; missing `X-Permitted-Cross-Domain-Policies`.

Documented, not changed:

| ID | Severity | Finding | Why it is accepted / what to do |
|---|---|---|---|
| AUD-03 | Low (deployment-dependent) | Rate limits key on the first `X-Forwarded-For` address (`src/lib/security/audit-log.ts`). | Vercel overwrites this header with the real client IP, so it cannot be spoofed there. If hosted elsewhere, read the platform's trusted client-IP header instead. |
| AUD-04 | Info | Production `HEAD /` responses omit the security headers (GET responses have the full set — verified). | Vercel edge behaviour; browsers use GET. No action. |
| R-1 | Low | CSP allows `'unsafe-inline'` scripts (Nuclei `weak-csp-detect`). | Required by Next.js unless every page is rendered per request with a nonce, which conflicts with the static pages. Revisit if static rendering is dropped. |
| R-2 | Medium → resolved when configured | Rate limits were in-memory per server instance. | Shared Upstash Redis limiter added (hashed keys, falls back to in-memory if unavailable); active once `UPSTASH_REDIS_REST_*` is set in production. |
| R-3 | Medium | No malware scanning of uploads. | Files are type-checked by magic bytes, never executed or rendered server-side, stored privately. Add a scanner before real patient documents. |
| R-4 | Low | Sign-up reveals that an email is registered (owner's choice). | Supabase's own sign-up API reveals it anyway while email confirmation is off. |
| R-5 | Low | Rejected uploads by non-admin staff may leave an orphaned object in private storage. | Not readable by patients or other clinics; clean up periodically. |

## Coverage of the required checks

| Area | Result | Evidence |
|---|---|---|
| Authentication (unauthorized pages, bypass, expired/invalid sessions, reset, enumeration, logout) | Protected pages redirect; every protected API returns 401 without a session; generic login errors; logout is server-side | `tests/e2e/security.spec.ts`, `clinic.spec.ts`, `tests/live/api-fuzz.spec.ts` |
| Multi-tenant isolation (patients, documents, extractions, follow-ups, staff, audit, notes) | Clinic B gets 404 on every Clinic A resource via the API; RLS refuses at the database; composite FKs make cross-tenant references impossible | DB security suite (39), pgTAP (31), live workflow test 11 |
| Identifier manipulation | Random/foreign/malformed IDs → 400/404, never data | API fuzz (2,982 requests, 4 identities) |
| Patient privacy (downloads, public buckets, URLs, logs, errors, caching) | Private bucket; no public URLs; `no-store`; DB errors logged as codes; no stack traces in responses | Fuzz leak checks, header checks, code review |
| RBAC (patients, staff, clinicians, admins, revoked users) | Nurse/owner/patient cannot approve; admins cannot promote admins; revocation immediate | DB suite, live workflow |
| File uploads (oversized, extensions, MIME spoofing, empty, corrupted, interrupted, duplicate, cross-clinic) | All rejected or handled safely; concurrent processing guarded | `tests/live/api-fuzz.spec.ts` › upload abuse (5/5) |
| AI clinical safety | See [AI_SAFETY_AUDIT.md](AI_SAFETY_AUDIT.md) | Promptfoo, unit, integration |
| Secrets | No secrets in git history or the browser bundle | Gitleaks, TruffleHog, bundle scan |
| Dependencies | 0 known vulnerabilities | npm audit, OSV-Scanner, Trivy |
| Production surface (read-only) | Full security headers on GET; sensitive paths 404; no CORS granted; clinic APIs not deployed | curl checks |

## Tool results

| Tool | Result |
|---|---|
| Semgrep 1.185 (OWASP, TS, React, Next.js, nodejsscan, secrets, SQLi, JWT; 228 rules, 248 files) | 2 findings, both false positives (annotated) → 0 |
| Gitleaks 8.30.1 | History (34 commits, all branches): 0. Working tree: 13 hits, all in gitignored local env files and `.next/` build output — not in the repository |
| TruffleHog 3.99.7 | 0 |
| OSV-Scanner 2.7.0 / npm audit / Trivy 0.76.1 | 0 / 0 / 0 |
| Checkov | 184 passed, 0 failed (GitHub Actions) |
| Nuclei 3.11.1 (non-intrusive, local) | 6 informational (2 header suggestions → 1 fixed, CSP note, tech detection) |
| pgTAP 1.3.4 (in PGlite) | 31/31 |
| CodeQL | Not run locally (needs a large CLI); added to CI (`security.yml`) |
| OWASP ZAP | Runs in CI (`ci.yml`, baseline); not run locally (no Java/Docker) |
| SonarQube | Not run: requires a server; Semgrep + CodeQL cover the security rules |
| Schemathesis | Not run: the app has no OpenAPI schema; replaced by the route-discovery fuzzer |
