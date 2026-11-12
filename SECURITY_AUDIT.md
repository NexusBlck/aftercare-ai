# Security Audit — Strix

**Status: incomplete. Strix has not yet completed a scan, so no Strix findings exist to confirm or fix.**

## Setup

| Item | Value |
| --- | --- |
| Tool | [Strix](https://github.com/usestrix/strix) `strix-agent` 1.7.0 (official package) |
| Where it runs | GitHub Actions, `.github/workflows/strix.yml`, on branch `security-fixes` (Docker isn't installed on the development PC) |
| Targets | Repository source, and https://aftercare-ai-pi.vercel.app |
| Rules of engagement | `.strix/instructions.md`: owner-authorized scope only, non-destructive, no DoS, synthetic data only, no attacks on Vercel, Supabase or Google infrastructure |
| Model | `gemini/gemini-3.5-flash` using the owner's existing Gemini key (owner's choice) |
| Cost guard | `--max-budget 5` (USD) per run |
| Confidentiality | The repository is public, so Strix output is never printed to the Actions log. Reports are AES-256 encrypted before upload, and the passphrase is held only by the owner's machine and the `RESULTS_KEY` secret. |
| Retest trigger | Commits on `security-fixes` whose message contains `[run-strix]`, or a manual run |

## Scan history

### Run 1: failed, LLM quota exhausted
- **Run:** GitHub Actions [43222425556](https://github.com/NexusBlck/aftercare-ai/actions/runs/43222425556), 2026-11-12 12:57–13:09 UTC, standard mode, full scope.
- **Result:** Strix status `failed`, exit code 1. **0 findings, which does NOT mean the app is clean.**
- **Cause:** Google returned HTTP 429 `GenerateRequestsPerDayPerProjectPerModel-FreeTier`, with a limit of **20 requests per day** for this key and model.
  - Strix made 8 model requests (about 256k input tokens) before the quota ran out. Earlier testing that day had already used part of the daily allowance.
  - It ended during initial reconnaissance and planning, before any vulnerability testing.
- **Cost:** none billed (free tier).

## Confirmed vulnerabilities

None from Strix yet, because no scan has completed.

For context, separate from Strix: the earlier QA audit (`QA_REPORT.md`) found and fixed an open redirect, missing security headers and a demo cookie without the Secure flag. Those were found by OWASP ZAP and code review, not by Strix.

## Remaining risks and next steps

1. **A completed Strix scan is still needed.** The free-tier Gemini key can't support an agentic pentest. Options, all needing the owner's decision:
   - enable billing on the key's Google Cloud project;
   - use a different provider key, such as Strix's recommended `openrouter/z-ai/glm-5.3`;
   - use Strix Cloud.
2. **Supabase auth and RLS can only be reviewed from source.** The deployed demo has no Supabase project or Gemini key configured, so Strix can't test account isolation, storage access or live prompt injection against the running site. Doing that would need a disposable Supabase test project with synthetic test users.
