import { enforceRateLimit } from "@/lib/api/auth-guards";
import { AppError } from "@/lib/api/errors";
import { handle, ok, parseJson } from "@/lib/api/route-utils";
import { clearFailures, clientIp, pseudonymize, recordFailure, securityEvent } from "@/lib/security/audit-log";
import { mfaState, needsSecondStep } from "@/lib/supabase/mfa";
import { createServerSupabase } from "@/lib/supabase/server";
import { LoginSchema } from "@/schemas/auth";

const BURST_WINDOW_MS = 60_000;
const BURST_LIMIT = 5;

/** Server-side sign-in. Session cookies are set HttpOnly by the Supabase server client. */
export const POST = handle(async (request: Request) => {
  const ip = clientIp(request);
  await enforceRateLimit(request, "login-ip", ip, 20, 10 * 60_000);
  const { email, password } = await parseJson(request, LoginSchema);
  await enforceRateLimit(request, "login-email", email, 10, 15 * 60_000);

  const supabase = await createServerSupabase();
  if (!supabase) throw new AppError("accounts_unconfigured", "Accounts are not configured on this server.", 503);

  const burstKey = `login-failures:${pseudonymize(ip)}`;
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) {
    const recent = recordFailure(burstKey, BURST_WINDOW_MS);
    securityEvent("login_failed", request, { account: pseudonymize(email), recent_failures: recent });
    if (recent >= BURST_LIMIT) {
      securityEvent("suspicious_login_activity", request, { recent_failures: recent, window_seconds: BURST_WINDOW_MS / 1000 });
      throw new AppError("rate_limited", "Too many failed sign-in attempts. Please wait a minute and try again.", 429, true);
    }
    if (/email not confirmed/i.test(error.message)) {
      throw new AppError("unauthorized", "Please confirm your email address first. Check your inbox for the link.", 401);
    }
    // Same message whether or not the email exists, so accounts cannot be enumerated.
    throw new AppError("unauthorized", "That email and password do not match an account.", 401);
  }
  clearFailures(burstKey);
  // Clinic staff land in the clinic portal; everyone else in the patient app. RLS limits this to the caller's own rows.
  const { count } = await supabase
    .from("organization_memberships")
    .select("id", { count: "exact", head: true })
    .eq("user_id", data.user.id)
    .eq("status", "active");
  const home = count ? "/clinic/dashboard" : "/dashboard";
  // Accounts with two-factor get a password-only (aal1) session; the code step upgrades it.
  return ok({ ok: true, home, mfa_required: needsSecondStep(await mfaState(supabase)) });
});
