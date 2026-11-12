# Clinical safety

AFTERCARE AI organizes documented discharge instructions. It does **not** diagnose, prescribe, change treatment,
predict recovery or replace clinical judgement or emergency care. This document describes how the clinic portal
enforces that, and what still needs a qualified clinical safety lead.

> Status: technically implemented and tested by the development team. **Not clinically validated, not reviewed by a
> clinical safety officer, and not approved for real-patient use.**

## Four kinds of information, kept separate

| Kind | Where it comes from | How it is shown |
|---|---|---|
| 1. Clinician-documented, **approved** instructions | A plan version a clinical reviewer approved | Patient Care-team area: "Approved by {clinician} at {clinic} on {date}", documented wording only |
| 2. AI-extracted, **awaiting review** | Draft and pending versions | Clinic portal only. Never visible to patients (RLS) |
| 3. General educational content | Plain-language rewrites (patient's own uploads) | Patient's own plan only, labelled. **Not shown** in clinic-approved plans because no clinician reviewed it |
| 4. Patient-reported information | Acknowledgements, task completion, attendance reports, questions | Labelled "reported by patient"; kept separate from staff-verified status |

## Safeguards in the workflow

- **No inference.** The extraction prompt forbids inferring doses, frequencies, durations, timings or dates; the
  sanitizer removes values not supported by the verbatim excerpt; missing values are shown as "Not documented".
  Clinician editing forms say the same and save empty fields as empty.
- **Provenance.** Every extracted item shows its source document, page and verbatim excerpt next to it.
- **Uncertainty and conflict.** Ambiguous text, missing information and cross-document disagreements create open
  flags. Conflicting items are marked and never auto-resolved.
- **Approval gate.** A version cannot be submitted or approved with open flags or no content. Approval requires an
  active clinical reviewer, an explicit attestation ("I have compared this plan with the source documents…"), and is
  recorded with clinician id, name, version and time. Rejection and change requests require a comment.
- **Immutability.** Approved versions cannot be edited. Any change starts a new version that needs a new approval;
  the previously approved version remains visible until then. Approval can be withdrawn, which hides the plan.
- **Patients cannot change instructions.** They can acknowledge, mark tasks done and report attendance; database
  policies prevent any change to plan content.
- **Prompt injection** in a document is ignored and raises a flag that blocks approval.

## Urgent symptoms

- Patient questions are screened with a conservative keyword list (`src/lib/clinic/urgent.ts`, English, Roman Urdu
  and Urdu). A match **immediately** shows emergency guidance to the patient and marks the question for staff. A
  non-match is never treated as "safe", and the system never reassures.
- Default guidance (Pakistan): *call Rescue 1122 or Edhi 115, or go to the nearest emergency department*. Each clinic
  can add its own emergency instructions and communication hours in Clinic settings.
- The question channel states that it is not an emergency service and does not promise response times.
- There is no AI chatbot in the clinic workflow.

## Requires a qualified human before any real-patient use

1. **Clinical safety lead** to review and approve: the urgent-keyword list, emergency wording, escalation procedure
   for flagged questions, and this document (hazard log / clinical risk management).
2. **Urdu content:** the patient app's AI Urdu rewrites are labelled as unreviewed; clinic-approved plans are shown in
   the documented wording only. Any Urdu clinical content must be reviewed by a qualified bilingual clinician.
3. **Educational content governance:** no general educational content is attached to clinic plans. If added later it
   needs a documented clinical governance process.
4. **AI accuracy evaluation** on de-identified real documents from the pilot department, with acceptance criteria
   agreed by clinicians (the current evaluation uses synthetic documents only).
5. **Training** for reviewers on what approval means and on the source-comparison workflow.
6. **Incident process** for errors found after approval (withdraw approval → correct → re-approve → inform patient).
