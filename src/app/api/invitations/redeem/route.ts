import { AppError } from "@/lib/api/errors";
import { enforceRateLimit } from "@/lib/api/auth-guards";
import { handle, ok, parseJson } from "@/lib/api/route-utils";
import { clientIp, securityEvent } from "@/lib/security/audit-log";
import { rpc } from "@/lib/clinic/server";
import { requireUser } from "@/lib/supabase/server";
import { RedeemPatientInviteSchema } from "@/schemas/clinic";

const REASONS: Record<string, string> = {
  invitation_invalid: "This invitation link is not valid or has been withdrawn. Ask your clinic for a new one.",
  invitation_used: "This invitation has already been used.",
  invitation_expired: "This invitation has expired. Ask your clinic for a new one.",
  verification_failed: "The details did not match our records. Check your date of birth and try again.",
  invitation_locked: "Too many unsuccessful attempts. This invitation has been locked; ask your clinic for a new one.",
  account_already_linked: "Your account is already linked to another patient record at this clinic. Contact the clinic.",
  unauthorized: "Please sign in first.",
};

/**
 * Links the signed-in account to a clinic patient record. Requires the one-time token and the
 * patient's date of birth; failures are counted in the database and lock the invitation after five.
 */
export const POST = handle(async (request: Request) => {
  const auth = await requireUser();
  await enforceRateLimit(request, "invite-redeem-ip", clientIp(request), 20, 15 * 60_000);
  await enforceRateLimit(request, "invite-redeem-user", auth.user.id, 10, 15 * 60_000);
  const { token, date_of_birth } = await parseJson(request, RedeemPatientInviteSchema);
  const result = await rpc<{ ok: boolean; reason?: string; patient_id?: string }>(
    auth,
    "redeem_patient_invitation",
    { p_token: token, p_date_of_birth: date_of_birth },
    "accept the invitation",
  );
  if (!result.ok) {
    securityEvent("invitation_redeem_failed", request, { reason: result.reason ?? "unknown" });
    throw new AppError(result.reason === "verification_failed" ? "invalid_request" : "invitation_invalid", REASONS[result.reason ?? ""] ?? REASONS.invitation_invalid, 400);
  }
  return ok({ linked: true });
});
