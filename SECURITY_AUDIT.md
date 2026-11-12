# Security Audit — Strix

**Status: blocked: no zero-cost model can run Strix (2026-11-12).** Two scans were attempted, and neither completed a single test, so no Strix findings exist to confirm or fix.

Strix needs a capable LLM. Both zero-cost options failed:
- The free-tier Gemini key is limited to 20 requests per day, and a scan needs hundreds.
- An open-weights model on GitHub's CPU-only runner was too slow to answer even Strix's first prompt.

The owner has decided not to incur any cost, so Strix scanning is paused. No vulnerabilities have been claimed, dismissed or fixed on the basis of Strix. The setup below is kept so a scan can run later if paid model access becomes available.

**Security testing that has been done instead** (free tools, see `QA_REPORT.md`):
- OWASP ZAP baseline: 0 failures, 0 warnings, 63 passed.
- Playwright security-header and API-safety tests, and a client-bundle secret scan.
- Unit tests for upload validation, storage paths and the open-redirect fix.
- Static checks on the RLS policies in the migration.

These are not a substitute for an agentic penetration test.

## Setup

| Item | Value |
| --- | --- |
| Tool | [Strix](https://github.com/usestrix/strix) `strix-agent` 1.7.0 (official package) |
| Where it runs | GitHub Actions, `.github/workflows/strix.yml`, on branch `security-fixes` (Docker isn't installed on the development PC) |
| Targets | Repository source, and https://aftercare-ai-pi.vercel.app |
| Rules of engagement | `.strix/instructions.md`: owner-authorized scope only, non-destructive, no DoS, synthetic data only, no attacks on Vercel, Supabase or Google infrastructure |
| Model | Run 1: `gemini/gemini-3.5-flash` (owner's free-tier key). Run 2 (current workflow): `ollama_chat/qwen3.5:9b` served by Ollama on the runner. Zero cost, no third-party account. |
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
- **Note:** Google's terms allow content sent through the unpaid Gemini API to be used to improve its products, and the owner later received a Google account notice. No user or patient data was sent; only the repository source and the public demo were in scope. The app now refuses to use any Gemini key not confirmed as paid tier (see `COMPLIANCE.md`, item 13).

### Run 2: failed, local model too slow on a CPU runner
- **Run:** GitHub Actions [43238884045](https://github.com/NexusBlck/aftercare-ai/actions/runs/43238884045), 2026-11-12 14:39–17:46 UTC, quick mode, full scope, `qwen3.5:9b` via Ollama (64k context) on a free `ubuntu-latest` runner with no GPU.
- **Result:** Strix status `failed`, exit code 1. **0 completed model requests and 0 findings, which does NOT mean the app is clean.**
- **Cause:** every model call hit Strix's idle timeout: "model stream produced no event for 300s", 4 times over about 3 hours. On CPU alone, the model could not process Strix's large initial prompt (roughly 60k tokens) quickly enough to start answering. Strix's own documentation warns that local models under 70B parameters struggle with its agent workflow and normally need a GPU.
- **Cost:** none (free GitHub Actions minutes on a public repository).

## Confirmed vulnerabilities

None from Strix yet, because no scan has completed.

For context, separate from Strix: the earlier QA audit (`QA_REPORT.md`) found and fixed an open redirect, missing security headers and a demo cookie without the Secure flag. Those were found by OWASP ZAP and code review, not by Strix.

## Remaining risks and next steps

1. **No Strix scan has completed.** Free resources cannot run it, and the owner has chosen not to pay. To resume later, any one of these would work:
   - a hosted model key with enough quota (put it in `LLM_API_KEY` and set `STRIX_LLM` in `.github/workflows/strix.yml`);
   - a machine with a capable GPU running a larger local model, plus Docker;
   - Strix Cloud.

   Then push a commit containing `[run-strix]` to `security-fixes`. Each run is capped by `--max-budget 5`.
2. **Live account testing needs test users.** Since this audit started, the live site has been connected to a free Supabase project (accounts on, RLS verified on all tables). A future Strix run could test account isolation live, but only with two synthetic test accounts created by the owner. AI prompt injection still can't be tested live, because AI processing is switched off.
3. **Unused secret:** the `LLM_API_KEY` repository secret still holds the owner's Gemini key, but the current workflow does not use it. The owner may delete it in GitHub → Settings → Secrets.
