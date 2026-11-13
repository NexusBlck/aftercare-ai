import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { AppError } from "@/lib/api/errors";

export interface MfaState {
  /** "aal2" once the second step was completed in this session. */
  currentLevel: string | null;
  /** "aal2" when the account has a verified factor, so the session must reach aal2. */
  nextLevel: string | null;
}

/** Assurance level of the current session (decoded from the session; no network call). */
export async function mfaState(supabase: SupabaseClient): Promise<MfaState> {
  const { data, error } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
  if (error) throw new AppError("unauthorized", "Your session has expired. Please sign in again.", 401);
  return { currentLevel: data.currentLevel, nextLevel: data.nextLevel };
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
