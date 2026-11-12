import { AppError } from "@/lib/api/errors";
import { handle, ok, parseJson } from "@/lib/api/route-utils";
import { LEGAL_VERSIONS } from "@/lib/legal";
import { requireUser } from "@/lib/supabase/server";
import { AcceptLegalSchema, MarketingSchema } from "@/schemas/legal";
import { getLegalStatus } from "@/services/legal-service";

/** The signed-in user's agreements and marketing preference. */
export const GET = handle(async () => {
  const { supabase, user } = await requireUser();
  return ok(await getLegalStatus(supabase, user.id));
});

/**
 * Records acceptance of the CURRENT version of each document. The client cannot choose the
 * version or the time: both are set on the server.
 */
export const POST = handle(async (request: Request) => {
  const { supabase, user } = await requireUser();
  const { documents } = await parseJson(request, AcceptLegalSchema);
  const rows = [...new Set(documents)].map((document) => ({
    user_id: user.id,
    document,
    version: LEGAL_VERSIONS[document],
    source: "in_app",
  }));
  const { error } = await supabase.from("legal_acceptances").upsert(rows, { onConflict: "user_id,document,version", ignoreDuplicates: true });
  if (error) throw new AppError("database_error", "We could not record your agreement. Please try again.", 500, true);
  return ok(await getLegalStatus(supabase, user.id));
});

/** Marketing preference: separate from terms acceptance, off by default, changeable any time. */
export const PATCH = handle(async (request: Request) => {
  const { supabase, user } = await requireUser();
  const { marketing_opt_in } = await parseJson(request, MarketingSchema);
  const { error } = await supabase
    .from("profiles")
    .upsert({ id: user.id, marketing_opt_in, marketing_opt_in_at: marketing_opt_in ? new Date().toISOString() : null });
  if (error) throw new AppError("database_error", "We could not save your preference.", 500, true);
  return ok(await getLegalStatus(supabase, user.id));
});
