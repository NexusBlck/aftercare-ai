import type { Metadata } from "next";
import Link from "next/link";
import { LegalLayout } from "@/components/legal/legal-layout";
import { LEGAL } from "@/lib/legal";

export const metadata: Metadata = { title: "Contact" };

export default function ContactPage() {
  return (
    <LegalLayout title="Contact">
      <p>For privacy requests, questions about these terms, copyright notices or support, contact us here.</p>
      <table>
        <tbody>
          <tr>
            <th scope="row">Operator</th>
            <td>{LEGAL.operatorName ?? "Not yet published"}</td>
          </tr>
          <tr>
            <th scope="row">Email</th>
            <td>{LEGAL.contactEmail ? <a href={`mailto:${LEGAL.contactEmail}`}>{LEGAL.contactEmail}</a> : "Not yet published"}</td>
          </tr>
          {LEGAL.postalAddress && (
            <tr>
              <th scope="row">Postal address</th>
              <td>{LEGAL.postalAddress}</td>
            </tr>
          )}
          <tr>
            <th scope="row">Country</th>
            <td>{LEGAL.country ?? "Not yet published"}</td>
          </tr>
        </tbody>
      </table>
      <h2>Privacy requests</h2>
      <p>
        You can download or delete your data yourself at any time from <strong>Settings</strong> in the app. For anything else (for example to object to processing), email us and include the email address of your account. We may need to confirm your identity before acting on a request.
      </p>
      <h2>Medical questions</h2>
      <p>
        We cannot answer medical questions. Please contact your doctor, nurse or pharmacist. <strong>In an emergency, call your local emergency number.</strong>
      </p>
      <p>
        See also our <Link href="/privacy">Privacy policy</Link> and <Link href="/terms">Terms of service</Link>.
      </p>
    </LegalLayout>
  );
}
