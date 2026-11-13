/** What the invitation APIs return, and the sentence that tells the inviter how it was delivered. */
export type InvitationResult = {
  link: string;
  expires_at: string;
} & ({ delivery: "email" } | { delivery: "manual"; email_status: "no_address" | "not_configured" | "failed" | "not_requested" });

const MANUAL_REASON = {
  no_address: "There is no email address on file, so nothing was sent.",
  not_configured: "Email is not set up on this server, so nothing was sent.",
  failed: "We could not send the email.",
  not_requested: "No message has been sent.",
} as const;

/** First sentence of the "invitation created" dialog. */
export function deliverySentence(result: InvitationResult, to: string | null): string {
  if (result.delivery === "email") return `We emailed the invitation to ${to ?? "the address on file"}. If it does not arrive, share the link below instead.`;
  return `${MANUAL_REASON[result.email_status]} Share the link below privately instead.`;
}
