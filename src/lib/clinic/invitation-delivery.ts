import "server-only";
import { sendEmail } from "@/lib/email/mailer";
import { invitationEmail } from "@/lib/email/templates";

/**
 * How an invitation reached the person: by email, or "manual" when the clinic must share the link
 * itself (no address, email not configured, or sending failed). The link is always returned to the
 * inviter as well, so a failed email never blocks the invitation.
 */
export type InvitationDelivery = { delivery: "email" } | { delivery: "manual"; email_status: "no_address" | "not_configured" | "failed" };

export async function deliverInvitation(input: {
  kind: "staff" | "patient";
  to: string | null;
  link: string;
  organization: string;
  role?: string;
  origin: string;
}): Promise<InvitationDelivery> {
  if (!input.to) return { delivery: "manual", email_status: "no_address" };
  const result = await sendEmail({
    to: input.to,
    ...invitationEmail({ kind: input.kind, link: input.link, organization: input.organization, role: input.role, appUrl: input.origin }),
  });
  return result.sent ? { delivery: "email" } : { delivery: "manual", email_status: result.reason };
}
