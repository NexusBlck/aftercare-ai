import { handle, ok } from "@/lib/api/route-utils";
import { requireUser } from "@/lib/supabase/server";
import { getCurrentPlanId, loadBundle } from "@/services/plan-repository";

/** The signed-in user's active plan, or null if they have not started one. */
export const GET = handle(async () => {
  const { supabase, user } = await requireUser();
  const planId = await getCurrentPlanId(supabase, user.id);
  return ok({ bundle: planId ? await loadBundle(supabase, user.id, planId) : null });
});
