# Demo script (about 2 minutes)

**Setup:** run `npm run build` and `npm start` with `GEMINI_API_KEY` set. Keep `public/samples/synthetic-discharge-summary.pdf` and `synthetic-prescription.pdf` ready to upload. All documents are synthetic, for a fictional patient. Without a key, use step 1b (the labelled sample plan).

| Time | Show | Say |
| --- | --- | --- |
| 0:00 | Landing page | "Jordan, a fictional patient, is going home after an appendix operation with a stack of papers. AFTERCARE AI organizes what their care team wrote. It doesn't add medical advice." Scroll to the *does / does not* section. |
| 0:15 | **Try the demo**, then choose **Upload synthetic documents** | "Demo mode keeps everything in this browser. We only ask for a name and a language." |
| 0:25 | Drag in the discharge summary and the prescription | "The files are checked by their actual bytes. A renamed text file is rejected." The progress bars complete. |
| 0:35 | Click **Process** on the discharge summary | "These stages are real server steps: reading, extracting with Gemini, validating, and writing plain-language explanations." Then process the prescription. |
| 0:55 | **Review**, then **Uncertain & conflicting** | "The discharge summary says the antibiotic is twice a day; the prescription says three times a day, with no duration. AFTERCARE AI does not choose between them. It flags the conflict and blocks confirmation until Jordan has spoken to the pharmacist." Point out the greyed-out Confirm button. |
| 1:10 | Ibuprofen card, then **Source** | "Every item shows the exact sentence it came from." Close it, click **Correct**, change *Timing*, save. "The correction is recorded alongside the original value." Then click **Matches my document**. "Confirmed by the patient, which is clearly not the same as clinician approval." |
| 1:25 | **Today** dashboard | Tick "Keep the wounds clean and dry". "Ticking is for tracking only; it never says Jordan is recovering normally." Point to the warning signs and the questions for the care team, such as "How long should I take…?" |
| 1:40 | **Appointments** | "The General Surgery review on the documented date. Appointments without a date are listed separately, never placed on the calendar." |
| 1:50 | **Settings**, switch to Urdu, open Medications | "Plain-language explanations in Urdu, keeping every number. An explanation that changes a number is thrown away." |
| 1:55 | **Export PDF summary** | "A printable summary for Jordan and their carers. Unconfirmed and conflicting items are clearly marked, with the required notice at the top." |

**Step 1b (no API key):** on onboarding choose **Explore the sample plan**. Everything is labelled *Sample data — precomputed, not a live AI extraction*. Follow the same review, dashboard and export steps.
