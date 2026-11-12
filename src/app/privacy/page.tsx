import type { Metadata } from "next";
import Link from "next/link";
import { LegalLayout } from "@/components/legal/legal-layout";
import { contactLine, LEGAL, LEGAL_VERSIONS, RETENTION } from "@/lib/legal";

export const metadata: Metadata = { title: "Privacy policy" };

export default function PrivacyPage() {
  const operator = LEGAL.operatorName ?? "the operator of AFTERCARE AI";
  return (
    <LegalLayout title="Privacy policy" version={LEGAL_VERSIONS.privacy}>
      <p>
        This policy explains what information AFTERCARE AI collects, why, who it is shared with, how long it is kept, and the choices you have. It is written to describe exactly what the app does today. If anything here is unclear, contact us at {contactLine()}.
      </p>

      <h2 id="who">1. Who is responsible</h2>
      <p>
        AFTERCARE AI is operated by {operator}
        {LEGAL.country ? `, ${LEGAL.country}` : ""}. We are the &ldquo;controller&rdquo; of the personal information described here. Contact details are on our <Link href="/contact">Contact page</Link>.
      </p>

      <h2 id="what-it-is">2. What AFTERCARE AI is, and is not</h2>
      <p>
        AFTERCARE AI is an educational tool that organizes the discharge documents <em>you</em> provide into a plan you review yourself. It is not a medical device, does not give medical advice, diagnosis or treatment, and is not monitored by clinicians. It is not for emergencies.
      </p>

      <h2 id="collect">3. Information we collect</h2>
      <h3>When you create an account</h3>
      <ul>
        <li>
          <strong>Email address and password.</strong> Your password is handled by our authentication provider and stored only as a secure hash; we never see it.
        </li>
        <li>
          <strong>Optional profile details:</strong> a display name (any nickname) and your preferred explanation language.
        </li>
        <li>
          <strong>Agreement records:</strong> which version of the Terms, this Privacy Policy and the health-data consent you accepted, and when.
        </li>
        <li>
          <strong>Your product-update preference</strong> (off unless you switch it on).
        </li>
      </ul>
      <h3>Health information you choose to upload</h3>
      <ul>
        <li>The documents you upload (for example discharge summaries, prescriptions, wound-care sheets) and their file names.</li>
        <li>Information extracted from them: diagnosis, procedure, dates, medications, instructions, appointments and warning signs, with the source text they came from.</li>
        <li>What you do in the app: confirmations, corrections (with the previous value), ticked tasks, appointment notes and notes on conflicts.</li>
      </ul>
      <p>
        This is <strong>health information</strong>, which many laws treat as sensitive. We process it only to provide the service to you, and only with your explicit consent, which you give when you sign up. If you upload documents about someone else (for example your child or a person you care for), you must be their parent, legal guardian or otherwise authorised to share them.
      </p>
      <h3>Technical information</h3>
      <ul>
        <li>Essential cookies that keep you signed in (see <a href="#cookies">Cookies</a>).</li>
        <li>
          Our hosting and database providers automatically keep short-lived request logs (such as IP address, browser type and time) for security and reliability. We do not store your IP address in our own database.
        </li>
      </ul>
      <h3>Demo mode</h3>
      <p>
        In demo mode nothing is stored on our servers: the sample plan and anything you add stay in your own browser (local storage) until you exit the demo or clear your browser data. If AI processing is switched on and you process a document in demo mode, that file is sent once to our AI provider for processing and is not kept by us. Use only synthetic or sample documents in demo mode.
      </p>
      <h3>What we do not collect</h3>
      <p>
        We do not ask for your date of birth, address, phone number, government ID, insurance details or payment details. We do not use analytics, advertising or tracking tools, and we do not buy data about you.
      </p>

      <h2 id="use">4. How we use information</h2>
      <ul>
        <li>To provide the service: store your documents, extract and organize their content, and show it back to you.</li>
        <li>To keep the service secure, prevent abuse and fix problems.</li>
        <li>To keep records of your agreements and consents.</li>
        <li>To send essential account emails (for example confirming your email address). These are not marketing.</li>
        <li>To send occasional product updates <em>only</em> if you opt in. You can opt out at any time in Settings.</li>
      </ul>
      <p>
        We do <strong>not</strong> sell or rent your information, use it for advertising, build marketing profiles, or make decisions with legal or similarly significant effects about you. AI extraction results are always shown to you for review and are never treated as confirmed until you check them.
      </p>

      <h2 id="legal-bases">5. Legal bases</h2>
      <p>Where data-protection laws require a legal basis (for example the GDPR), we rely on:</p>
      <ul>
        <li><strong>Contract:</strong> to provide the account and features you sign up for.</li>
        <li>
          <strong>Explicit consent:</strong> for health information. You can withdraw it at any time by deleting the documents or your data; this does not affect processing that already happened.
        </li>
        <li><strong>Consent:</strong> for optional product-update emails.</li>
        <li><strong>Legitimate interests:</strong> for security, abuse prevention and keeping agreement records.</li>
        <li><strong>Legal obligation:</strong> where we must keep or disclose information by law.</li>
      </ul>

      <h2 id="ai">6. AI processing and model training</h2>
      <p>
        When AI processing is switched on, the document you choose to process is sent to Google&rsquo;s Gemini API to read it and return structured information, and the extracted text may be sent again to create plain-language explanations. We only enable this on Google terms under which your content is <strong>not used to train Google&rsquo;s models</strong>. AI processing is currently switched off on our live service.
      </p>
      <p>
        We do not use your documents or data to train, fine-tune or evaluate any AI model, and we do not allow our providers to do so. Content generated by AI is labelled in the app (&ldquo;AI-simplified&rdquo;, &ldquo;needs your review&rdquo;) so you can tell it apart from your documents.
      </p>

      <h2 id="sharing">7. Who we share information with</h2>
      <p>
        We share information only with the service providers (&ldquo;subprocessors&rdquo;) that run AFTERCARE AI for us, under contracts that limit their use of it to providing their service. The current list, what each one does and where it processes data is on our <Link href="/subprocessors">Subprocessors page</Link>.
      </p>
      <p>
        We may also disclose information if required by law or a valid legal request, or to protect the safety of a person. We would only disclose the minimum required. If AFTERCARE AI is transferred to a new operator, your information would only move with notice to you, under this policy or one that is equally protective.
      </p>

      <h2 id="transfers">8. Where information is processed</h2>
      <p>
        Account and health information is stored in our database in India (Supabase, Mumbai region). Our website is delivered by Vercel&rsquo;s global network, so requests may pass through servers in other countries. If AI processing is switched on, documents are processed by Google, which may happen outside your country. Where the law requires it, we rely on our providers&rsquo; standard contractual protections for these transfers.
      </p>

      <h2 id="retention">9. How long we keep information</h2>
      <table>
        <thead>
          <tr>
            <th>Information</th>
            <th>How long</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td>Account, profile and preferences</td>
            <td>Until you delete your data or your account.</td>
          </tr>
          <tr>
            <td>Uploaded documents and everything extracted from them</td>
            <td>Until you delete the document, your data or your account. Deleting a document removes its file and everything extracted from it.</td>
          </tr>
          <tr>
            <td>Your corrections and agreement records</td>
            <td>For as long as your account data exists, so we can show what was changed and what you agreed to. Deleted with your data.</td>
          </tr>
          <tr>
            <td>AI processing logs (model name, status, error type: never document content)</td>
            <td>{RETENTION.processingLogDays} days, then automatically deleted.</td>
          </tr>
          <tr>
            <td>Uploads that were started but never completed</td>
            <td>Automatically removed after {RETENTION.abandonedUploadHours} hours.</td>
          </tr>
          <tr>
            <td>Provider request and security logs</td>
            <td>Kept by our providers for a limited period under their own policies, then deleted.</td>
          </tr>
          <tr>
            <td>Demo-mode data</td>
            <td>In your browser only, until you exit the demo or clear your browser data.</td>
          </tr>
        </tbody>
      </table>

      <h2 id="security">10. Security</h2>
      <p>
        Each account&rsquo;s records are isolated by database access rules so other accounts cannot read them. Uploaded files are kept in private storage and opened only through short-lived links after we check that they are yours. Information is encrypted in transit (HTTPS) and at rest by our database provider. Secret keys are never sent to your browser. No system is perfectly secure, so we cannot guarantee absolute security, but we will notify you and the relevant authorities of a personal-data breach where the law requires it.
      </p>

      <h2 id="rights">11. Your rights and choices</h2>
      <ul>
        <li>
          <strong>Access and download:</strong> Settings → <em>Download my data</em> gives you a copy of everything we hold about you in a machine-readable file.
        </li>
        <li><strong>Correct:</strong> edit any extracted item, your display name or your plan title in the app.</li>
        <li>
          <strong>Delete:</strong> delete individual documents, or everything with Settings → <em>Delete all my data</em>.
        </li>
        <li><strong>Withdraw consent:</strong> delete your health information, or switch off product updates in Settings.</li>
        <li><strong>Object or restrict:</strong> contact us and we will respond.</li>
      </ul>
      <p>
        You can also make any request by contacting us at {contactLine()}. We will respond within the time the law requires (normally one month) and may need to confirm your identity first. You have the right to complain to your data-protection authority.
      </p>

      <h2 id="children">12. Children</h2>
      <p>
        You must be 18 or older to create an account. We do not knowingly collect information directly from children. A parent or legal guardian may use AFTERCARE AI to organize their child&rsquo;s documents, and by doing so gives consent on the child&rsquo;s behalf. If you believe a child has given us information without a guardian&rsquo;s consent, contact us and we will delete it.
      </p>

      <h2 id="cookies">13. Cookies and local storage</h2>
      <p>We use only what is strictly necessary for the app to work. There are no analytics, advertising or tracking cookies, and no third-party trackers.</p>
      <table>
        <thead>
          <tr>
            <th>Name</th>
            <th>Type</th>
            <th>Purpose</th>
            <th>Duration</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td>
              <code>sb-…-auth-token</code>
            </td>
            <td>Cookie (essential)</td>
            <td>Keeps you signed in to your account.</td>
            <td>Until you sign out or the session expires</td>
          </tr>
          <tr>
            <td>
              <code>aftercare_demo</code>
            </td>
            <td>Cookie (essential)</td>
            <td>Remembers that you chose demo mode. Contains no personal data.</td>
            <td>7 days, or until you exit the demo</td>
          </tr>
          <tr>
            <td>
              <code>aftercare.demo.*</code>, <code>aftercare-demo</code>
            </td>
            <td>Local storage / IndexedDB (essential)</td>
            <td>Stores the demo plan and demo files in your own browser.</td>
            <td>Until you exit the demo or clear browser data</td>
          </tr>
          <tr>
            <td>
              <code>aftercare.cookie-notice</code>
            </td>
            <td>Local storage (essential)</td>
            <td>Remembers that you dismissed the cookie notice.</td>
            <td>Until you clear browser data</td>
          </tr>
        </tbody>
      </table>
      <p>
        Because these are strictly necessary, they do not require consent; we show a notice so you know about them. If we ever want to add optional cookies or analytics, we will ask for your consent first and they will stay off until you agree.
      </p>

      <h2 id="changes">14. Changes to this policy</h2>
      <p>
        We will post any change here with a new version number and date. For material changes we will tell you in the app and ask you to review and accept the new version before continuing.
      </p>

      <h2 id="contact">15. Contact</h2>
      <p>
        Questions, requests or complaints: {contactLine()}. See our <Link href="/contact">Contact page</Link>.
      </p>
    </LegalLayout>
  );
}
