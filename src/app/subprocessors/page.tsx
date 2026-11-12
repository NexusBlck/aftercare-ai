import type { Metadata } from "next";
import Link from "next/link";
import { LegalLayout } from "@/components/legal/legal-layout";

export const metadata: Metadata = { title: "Subprocessors" };

const SUBPROCESSORS = [
  {
    name: "Supabase, Inc.",
    purpose: "Database, account sign-in, sign-up emails and private file storage",
    data: "Email address, password hash, profile, uploaded documents and all extracted health information, agreement records",
    location: "India (ap-south-1, Mumbai)",
    status: "Active",
    terms: "https://supabase.com/legal/dpa",
  },
  {
    name: "Vercel, Inc.",
    purpose: "Hosting and delivering the website and its server functions",
    data: "Requests passing through, including any information you submit, and short-lived request logs (IP address, browser)",
    location: "Global edge network",
    status: "Active",
    terms: "https://vercel.com/legal/dpa",
  },
  {
    name: "Google LLC (Gemini API)",
    purpose: "Reading uploaded documents with AI and writing plain-language explanations",
    data: "Documents you choose to process, and the extracted text",
    location: "Google global infrastructure",
    status: "Not currently enabled. Would only be enabled on terms that prohibit training on your data.",
    terms: "https://ai.google.dev/gemini-api/terms",
  },
];

export default function SubprocessorsPage() {
  return (
    <LegalLayout title="Subprocessors">
      <p>
        These are the companies that process personal information on our behalf to run AFTERCARE AI. They may use it only to provide their service to us. We will update this page before adding a new subprocessor that handles personal information. See our <Link href="/privacy">Privacy policy</Link> for more.
      </p>
      <table>
        <thead>
          <tr>
            <th>Provider</th>
            <th>Purpose</th>
            <th>Personal data involved</th>
            <th>Location</th>
            <th>Status</th>
          </tr>
        </thead>
        <tbody>
          {SUBPROCESSORS.map((s) => (
            <tr key={s.name}>
              <td>
                <a href={s.terms} rel="noopener noreferrer" target="_blank">
                  {s.name}
                </a>
              </td>
              <td>{s.purpose}</td>
              <td>{s.data}</td>
              <td>{s.location}</td>
              <td>{s.status}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <h2>Not subprocessors</h2>
      <p>
        We use GitHub to host our source code and run automated tests. GitHub does not receive users&rsquo; personal or health information. We do not use analytics, advertising, session-recording or tracking services.
      </p>
      <p className="legal-meta">Last updated 12 November 2026.</p>
    </LegalLayout>
  );
}
