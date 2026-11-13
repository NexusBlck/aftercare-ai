# AFTERCARE AI

AFTERCARE AI turns the documents a patient brings home after surgery (discharge summary, prescription, wound-care sheet, follow-up letter) into an organized recovery plan the patient reviews themselves.

```
UPLOAD → EXTRACT (Gemini) → VALIDATE (Zod + safety rules) → REVIEW → UNDERSTAND → ORGANIZE → TRACK → EXPORT
```

> **Educational prototype.** AFTERCARE AI organizes instructions a care team has already written. It does not diagnose or prescribe, it is not for emergencies, and it has no clinical validation or regulatory approval. All demo and test data is synthetic and belongs to a fictional patient.

## Two interfaces, one backend

| | Patient app (existing) | Clinic portal (`clinic-portal` branch, not yet deployed) |
|---|---|---|
| Who | A patient organizing their own discharge papers, or a patient invited by a clinic | Clinic owners, administrators, clinicians, nurses |
| Entry | `/`, `/demo`, `/signup`, `/dashboard` … `/care-team` | `/clinic/register`, `/clinic/dashboard`, `/clinic/join` |
| Key idea | The patient reviews their own documents | AI organizes documented instructions → **a clinician reviews and approves** → the patient sees only the approved version |

Clinic portal features: clinic registration and onboarding, staff invitations and roles, patient directory with
search and pagination, care episodes, private document upload, AI extraction with source provenance, clinical review
queue with corrections, flags, attested approval and versioning, secure patient invitations (hashed one-time tokens +
date-of-birth check), follow-up tracking (patient-reported vs verified), patient questions with an urgent-symptom
screen, in-app notifications, an append-only audit log, and manual subscription plans with enforced limits.

Docs: [ARCHITECTURE.md](ARCHITECTURE.md) · [DATABASE_SCHEMA.md](DATABASE_SCHEMA.md) · [SECURITY.md](SECURITY.md) ·
[CLINICAL_SAFETY.md](CLINICAL_SAFETY.md) · [API_DOCUMENTATION.md](API_DOCUMENTATION.md) · [TESTING.md](TESTING.md) ·
[DEPLOYMENT.md](DEPLOYMENT.md) · [PILOT_READINESS.md](PILOT_READINESS.md) · [PROGRESS.md](PROGRESS.md)

## What it does (patient app)

- **Upload**: PDF, JPG and PNG files up to 10 MB each, by drag-and-drop or file browser. It shows upload progress and lets you cancel. Files are checked by their actual bytes, not their name.
- **AI extraction**: a server-side Gemini call with structured JSON output extracts encounter details, medications, wound care, activity, diet, follow-ups, warning signs, uncertainties and conflicts. Every item keeps its page number and the exact excerpt it came from.
- **Validation**: every model response is checked with Zod. Deterministic safety rules then:
  - remove values whose numbers don't appear in the excerpt
  - reject incomplete dates and any year the document doesn't state
  - flag items with no supporting evidence
  - report text in the document that tries to give instructions (prompt injection)
- **Conflict detection**: if two documents give different schedules for the same medicine, or different dates for the same appointment, both versions are flagged. The app never picks one, and you can't confirm a conflicting item until you mark the conflict as discussed with your care team.
- **Human review**: each item has a status: *needs review*, *confirmed by you*, *ask your clinician* or *conflicting*. You can correct any item, and every correction is saved to an append-only audit trail. Your confirmation never counts as clinician approval.
- **Plain language**: a separate explanation layer in English and Urdu. An explanation that drops or changes a number is rejected, and the original wording is always shown.
- **Recovery experience**: dashboard, today's checklist, medication organizer (no invented dose times), timeline built only from documented dates, follow-up tracker, warning-signs panel, neutral questions for the care team, and a document library.
- **PDF export**: confirmed information is kept separate from unconfirmed and conflicting information, and the export includes the required notice.

## Quick start (no credentials needed)

**Windows, one click:** double-click **`Start AFTERCARE AI.bat`** in the project folder. On first run it installs dependencies and builds the app, which takes a few minutes. After that it starts in seconds and opens http://localhost:3000 in your browser. Keep its window open while you use the app, and close the window to stop it. After changing the code, delete the `.next` folder so the next launch rebuilds.

**Manual:**

```bash
npm install
```

```bash
npm run dev
```

Open http://localhost:3000 and choose **Try the demo**. The sample plan is precomputed from three synthetic documents and labelled **Sample data** throughout. It is not a live AI result. Demo data stays in your browser (localStorage and IndexedDB).

## Configuration

Copy `.env.example` to `.env.local` and fill in what you need. Every integration is optional, and the app shows a labelled state when one is missing.

| Variable | Purpose |
| --- | --- |
| `GEMINI_API_KEY` | Enables live document processing (server-only). |
| `GEMINI_MODEL` | Default `gemini-3.5-flash`. Run `npm run gemini:models` to see what your key can use. `gemini-2.5-flash` is no longer offered to new users. |
| `GEMINI_TIMEOUT_MS`, `GEMINI_THINKING_LEVEL` | Request timeout (default 90 s) and thinking level for Gemini 3+ (default `low`). |
| `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Enable accounts and persistence. |
| `SUPABASE_SERVICE_ROLE_KEY` | Optional and server-only. Used only to delete a user's auth account from Settings. |
| `MAX_UPLOAD_MB` | Per-file limit (default 10). |
| `AFTERCARE_AI_PROVIDER=mock` | **Tests only.** Turns on a deterministic test extractor that only recognises the synthetic fixtures. The UI labels it "Test extractor — not AI output". |

### Supabase setup

1. Create a Supabase project.
2. Apply `supabase/migrations/0001_init.sql`, either with `supabase db push` or by pasting it into the SQL editor. It creates the tables, the RLS policies and the private `medical-documents` bucket.
3. Under Authentication, enable email/password sign-in. Add `https://<your-domain>/onboarding` to the redirect URLs.
4. Set the two `NEXT_PUBLIC_SUPABASE_*` variables.

## Scripts

| Command | What it does |
| --- | --- |
| `npm run dev` / `build` / `start` | Development server, production build, production server |
| `npm run lint` / `npm run typecheck` | ESLint; generate Next.js route types, then `tsc --noEmit` |
| `npm test` | Vitest unit and integration tests |
| `npm run test:e2e` | Playwright tests against `next start` using the test extractor. **Run `npm run build` first.** |
| `npm run test:ai` | Live Gemini evaluation on 10 synthetic cases. Needs `GEMINI_API_KEY`. |
| `npm run fixtures` | Regenerates the synthetic PDF fixtures and `public/samples/` |
| `npm run gemini:models` | Lists the Gemini models available to your key |

The live RLS isolation test (`tests/integration/rls.test.ts`) runs only when `SUPABASE_TEST_URL`, `SUPABASE_TEST_ANON_KEY` and two test users' `SUPABASE_TEST_USER_{A,B}_{EMAIL,PASSWORD}` are set. Use a disposable project.

## Deploying to Vercel

1. Push the repository to GitHub and import it into Vercel. No build settings need changing.
2. Add the environment variables above. Never prefix secret variables with `NEXT_PUBLIC_`.
3. `POST /api/documents/[id]/process` declares `maxDuration = 300`, which needs a plan that allows long functions. On the Hobby plan (60 s), set `GEMINI_TIMEOUT_MS=45000`.
4. In account mode, files upload straight to Supabase Storage through signed URLs, so Vercel's request-body limit doesn't apply. The demo-only `/api/extract` endpoint does receive the file, so on Vercel it is limited to about 4.5 MB.

**Live demo:** https://aftercare-ai-pi.vercel.app (Vercel project `aftercare-ai`). It runs demo mode only: no Gemini key or Supabase project is configured, so uploads show "AI processing is not configured". Redeploy with `npx vercel deploy --prod` (use `npx.cmd` in PowerShell).

## Project structure

```
src/
  app/                 pages (landing, auth, onboarding, (app)/(shell)/*) and api/* route handlers
  components/          ui (shadcn), app shell, documents, recovery, shared, landing, auth
  hooks/use-plan.tsx   plan state + PlanBackend (demo LocalBackend / account ApiBackend)
  lib/domain/          pure logic: apply-extraction, sanitize, conflicts, patch, summary, questions, explanations
  lib/gemini/          server-only client, prompts, pipeline, response parsing
  lib/security/        file validation, storage paths, rate limiting
  lib/pdf/             recovery summary PDF (pdf-lib)
  lib/demo/            synthetic documents + sample plan
  lib/clinic/          clinic permissions, tenancy context, plan editing, DB error mapping, urgent screen
  components/clinic/   clinic shell, review workspace, uploader; components/care-team/ approved-plan view
  schemas/             Zod schemas (AI output, domain entities, request bodies, clinic requests)
  services/            Supabase repository and route helpers (patient + clinic)
supabase/migrations/   SQL schema, RLS, storage policies (0003 = multi-tenant clinic portal)
tests/                 unit, integration, db (PGlite RLS tests), e2e, ai, fixtures
```

CI (`.github/workflows/ci.yml`) runs lint, types, tests, Playwright with axe, Lighthouse and an OWASP ZAP baseline on every push. See `QA_REPORT.md`.

See `ARCHITECTURE.md`, `PROJECT_SPEC.md`, `PROGRESS.md` (verified status and limitations), `DEMO_SCRIPT.md` and `SUBMISSION_SUMMARY.md`.
