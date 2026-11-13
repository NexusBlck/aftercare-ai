import "server-only";
import type { SupabaseClient, User } from "@supabase/supabase-js";
import { AppError } from "@/lib/api/errors";

export interface MfaState {
  /** "aal2" once the second step was completed in this session. */
  currentLevel: string | null;
  /** "aal2" when the account has a verified factor, so the session must reach aal2. */
  nextLevel: string | null;
}

/**
 * Assurance level of the current session. `user` must come from a fresh auth.getUser() (as requireUser
 * and sign-in provide): the copy of the user inside the session cookie can be out of date, e.g. after
 * two-factor was turned on from another device, while the database always checks the live factors.
 */
export async function mfaState(supabase: SupabaseClient, user: User): Promise<MfaState> {
  const { data, error } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
  if (error) throw new AppError("unauthorized", "Your session has expired. Please sign in again.", 401);
  const hasVerifiedFactor = (user.factors ?? []).some((f) => f.status === "verified");
  return { currentLevel: data.currentLevel, nextLevel: hasVerifiedFactor ? "aal2" : (data.currentLevel ?? "aal1") };
}

/** The account has a verified factor that this session has not completed. */
export function needsSecondStep(state: MfaState): boolean {
  return state.nextLevel === "aal2" && state.currentLevel !== "aal2";
}

/** Verified authenticator-app factors of the signed-in user. */
export async function verifiedTotpFactors(supabase: SupabaseClient) {
  const { data, error } = await supabase.auth.mfa.listFactors();
  if (error) throw new AppError("unauthorized", "Your session has expired. Please sign in again.", 401);
  return data.totp;
}
