# Architecture

One Next.js 16 (App Router) application serves both the UI and the API. No other services.

```
Browser ──► Next.js pages (client components, static shells)
   │
   ├─ demo mode ──► LocalBackend (localStorage + IndexedDB) ──► POST /api/extract (stateless AI, optional)
   │
   └─ account mode ─► ApiBackend ──► Route Handlers ──► Supabase (Postgres + RLS, private Storage)
                                          │
                                          └──► Gemini (@google/genai) ──► Zod ──► safety post-processing
```

## Multi-tenant clinic portal (branch `clinic-portal`)

```
 Clinic staff (/clinic/*)                    Patient (/care-team, /invitation)
        │  client pages + useApi()                 │
        ▼                                          ▼
 /api/clinic/* ── requireClinic(permission)   /api/care-team/*, /api/invitations/redeem
        │   org = caller's active membership       │   requireUser()
        │   (never from the request)               │
        ▼                                          ▼
 Supabase with the CALLER's session ──► RLS (private.is_staff / is_reviewer / is_patient …)
        │                               SECURITY DEFINER RPCs for approvals, invitations, roles, versions
        │                               triggers guard tenant columns, plan status and approved versions
        ├──► Storage: clinic/{org}/{patient}/{uuid}.ext (staff of org; patient only if shared)
        └──► Gemini pipeline (existing): extract → Zod → sanitize → applyExtraction() into a DRAFT plan version
```

- **Plan versions** store the same `PlanBundle` the patient app uses (`plan_versions.bundle`), so extraction, conflict
  detection, provenance and editing logic are shared. Clinician edits go through `src/lib/clinic/plan-editing.ts`.
- **Approval** is a database transition (`decide_plan_version`) available only to active clinical reviewers; it sets
  `recovery_plans.approved_version_id`, which is the only version a patient can read.
- **Patient integration** is additive: the existing patient app is unchanged; linked patients get a Care-team page that
  renders approved versions read-only and records progress, attendance reports and questions.
- Details: [DATABASE_SCHEMA.md](DATABASE_SCHEMA.md), [SECURITY.md](SECURITY.md), [API_DOCUMENTATION.md](API_DOCUMENTATION.md).

| Clinic layer | Location |
|---|---|
| Roles/permissions (mirrors DB) | `src/lib/clinic/permissions.ts` |
| Tenancy context, RPC helper, audit events | `src/lib/clinic/server.ts` |
| Clinician plan edits, approval readiness | `src/lib/clinic/plan-editing.ts` |
| Clinic queries | `src/services/clinic-service.ts`, `src/services/clinic-documents.ts` |
| Routes | `src/app/api/clinic/**`, `src/app/api/care-team/**`, `src/app/api/invitations/redeem`, `src/app/api/notifications/**` |
| UI | `src/app/clinic/**`, `src/components/clinic/**`, `src/app/(app)/(shell)/care-team/**`, `src/app/invitation` |

## Layers

| Layer | Location | Notes |
| --- | --- | --- |
| Schemas | `src/schemas/` | Zod is the single source of truth. The Gemini `responseJsonSchema` is generated from the same Zod schema. |
| Domain logic (pure) | `src/lib/domain/` | Applying an extraction, conflict detection, item patches + corrections, plan summary, timeline, doctor questions. Runs identically in the browser (demo) and on the server (account). |
| AI | `src/lib/gemini/` | Server-only client, prompts, retries/timeouts, explanation layer, deterministic test extractor. |
| Security | `src/lib/security/` | Magic-byte file sniffing, storage path builder, UUID checks, rate limiting. |
| Persistence | `src/services/plan-repository.ts` | Supabase queries with the *user's* session (RLS enforced). The service-role key is only used for account deletion. |
| API | `src/app/api/**` | Typed handlers, `{ error: { code, message } }` on failure, no stack traces. |
| Client state | `src/hooks/use-plan.tsx`, `src/lib/client/` | `PlanBackend` interface with `LocalBackend` and `ApiBackend`. |
| PDF | `src/lib/pdf/` | `pdf-lib` builder shared by the browser (demo) and `GET /api/export/[id]`. |

## Data model

`supabase/migrations/0001_init.sql` creates `profiles`, `care_plans`, `documents`, `medications`,
`recovery_tasks`, `follow_ups`, `warning_signs`, `review_flags`, `corrections`, `extraction_runs`,
plus the private `medical-documents` bucket.

Deviations from the original brief, with reasons:

- `follow_ups.scheduled_at` → `scheduled_date date` + `scheduled_time time null`, so a date-only
  appointment never gains an invented time.
- `warning_signs`, `review_flags` (uncertainties + conflicts) and `corrections` (audit of patient
  edits) are separate tables because they have different lifecycles from tasks.
- Every child row carries `user_id`; RLS checks both `user_id = auth.uid()` *and* that the parent
  care plan / document belongs to the same user.

## Upload & processing flow (account mode)

1. `POST /api/documents/upload` validates the claimed name/type/size, creates a `documents` row and
   returns a signed upload URL for `/{uid}/{planId}/{uuid}.{ext}` (server-generated name).
2. Browser uploads with `XMLHttpRequest` (real progress, abortable) directly to Storage — avoids
   the Vercel request-body limit.
3. `POST /api/documents/[id]/finalize` downloads the object, sniffs magic bytes and size, and
   deletes it if it is not a real PDF/JPEG/PNG.
4. `POST /api/documents/[id]/process` streams NDJSON stage events as they actually happen:
   `reading → extracting → validating → explaining → saving → done|error`.

## AI pipeline

1. `generateContent` with the document inline, a system instruction that treats the document as
   untrusted data, `responseMimeType: application/json` and a JSON schema derived from Zod.
2. `JSON.parse` + `ExtractionSchema.safeParse` — any failure ⇒ `invalid_model_response`, nothing saved.
3. `sanitizeExtraction` — normalizes dates, flags unsupported numeric values, missing evidence,
   embedded instructions.
4. `applyExtraction` maps to domain rows (all `needs_review`), then `detectConflicts` runs across the
   whole plan.
5. Optional explanation call; each explanation must preserve every number in the original.

Transient errors (429/5xx/timeouts) are retried twice with backoff; validation failures are not retried.
