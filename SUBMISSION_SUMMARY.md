# AFTERCARE AI — Submission Summary

**Problem.** Patients leave hospital with several separate documents: a discharge summary, prescriptions, wound-care sheets and follow-up letters. They are full of abbreviations and medical terms, and they sometimes disagree with each other. Patients usually read them while tired and in pain. Gaps are easy to miss, such as a medicine with no stated duration, an appointment with no date, or two documents giving different doses.

**Target user.** An adult going home after an uncomplicated surgical procedure. The first pathway uses a synthetic laparoscopic-appendectomy case. The data model and AI schema are generic, so other discharge pathways can be added without a rewrite.

**Solution.** AFTERCARE AI turns the patient's own documents into a recovery plan they review themselves. Gemini reads each document and returns structured data. Every item is validated, linked to the exact sentence it came from, and shown to the patient as *needs review* until they check it. Confirmed information then drives a daily checklist, a medication organizer, a timeline, a follow-up tracker and a printable summary.

**Key features**
- Source-linked extraction of medications, wound care, activity, diet, follow-ups and warning signs
- Detection of missing, unclear and conflicting information, which is never resolved automatically
- Patient review with corrections and an audit trail; patient confirmation is never presented as clinician approval
- Plain-language explanations in English and Urdu that must keep every number from the original
- Neutral "questions for your care team" generated from the gaps found
- A PDF summary that separates confirmed from unresolved information
- A labelled synthetic demo that works without any credentials

**Technology.** One Next.js 16 app (App Router, TypeScript strict), Tailwind CSS 4 and shadcn/ui. Supabase provides Postgres with row-level security, Auth, and private Storage with signed uploads. Gemini (`@google/genai`) uses structured JSON output generated from the same Zod schemas that validate it. pdf-lib builds the export. Tests use Vitest (90 tests) and Playwright (9 end-to-end tests, desktop and mobile).

**Innovation.** The AI is wrapped in deterministic safety layers rather than trusted:
- Schema validation
- Numeric checks against the source text, so invented doses or durations are removed
- Year-inference checks on dates
- Cross-document conflict rules that block confirmation
- Detection of embedded instructions (prompt injection)
- Number checks on simplified explanations

The same pure domain functions run in the browser (demo) and on the server (accounts), so both modes follow identical rules.

**Safety considerations.**
- It is an educational organizer: it doesn't diagnose, prescribe or change medications, and it is not for emergencies.
- It never creates dose times, healing timelines or post-operative schedules.
- Date-only instructions never gain an invented time.
- Uploaded documents are treated as untrusted input.
- Warning signs come only from the patient's documents.
- There is no clinical validation, regulatory approval, or HIPAA/GDPR assessment, and none is claimed.

**Expected public benefit.** AFTERCARE AI could help patients and carers understand and organize the instructions they already have. It makes gaps and contradictions visible and prepares specific questions for the care team. No impact figures are claimed; measuring benefit would need a proper study.
