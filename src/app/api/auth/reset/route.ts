import { enforceRateLimit } from "@/lib/api/auth-guards";
import { AppError } from "@/lib/api/errors";
import { handle, ok, parseJson } from "@/lib/api/route-utils";
import { clientIp, pseudonymize, securityEvent } from "@/lib/security/audit-log";
import { createServerSupabase } from "@/lib/supabase/server";
import { ResetRequestSchema } from "@/schemas/auth";

/**
 * Sends a password-reset link. Always answers the same way, so it cannot reveal which emails have
 * accounts. Links are single-use and expire after the Supabase "email OTP expiry" (15 minutes).
 */
export const POST = handle(async (request: Request) => {
  enforceRateLimit(request, "reset-ip", clientIp(request), 5, 60 * 60_000);
  const { email } = await parseJson(request, ResetRequestSchema);
  enforceRateLimit(request, "reset-email", email, 3, 60 * 60_000);
  const supabase = await createServerSupabase();
  if (!supabase) throw new AppError("accounts_unconfigured", "Accounts are not configured on this server.", 503);

  const origin = new URL(request.url).origin;
  await supabase.auth.resetPasswordForEmail(email, { redirectTo: `${origin}/auth/callback?next=/reset-password` });
  securityEvent("password_reset_requested", request, { account: pseudonymize(email) });
  return ok({ ok: true });
});
