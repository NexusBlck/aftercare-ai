import { enforceRateLimit } from "@/lib/api/auth-guards";
import { AppError } from "@/lib/api/errors";
import { handle, ok, parseJson } from "@/lib/api/route-utils";
import { securityEvent } from "@/lib/security/audit-log";
import { requireUser } from "@/lib/supabase/server";
import { NewPasswordSchema } from "@/schemas/auth";

/** Sets a new password for the signed-in user, including after following a reset link. */
export const POST = handle(async (request: Request) => {
  const { supabase, user } = await requireUser();
  enforceRateLimit(request, "password-change", user.id, 5, 60 * 60_000);
  const { password } = await parseJson(request, NewPasswordSchema);
  const { error } = await supabase.auth.updateUser({ password });
  if (error) {
    if (/same/i.test(error.message)) throw new AppError("invalid_request", "Choose a password different from your current one.", 400);
    throw new AppError("invalid_request", "We could not update your password. Request a new reset link and try again.", 400);
  }
  // End every other session that may have been using the old password.
  await supabase.auth.signOut({ scope: "others" });
  securityEvent("password_changed", request, {});
  return ok({ ok: true });
});
