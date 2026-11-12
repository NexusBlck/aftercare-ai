import { handle, ok, parseJson } from "@/lib/api/route-utils";
import { AppError } from "@/lib/api/errors";
import { requireUser } from "@/lib/supabase/server";
import { DEFAULT_PLAN_TITLE } from "@/lib/domain/plan";
import { listPlans, loadBundle } from "@/services/plan-repository";
import { CreatePlanSchema } from "@/schemas/domain";

export const GET = handle(async () => {
  const { supabase, user } = await requireUser();
  return ok({ plans: await listPlans(supabase, user.id) });
});

export const POST = handle(async (request: Request) => {
  const { supabase, user } = await requireUser();
  const body = await parseJson(request, CreatePlanSchema);
  const { data, error } = await supabase
    .from("care_plans")
    .insert({ user_id: user.id, title: body.title?.trim() || DEFAULT_PLAN_TITLE })
    .select("id")
    .single();
  if (error || !data) throw new AppError("database_error", "We could not create your care plan.", 500, true);
  return ok({ bundle: await loadBundle(supabase, user.id, data.id) }, { status: 201 });
});
