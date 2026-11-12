import { enforceRateLimit } from "@/lib/api/auth-guards";
import { sendEmail } from "@/lib/email/mailer";
import { welcomeEmail } from "@/lib/email/templates";
import { AppError } from "@/lib/api/errors";
import { handle, ok, parseJson } from "@/lib/api/route-utils";
import { LEGAL_VERSIONS } from "@/lib/legal";
import { clientIp } from "@/lib/security/audit-log";
import { createServerSupabase } from "@/lib/supabase/server";
import { SignupSchema } from "@/schemas/auth";

/**
 * Server-side sign-up. The required agreement (Terms, which include 18+ eligibility, Privacy Policy
 * and health-data processing) is validated as literal `true`. The accepted document versions
 * come from the server and are recorded by a database trigger.
 */
export const POST = handle(async (request: Request) => {
  enforceRateLimit(request, "signup-ip", clientIp(request), 5, 60 * 60_000);
  const { email, password, consents } = await parseJson(request, SignupSchema);
  const supabase = await createServerSupabase();
  if (!supabase) throw new AppError("accounts_unconfigured", "Accounts are not configured on this server.", 503);

  const origin = new URL(request.url).origin;
  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      emailRedirectTo: `${origin}/auth/callback?next=/onboarding`,
      data: {
        legal: { terms: LEGAL_VERSIONS.terms, privacy: LEGAL_VERSIONS.privacy, health_data: LEGAL_VERSIONS.health_data },
        age_confirmed: consents.accepted,
        marketing_opt_in: consents.marketing,
      },
    },
  });
  if (error) {
    if (error.status === 429) throw new AppError("rate_limited", "Too many sign-ups right now. Please try again later.", 429, true);
    if (/password/i.test(error.message)) throw new AppError("invalid_request", error.message, 400);
    throw new AppError("invalid_request", "We could not create the account. Please check your details and try again.", 400);
  }
  // A brand-new account has an identity. Supabase returns none for an already-registered address
  // when confirmation is on, so no welcome email is sent and the reply reveals nothing.
  if (data.user && (data.user.identities?.length ?? 0) > 0) {
    await sendEmail({ to: email, ...welcomeEmail({ appUrl: origin, marketingOptIn: consents.marketing }) });
  }
  return ok({ needsConfirmation: !data.session });
});
