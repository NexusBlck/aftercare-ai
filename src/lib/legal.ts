/**
 * Legal identity and document versions.
 *
 * Operator details come from environment variables rather than source code, because the
 * repository is public and personal contact details should not live in git history.
 * Set them in Vercel → Project → Settings → Environment Variables.
 */
export const LEGAL = {
  productName: "AFTERCARE AI",
  operatorName: process.env.NEXT_PUBLIC_LEGAL_OPERATOR_NAME?.trim() || null,
  contactEmail: process.env.NEXT_PUBLIC_LEGAL_CONTACT_EMAIL?.trim() || null,
  country: process.env.NEXT_PUBLIC_LEGAL_COUNTRY?.trim() || null,
  postalAddress: process.env.NEXT_PUBLIC_LEGAL_POSTAL_ADDRESS?.trim() || null,
} as const;

/**
 * Bump a version whenever the document changes materially. Signed-in users are asked to accept
 * new versions of the terms, privacy policy or health-data consent before continuing.
 */
export const LEGAL_VERSIONS = {
  terms: "2026-11-12",
  privacy: "2026-11-12",
  health_data: "2026-11-12",
} as const;

export type LegalDocument = keyof typeof LEGAL_VERSIONS;
export const LEGAL_DOCUMENTS = Object.keys(LEGAL_VERSIONS) as LegalDocument[];

export const EFFECTIVE_DATE_LABEL = "12 November 2026";

/** Retention periods, shared by the privacy policy text and the database clean-up job. */
export const RETENTION = {
  processingLogDays: 90,
  abandonedUploadHours: 24,
} as const;

export function contactLine(): string {
  return LEGAL.contactEmail ?? "the contact address on our Contact page";
}
