import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { AppError } from "@/lib/api/errors";
import { LEGAL_DOCUMENTS, LEGAL_VERSIONS } from "@/lib/legal";
import type { LegalStatus } from "@/schemas/legal";

/** What the signed-in user has agreed to, and which current versions they still need to accept. */
export async function getLegalStatus(supabase: SupabaseClient, userId: string): Promise<LegalStatus> {
  const [{ data: rows, error }, { data: profile }] = await Promise.all([
    supabase
      .from("legal_acceptances")
      .select("document,version,accepted_at,source")
      .eq("user_id", userId)
      .order("accepted_at", { ascending: false }),
    supabase.from("profiles").select("marketing_opt_in,marketing_opt_in_at").eq("id", userId).maybeSingle(),
  ]);
  if (error) throw new AppError("database_error", "We could not load your agreements.", 500, true);
  const accepted = (rows ?? []) as LegalStatus["accepted"];
  const needs = LEGAL_DOCUMENTS.filter((doc) => !accepted.some((a) => a.document === doc && a.version === LEGAL_VERSIONS[doc]));
  return {
    required: { ...LEGAL_VERSIONS },
    accepted,
    needs,
    marketing_opt_in: profile?.marketing_opt_in ?? false,
    marketing_opt_in_at: profile?.marketing_opt_in_at ?? null,
  };
}
