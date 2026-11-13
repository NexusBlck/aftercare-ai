import { enforceRateLimit } from "@/lib/api/auth-guards";
import { AppError } from "@/lib/api/errors";
import { handle, ok, parseJson } from "@/lib/api/route-utils";
import { securityEvent } from "@/lib/security/audit-log";
import { verifiedTotpFactors } from "@/lib/supabase/mfa";
import { requireUser } from "@/lib/supabase/server";
import { MfaCodeSchema } from "@/schemas/auth";

/**
 * Checks a 6-digit code: completes sign-in for an account with two-factor (the session cookies are
 * upgraded to aal2), or, with `factor_id` from set-up, activates a new authenticator app.
 */
export const POST = handle(async (request: Request) => {
  const { supabase, user } = await requireUser();
  // Six-digit codes are guessable; keep attempts low per account and per address.
  enforceRateLimit(request, "mfa-verify", user.id, 8, 10 * 60_000);
  const { code, factor_id } = await parseJson(request, MfaCodeSchema);
  const factorId = factor_id ?? (await verifiedTotpFactors(supabase))[0]?.id;
  if (!factorId) throw new AppError("invalid_request", "Two-factor authentication is not set up for this account.", 400);
  const { error } = await supabase.auth.mfa.challengeAndVerify({ factorId, code });
  if (error) {
    securityEvent("mfa_failed", request, {});
    throw new AppError("mfa_invalid_code", "That code is not correct or has expired. Try the current code.", 400);
  }
  securityEvent(factor_id ? "mfa_enabled" : "mfa_verified", request, {});
  return ok({ ok: true });
});
