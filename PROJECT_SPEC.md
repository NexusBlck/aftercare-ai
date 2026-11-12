# AFTERCARE AI — Project Specification

## Purpose

AFTERCARE AI turns the documents a patient brings home after a hospital stay
(discharge summary, prescription, wound-care sheet, follow-up letter) into an
organized, reviewable recovery plan:

```
MEDICAL DOCUMENTS → AI EXTRACTION → ZOD VALIDATION → PATIENT REVIEW → RECOVERY PLAN → TRACKING → PDF EXPORT
```

It is an **educational document-organization prototype**. It is not a diagnostic,
prescribing, or emergency system, and it has no clinical validation or regulatory
approval.

## Primary user

An adult discharged after an uncomplicated surgical procedure (initial pathway:
laparoscopic appendectomy, synthetic data only).

## Modes

| Mode | When | Persistence | AI |
| --- | --- | --- | --- |
| Account | Supabase configured and user signed in | Postgres + private Storage, RLS | Gemini, server-side |
| Demo | Always available (`/demo`) | Browser only (localStorage + IndexedDB) | Sample plan is precomputed and labelled **Sample data**; uploads use live Gemini only if configured |
| Test extractor | `AFTERCARE_AI_PROVIDER=mock` (CI / E2E only) | n/a | Deterministic fixture output, labelled in the UI as *test extractor — not AI output* |

## Functional requirements (summary)

1. Landing page explaining what the product does and does not do.
2. Supabase email/password auth, protected routes, session refresh in `proxy.ts`.
3. Onboarding: display name, preferred language (English / Urdu), optional plan title.
4. Upload PDF/JPG/PNG (≤10 MB, configurable), magic-byte validation, progress, cancel, preview, delete.
5. Classification (8 types) with patient correction.
6. Gemini structured extraction: encounter, medications, wound care, activity, diet,
   follow-ups, warning signs, uncertainties, conflicts — every item with page + excerpt.
7. Zod validation of every model response; deterministic safety post-processing
   (unsupported values, missing evidence, invalid dates, cross-document conflicts).
8. Separate plain-language explanation layer (English + Urdu) with a number-preservation check.
9. Human review: `needs_review`, `confirmed_by_patient`, `needs_clinician_clarification`, `conflicting`.
   Patient corrections are recorded in an audit table. Patient confirmation ≠ clinician approval.
10. Dashboard, recovery plan, medications, appointments, documents, review, settings.
11. Questions for the doctor, generated deterministically from gaps and conflicts.
12. PDF export separating confirmed from unresolved information, with the mandated notice.

## Safety invariants (enforced in code and tests)

- A missing field stays `null`; the UI renders "Not stated in your documents".
- Medication values containing numbers absent from their supporting excerpt are flagged.
- Conflicts are never auto-resolved; they are surfaced and exported as unresolved.
- No medication times, healing timelines, or post-operative day schedules are generated.
- Date-only instructions are stored as `date`, never as timestamps with an invented time.
- Uploaded documents are untrusted input; embedded instructions are reported, not followed.
- Simplified explanations that drop or change a number are rejected and the original is shown.

See `ARCHITECTURE.md` for the design and `PROGRESS.md` for verified status.
