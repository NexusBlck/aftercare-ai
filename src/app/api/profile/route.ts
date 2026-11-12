import { handle, ok, parseJson } from "@/lib/api/route-utils";
import { requireUser } from "@/lib/supabase/server";
import { AppError } from "@/lib/api/errors";
import { ProfileSchema } from "@/schemas/domain";

export const GET = handle(async () => {
  const { supabase, user } = await requireUser();
  const { data, error } = await supabase
    .from("profiles")
    .select("display_name,preferred_language,onboarded")
    .eq("id", user.id)
    .maybeSingle();
  if (error) throw new AppError("database_error", "We could not load your profile.", 500, true);
  return ok({
    profile: data ?? { display_name: null, preferred_language: "en", onboarded: false },
    email: user.email ?? null,
  });
});

export const PUT = handle(async (request: Request) => {
  const { supabase, user } = await requireUser();
  const body = await parseJson(request, ProfileSchema);
  const { error } = await supabase
    .from("profiles")
    .upsert({ id: user.id, display_name: body.display_name || null, preferred_language: body.preferred_language, onboarded: true });
  if (error) throw new AppError("database_error", "We could not save your profile.", 500, true);
  return ok({ profile: { ...body, onboarded: true } });
});
