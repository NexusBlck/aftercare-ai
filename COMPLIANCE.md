# Legal and Compliance Checklist

**Status as of 2026-11-12, branch `legal-compliance`.**

> **Not legal advice.** These items were implemented by an engineer based on what the app actually does. Because AFTERCARE AI processes health information, have a qualified lawyer review the Privacy policy and Terms, in your country and in the countries you serve, before relying on them. Health data is "special category" data under the GDPR, "sensitive personal data" under many other laws, and may fall under health-specific rules (for example HIPAA only if you work with US covered entities).

**Legend:**
- ✅ done in the app
- ⚙️ done, but needs an owner action to take effect
- ➖ not applicable (the app has no such feature), with what would be required if that changes
- ⚠️ owner action required

## Legal basics

| # | Item | Status | Where / notes |
| --- | --- | --- | --- |
| 1 | Privacy policy | ✅ | `/privacy`: data collected, purposes, legal bases, AI and training, sharing, transfers, retention table, security, rights, children, cookies, changes. Versioned (`src/lib/legal.ts`). |
| 2 | Terms of service | ✅ | `/terms`: prominent medical disclaimer, eligibility (18+ or guardian), acceptable use, your content, fees and refunds, availability, IP, copyright complaints, disclaimers, liability, termination, changes, governing law. |
| 3 | Cookie banner | ✅ | `CookieNotice`, site-wide. The app sets only strictly necessary storage (sign-in session, demo flag, demo data), so this is an informational notice, not a consent wall. The full cookie table is in `/privacy#cookies`. |
| 4 | Unsubscribe from marketing emails | ✅ / ➖ | The app sends **no marketing emails** today. The opt-in is off by default, and Settings → *Product update emails* switches it off at any time. If you start sending marketing email, every message must also include a one-click unsubscribe link and your postal address (CAN-SPAM, PECR). |
| 5 | Data retention limits | ⚙️ | Defined in `/privacy#retention`. Enforced by `public.run_retention()` (AI logs 90 days, abandoned uploads 24 hours), scheduled daily with `pg_cron` in migration `0002`. **Takes effect once 0002 is applied to Supabase.** |
| 6 | Explicit checkbox to accept privacy policy and terms | ✅ | Sign-up has 3 separate **required** checkboxes: age 18+, Terms and Privacy policy, and explicit health-data consent. None are pre-ticked. Demo visitors and existing accounts see the same agreements in a blocking prompt (`ConsentGate`). |
| 7 | Record acceptance (who, what version, when) | ⚙️ | Table `legal_acceptances` (`user_id`, `document`, `version`, `source`, `accepted_at`).<br>• `accepted_at` is always set by the database clock, and users cannot edit records.<br>• Sign-up consent is written by a trigger on `auth.users` at account creation.<br>• Later versions are accepted in the app via `POST /api/legal`, where the server, not the client, chooses the version.<br>• Users see their records in Settings and in their data download.<br>**Takes effect once 0002 is applied.** |
| 8 | Refund policy | ✅ / ➖ | The app is free, with no charges, so there is nothing to refund. Terms §6 states this and commits to clear pricing, cancellation and refunds if paid features are ever added. |
| 9 | Business contact details | ⚠️ | `/contact`, plus the privacy policy and terms, read `NEXT_PUBLIC_LEGAL_OPERATOR_NAME`, `NEXT_PUBLIC_LEGAL_CONTACT_EMAIL`, `NEXT_PUBLIC_LEGAL_COUNTRY` and (optional) `NEXT_PUBLIC_LEGAL_POSTAL_ADDRESS`. These live in environment variables so personal details stay out of the public repository. **The owner must provide them before deploying.** Until then the pages say "Not yet published". |

## Consent and data

| # | Item | Status | Where / notes |
| --- | --- | --- | --- |
| 10 | Marketing consent separate from terms | ✅ | A separate optional checkbox at sign-up, unticked by default, stored in `profiles.marketing_opt_in` with a timestamp. Changeable in Settings. |
| 11 | Stop collecting unnecessary data | ✅ | Reviewed. The app collects only email, password (hashed by Supabase), an optional nickname and language, plus the documents the user uploads. There is no date of birth, phone, address, ID, IP storage, analytics or device fingerprinting. Age is confirmed by checkbox, not by collecting a birth date. |
| 12 | Data download and deletion | ✅ | Settings → *Download my data* (`GET /api/account/export`, JSON; files as 1-hour private links; demo exports local data). Settings → *Delete all my data* (deletes files, plans, corrections, agreements and profile). Individual documents can also be deleted. |
| 13 | Prevent unauthorized AI training on user data | ✅ | **Technical control:** the server refuses to enable Gemini unless `GEMINI_PAID_TIER=true`, because Google's terms let it use content sent through the unpaid API to improve its products, while paid-tier content is not used for training. This is tested in `tests/integration/pipeline.test.ts`. The app never trains models on user data; this is stated in `/privacy#ai`. |
| 14 | Block trackers until users consent | ✅ | There are no trackers to block: no analytics, advertising, pixels or session recording. The CSP (`script-src 'self'`) prevents third-party scripts from loading at all. E2E test `no third-party requests are made before or after consent` checks this. |
| 15 | Data processing agreements | ⚠️ | Cannot be signed by an engineer on your behalf. **Owner:**<br>• **Supabase:** sign the DPA in the dashboard under Organization → Legal Documents (also at https://supabase.com/legal/dpa).<br>• **Vercel:** the DPA (https://vercel.com/legal/dpa) is part of Vercel's terms; keep a copy.<br>• **Google:** if Gemini is enabled, the Gemini API terms for paid services apply (Cloud Data Processing Addendum). |
| 16 | Publish subprocessor list | ✅ | `/subprocessors`: Supabase (India, Mumbai), Vercel (global edge), and Google Gemini (listed as not currently enabled). GitHub is noted as not receiving user data. |
| 17 | Audit third-party SDKs, analytics and tracking | ✅ | **SDKs and trackers:** no analytics or tracking packages in `package.json`. The client bundle contains no third-party request endpoints, only documentation strings. Fonts are self-hosted by `next/font`, so there are no runtime requests to Google Fonts. Server-only SDKs: `@supabase/*`, `@google/genai`.<br>**Licences:** see items 31 and 32. |

## Trust and marketing

| # | Item | Status | Notes |
| --- | --- | --- | --- |
| 18 | Remove fake countdown timers | ➖ | None exist. |
| 19 | Remove dark patterns | ✅ | None found. Deletion is one clearly labelled button with a neutral confirmation. Declining the agreement offers a plain "No thanks, leave". The marketing opt-in is unticked by default. |
| 20 | Remove fake reviews | ➖ | None exist. The landing-page illustration is labelled "synthetic data for a fictional patient". |
| 21 | Remove unsupported claims | ✅ | Copy reviewed. The site states it is an educational prototype, not clinically validated, with no regulatory approval. The "encrypted storage" claim is accurate (HTTPS in transit; Supabase encrypts at rest). There are no outcome or performance guarantees. |
| 22 | Remove false SOC 2 claims | ✅ | No SOC 2, ISO, HIPAA or GDPR-certification claims anywhere (verified by search). |
| 23 | Realistic uptime commitments | ✅ | Terms §7: free service, no uptime guarantee, notice before shutdown where possible. |
| 24 | Remove hidden fees | ➖ | No fees. Terms §6. |
| 25 | Disclose auto-renewals | ➖ | No subscriptions. Terms §6 commits to disclosure before any future charge. |
| 26 | Easy subscription cancellation | ➖ | No subscriptions. Terms §6 commits to "cancelling as easy as signing up" if introduced. |

## Accessibility and IP

| # | Item | Status | Notes |
| --- | --- | --- | --- |
| 27 | *(blank in the request)* | ➖ | |
| 28 | Alt text | ✅ | The only content image (an uploaded-document preview) has alt text. Decorative icons are `aria-hidden`, and the logo is an SVG with a text label. axe `image-alt` passes on every page. |
| 29 | Keyboard navigation | ✅ | Skip link, visible focus styles, native controls and focusable scroll regions. axe WCAG 2.1 AA passes on every page, dialog and the consent prompt (E2E). |
| 30 | Customer logos without permission | ➖ | No customer or partner logos are used. |
| 31 | Image, font and code licences | ✅ | **Fonts:** Inter, Plus Jakarta Sans and Noto Nastaliq Urdu (all SIL OFL 1.1, self-hosted).<br>**Icons and UI:** Lucide icons (ISC); shadcn/ui and Radix (MIT).<br>**Images:** the only images are the project's own logo SVG and synthetic sample PDFs generated in-repo. |
| 32 | Open-source licence obligations | ✅ | `THIRD_PARTY_NOTICES.md` lists all 379 production dependencies and their licences (mostly MIT, Apache-2.0, BSD and ISC).<br>• **No GPL or AGPL in production code.**<br>• `@img/sharp-*` binaries bundle libvips (LGPL-3.0). They are server-side only and not distributed; no source obligation for a hosted service.<br>• `caniuse-lite` (CC-BY-4.0, build-time) is credited.<br>The repository itself has no licence file, so all rights are reserved by default; add one only if you want others to reuse the code. |
| 33 | DMCA agent registration | ⚠️ | User content in this app is private and never publicly displayed, so DMCA safe-harbour exposure is low. Terms §9 provides a copyright-notice route. If you serve US users and want safe-harbour protection, register a designated agent with the US Copyright Office (https://www.copyright.gov/dmca-directory/; there is a small fee). This is the owner's decision. |

## Special cases

| # | Item | Status | Notes |
| --- | --- | --- | --- |
| 34 | Label AI-generated content | ✅ | **Simplified text:** labelled "AI-simplified", and Urdu as "not medically certified".<br>**Extracted items:** marked "Needs your review" until confirmed. The source dialog states "extracted automatically by AI", and the review page explains that AI can make mistakes.<br>**Sample data:** labelled as precomputed, not live AI. |
| 35 | Parental consent for children's data | ✅ | Accounts are 18+ only (required sign-up checkbox; Terms §2; Privacy §12). A parent or guardian may upload a child's documents, and in doing so consents on the child's behalf. The checkbox wording requires authority over anyone else's documents. There is a contact route to delete a child's data. If you deliberately target children or teens, take legal advice first (COPPA, GDPR Art. 8). |

## Owner actions before going live

1. **Contact details (item 9).** Set these in Vercel → Settings → Environment Variables (Production), then redeploy:
   - `NEXT_PUBLIC_LEGAL_OPERATOR_NAME`
   - `NEXT_PUBLIC_LEGAL_CONTACT_EMAIL`
   - `NEXT_PUBLIC_LEGAL_COUNTRY`
   - optionally `NEXT_PUBLIC_LEGAL_POSTAL_ADDRESS`
2. **Apply migration `supabase/migrations/0002_legal_consent_retention.sql`** in the Supabase SQL Editor (items 5, 7 and 10).
3. **Sign the Supabase DPA** and keep copies of the Vercel and Google terms (item 15).
4. **Have a lawyer review** `/privacy` and `/terms`. Bump the versions in `src/lib/legal.ts` after any material change, and users will be asked to re-accept.
5. **Optional:** register a DMCA agent (item 33), and add a licence file if you want to open-source the code (item 32).

## Verification

- Unit and integration tests: 94 passed, 2 skipped (live Supabase RLS needs test accounts).
- New tests:
  - paid-tier guard;
  - migration checks for the consent table, server timestamps, no edit policy, the auth trigger, retention schedule and separate marketing flag.
- Playwright E2E: 37 passed, including 7 legal tests:
  - legal pages linked and accessible;
  - cookie notice;
  - no third-party requests;
  - consent prompt blocks until all three agreements are ticked, records versions, and appears in Settings;
  - data download contents;
  - declining exits;
  - sign-up checkboxes, with marketing unticked by default;
  - the legal APIs require authentication.
