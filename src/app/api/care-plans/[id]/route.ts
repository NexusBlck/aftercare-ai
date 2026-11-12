import type { NextRequest } from "next/server";
import { handle, ok, parseJson } from "@/lib/api/route-utils";
import { requireUser } from "@/lib/supabase/server";
import { loadBundle } from "@/services/plan-repository";
import { mutatePlan } from "@/services/plan-service";
import { PlanPatchSchema } from "@/schemas/domain";

export const GET = handle(async (_req: NextRequest, ctx: RouteContext<"/api/care-plans/[id]">) => {
  const { id } = await ctx.params;
  const { supabase, user } = await requireUser();
  return ok({ bundle: await loadBundle(supabase, user.id, id) });
});

export const PATCH = handle(async (req: NextRequest, ctx: RouteContext<"/api/care-plans/[id]">) => {
  const { id } = await ctx.params;
  const auth = await requireUser();
  const body = await parseJson(req, PlanPatchSchema);
  const now = new Date().toISOString();
  const bundle = await mutatePlan(auth, id, (b) => ({
    ...b,
    plan: { ...b.plan, ...(body.title ? { title: body.title } : {}), updated_at: now },
  }));
  return ok({ bundle });
});
