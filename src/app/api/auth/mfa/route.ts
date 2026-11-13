import { enforceRateLimit } from "@/lib/api/auth-guards";
import { AppError } from "@/lib/api/errors";
import { handle, ok, parseJson } from "@/lib/api/route-utils";
import { loadMemberships } from "@/lib/clinic/server";
import { securityEvent } from "@/lib/security/audit-log";
import { mfaState, verifiedTotpFactors } from "@/lib/supabase/mfa";
import { requireUser } from "@/lib/supabase/server";
import { MfaFactorSchema } from "@/schemas/auth";

/**
 * Two-factor status of the signed-in user: verified authenticator apps, whether this session completed
 * the second step, and which clinics require it. Works before the second step, so it can explain.
 */
export const GET = handle(async () => {
  const auth = await requireUser();
  const [state, factors, memberships] = await Promise.all([mfaState(auth.supabase), verifiedTotpFactors(auth.supabase), loadMemberships(auth)]);
  return ok({
    enabled: factors.length > 0,
    verified_this_session: state.currentLevel === "aal2",
    factors: factors.map((f) => ({ id: f.id, name: f.friendly_name ?? "Authenticator app", created_at: f.created_at })),
    required_by: memberships.filter((m) => m.organization.require_mfa).map((m) => m.organization.name),
  });
});

/**
 * Starts setting up an authenticator app. Returns the QR code and secret once; nothing is active until
 * the first code is verified (POST /api/auth/mfa/verify). Abandoned set-ups are cleared first.
 */
export const POST = handle(async (request: Request) => {
  const { supabase, user } = await requireUser();
  enforceRateLimit(request, "mfa-enroll", user.id, 10, 60 * 60_000);
  const state = await mfaState(supabase);
  // Adding another factor to a protected account needs the existing one first.
  if (state.nextLevel === "aal2" && state.currentLevel !== "aal2") {
    throw new AppError("mfa_required", "Enter the code from your authenticator app to continue.", 401);
  }
  const { data: list } = await supabase.auth.mfa.listFactors();
  for (const f of list?.all ?? []) {
    if (f.factor_type === "totp" && f.status === "unverified") await supabase.auth.mfa.unenroll({ factorId: f.id });
  }
  const { data, error } = await supabase.auth.mfa.enroll({ factorType: "totp", friendlyName: `Authenticator ${new Date().toISOString().slice(0, 10)}` });
  if (error || !data) throw new AppError("invalid_request", "We could not start two-factor set-up. Please try again.", 400);
  return ok({ factor_id: data.id, qr_code: data.totp.qr_code, secret: data.totp.secret }, { status: 201 });
});

/** Turns off an authenticator app. Needs a two-factor session; refused while a clinic requires it. */
export const DELETE = handle(async (request: Request) => {
  const auth = await requireUser();
  enforceRateLimit(request, "mfa-remove", auth.user.id, 10, 60 * 60_000);
  const { factor_id } = await parseJson(request, MfaFactorSchema);
  const state = await mfaState(auth.supabase);
  if (state.currentLevel !== "aal2") {
    throw new AppError("mfa_required", "Enter the code from your authenticator app before turning two-factor off.", 401);
  }
  const [factors, memberships] = await Promise.all([verifiedTotpFactors(auth.supabase), loadMemberships(auth)]);
  const requiring = memberships.filter((m) => m.organization.require_mfa);
  if (requiring.length > 0 && factors.length <= 1 && factors.some((f) => f.id === factor_id)) {
    throw new AppError("forbidden", `${requiring[0].organization.name} requires two-factor authentication, so it cannot be turned off.`, 403);
  }
  const { error } = await auth.supabase.auth.mfa.unenroll({ factorId: factor_id });
  if (error) throw new AppError("invalid_request", "We could not turn off two-factor authentication.", 400);
  securityEvent("mfa_disabled", request, {});
  return ok({ ok: true });
});
