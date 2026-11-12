import type { Metadata } from "next";
import Link from "next/link";
import { LegalLayout } from "@/components/legal/legal-layout";
import { contactLine, LEGAL, LEGAL_VERSIONS } from "@/lib/legal";

export const metadata: Metadata = { title: "Terms of service" };

export default function TermsPage() {
  const operator = LEGAL.operatorName ?? "the operator of AFTERCARE AI";
  return (
    <LegalLayout title="Terms of service" version={LEGAL_VERSIONS.terms}>
      <p>
        These terms are an agreement between you and {operator} (&ldquo;we&rdquo;, &ldquo;us&rdquo;) for your use of AFTERCARE AI. By creating an account or using the demo you agree to them. Please also read our <Link href="/privacy">Privacy policy</Link>.
      </p>

      <h2 id="medical">1. Not medical advice</h2>
      <p className="callout">
        AFTERCARE AI organizes and explains information from documents you provide. It does <strong>not</strong> provide medical advice, diagnosis or treatment, is not a medical device, and is not monitored by healthcare professionals. Always follow the instructions of your treating doctor, nurse or pharmacist, and ask them about anything unclear or conflicting. <strong>In an emergency, call your local emergency number immediately.</strong>
      </p>
      <p>
        AI can misread documents. Every item is shown to you for review, and you are responsible for checking it against your original documents before relying on it. Confirming an item in the app means it matches your document. It is not a clinician&rsquo;s verification.
      </p>

      <h2 id="eligibility">2. Who can use AFTERCARE AI</h2>
      <p>
        You must be at least 18 years old to create an account. You may use AFTERCARE AI for someone else (for example your child or a person you care for) only if you are their parent, legal guardian or otherwise authorised to manage their health information.
      </p>

      <h2 id="account">3. Your account</h2>
      <ul>
        <li>Give accurate sign-up information and keep your password secure. You are responsible for activity on your account.</li>
        <li>Tell us promptly at {contactLine()} if you think your account has been accessed without permission.</li>
      </ul>

      <h2 id="acceptable-use">4. Acceptable use</h2>
      <p>You agree not to:</p>
      <ul>
        <li>upload documents you are not entitled to share, or other people&rsquo;s information without their authority;</li>
        <li>use the service for anything unlawful, harmful or fraudulent;</li>
        <li>attempt to access other users&rsquo; data, probe or break our security, or disrupt the service (including by overloading it);</li>
        <li>scrape, copy or resell the service, or use it to build a competing product;</li>
        <li>upload malware, or content designed to manipulate the AI into acting against these terms.</li>
      </ul>
      <p>In demo mode, use only synthetic or sample documents.</p>

      <h2 id="content">5. Your content</h2>
      <p>
        You keep ownership of the documents and information you upload. You give us permission to store, process and display them only as needed to provide AFTERCARE AI to you, including sending them to our subprocessors (listed on our <Link href="/subprocessors">Subprocessors page</Link>). We do not use your content to train AI models. You can delete your content at any time.
      </p>

      <h2 id="fees">6. Fees, refunds and renewals</h2>
      <p>
        AFTERCARE AI is currently free. There are no charges, hidden fees, subscriptions or automatic renewals, so there is nothing to refund. If we ever introduce paid features, we will show the full price, any renewal terms and how to cancel <em>before</em> you pay. We will never charge you without your explicit agreement, cancelling will be as easy as signing up, and refunds will be handled as required by applicable consumer law.
      </p>

      <h2 id="availability">7. Availability and changes to the service</h2>
      <p>
        We work to keep AFTERCARE AI available and reliable, but it is provided free of charge and we do not promise any particular uptime or that it will be error-free. We may change, suspend or discontinue features. If we decide to shut the service down, we will give reasonable notice where possible so you can download your data.
      </p>

      <h2 id="ip">8. Our intellectual property</h2>
      <p>
        The AFTERCARE AI software, design and content (other than your content and the open-source components credited in our third-party notices) belong to us or our licensors. These terms do not give you any rights in them beyond using the service.
      </p>

      <h2 id="copyright">9. Copyright complaints</h2>
      <p>
        Content in AFTERCARE AI is private to each user and is not published. If you believe material in the service infringes your copyright, send a notice to {contactLine()} identifying the work, the material, your contact details, a statement of good-faith belief and a statement that your notice is accurate. We will review and respond.
      </p>

      <h2 id="disclaimers">10. Disclaimers</h2>
      <p>
        To the extent the law allows, AFTERCARE AI is provided &ldquo;as is&rdquo; and &ldquo;as available&rdquo;, without warranties of any kind, including accuracy of AI output, fitness for a particular purpose or uninterrupted availability. Nothing in these terms excludes rights you have under consumer law that cannot be excluded.
      </p>

      <h2 id="liability">11. Limitation of liability</h2>
      <p>
        To the extent the law allows, we are not liable for indirect or consequential losses, or for decisions you make based on information in the app instead of the advice of your healthcare professionals. Nothing in these terms limits liability for death or personal injury caused by negligence, for fraud, or for anything else that cannot be limited by law.
      </p>

      <h2 id="termination">12. Ending your use</h2>
      <p>
        You can stop using AFTERCARE AI and delete your data at any time from Settings. We may suspend or close accounts that break these terms or put other users or the service at risk, and will tell you why unless the law prevents it.
      </p>

      <h2 id="changes">13. Changes to these terms</h2>
      <p>
        We may update these terms. We will post the new version here with a new date and version number, and for material changes we will ask you to accept them in the app before you continue. If you do not agree, you can delete your data and stop using the service.
      </p>

      <h2 id="law">14. Governing law</h2>
      <p>
        {LEGAL.country
          ? `These terms are governed by the laws of ${LEGAL.country}, without affecting any mandatory consumer protections of the country where you live.`
          : "These terms are governed by the laws of the country where the operator is established, without affecting any mandatory consumer protections of the country where you live."}
      </p>

      <h2 id="contact">15. Contact</h2>
      <p>
        Questions about these terms: {contactLine()}. See our <Link href="/contact">Contact page</Link>.
      </p>
    </LegalLayout>
  );
}
