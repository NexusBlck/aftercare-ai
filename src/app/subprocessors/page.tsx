import type { Metadata } from "next";
import Link from "next/link";
import { LegalLayout } from "@/components/legal/legal-layout";
import { freeTierAi } from "@/lib/ai-disclosure";
import { redisConfig } from "@/lib/security/rate-limit";

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

/** Listed while the FreeLLMAPI router is the configured AI provider. */
const FREE_TIER_AI = {
  name: "Free-tier AI providers routed by FreeLLMAPI",
  purpose: "Reading documents you choose to process and writing plain-language explanations. The provider is chosen per request.",
  data: "The text of processed documents (or the photo), and the extracted items",
  location:
    "Varies per request and may be outside your country. The pool can include Google (Gemini), Groq, Cerebras, Mistral, OpenRouter, Cloudflare, Cohere, NVIDIA, Hugging Face, Z.ai and other free providers enabled on our router",
  status: "Active. Free tiers may keep and use submitted content to improve their models.",
  terms: "https://github.com/tashfeenahmed/freellmapi",
};

function freeTierRows() {
  const ai = freeTierAi();
  if (!ai) return [];
  if (ai.mode === "freellmapi") return [FREE_TIER_AI];
  return ai.providers.map((p) => ({
    name: p.name,
    purpose: "Reading documents you choose to process and writing plain-language explanations (used in a fixed fallback order)",
    data: "The text of processed documents (or the photo), and the extracted items",
    location: p.location,
    status: "Active (free tier). May keep and use submitted content to improve its models.",
    terms: p.terms,
  }));
}

/** Listed while the shared rate limiter (Upstash Redis) is configured. */
const RATE_LIMIT_STORE = {
  name: "Upstash, Inc.",
  purpose: "Counting requests to stop abuse (rate limiting)",
  data: "Request counters stored under one-way hashed identifiers that expire within an hour. No health information, IP addresses or email addresses are sent.",
  location: "Upstash region chosen at set-up",
  status: "Active",
  terms: "https://upstash.com/trust/dpa.pdf",
};

export default function SubprocessorsPage() {
  const rows = [...SUBPROCESSORS, ...freeTierRows(), ...(redisConfig() ? [RATE_LIMIT_STORE] : [])];
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
          {rows.map((s) => (
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
