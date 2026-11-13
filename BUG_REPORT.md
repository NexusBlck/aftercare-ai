# Bug report (2026-11-13)

Confirmed bugs only — each was reproduced before fixing and has a regression test. Security-relevant root causes and
code changes are in [REMEDIATION_LOG.md](REMEDIATION_LOG.md).

| ID | Severity | Component | Reproduction | Actual | Expected | Status |
|---|---|---|---|---|---|---|
| AUD-01 | High | `clinic_patients` constraint (migration 0003) | Link a patient account through an invitation, then delete the auth user (what `/api/account` DELETE does with the service role) | `violates check constraint "clinic_patients_check"`; the account is not deleted; API reports `accountDeleted: false` | Account deleted; clinic record kept and unlinked | Fixed, `tests/db/clinic-security.test.ts` |
| AUD-02 | Medium | `/api/account` DELETE | Clinic owner deletes their account | Owner membership cascades away; clinic has no administrator | Refused until ownership is resolved; nothing deleted | Fixed |
| AUD-05 | High | Sanitizer | Model returns `frequency: "twice a probably need \"twice a day\"? Actually …"` (observed live with a small free model) | Value kept and shown as if transcribed | Value removed, item flagged for review | Fixed, `tests/unit/sanitize-wording.test.ts` |
| AUD-12 | Medium | Conflict detection | Process `synthetic-contradictory-activity.pdf` with Gemini 3.1 Flash-Lite | "Avoid lifting > 5 kg for 6 weeks" and "return to weight training after 2 weeks" both shown as normal instructions, no flag (2/2 runs) | Open conflict flag; both items "conflicting"; approval blocked until resolved | Fixed, `tests/unit/activity-conflicts.test.ts`, Promptfoo re-run 4/4 |
| AUD-13 | Medium | `PATCH /api/clinic/organization` (same pattern in patient and document PATCH) | Send `{}` or a body with only unknown fields | 500 `database_error` | 400 "There is nothing to update." | Fixed, API fuzz re-run |
| AUD-06 | Low | Retention job | Register a clinic upload and never send the bytes | Row stays `uploading` forever | Removed after 24 h | Fixed |
| AUD-09 | Low | Route wrapper | `next build` with accounts configured | Logs "[aftercare] unexpected error: During prerendering, cookies() rejects…" | Next.js control-flow errors are rethrown, not logged as failures | Fixed (0 occurrences) |

Audit-environment issues found and handled during testing (not product bugs): Semgrep's engine fails on Windows paths
containing spaces (ran from a space-free folder); Nuclei's resolver does not resolve `localhost` (scanned `127.0.0.1`);
the first Promptfoo run resolved the provider relative to the config file (fixed path).
