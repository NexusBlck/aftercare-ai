import type { NextRequest } from "next/server";
import { handle, ok, parseJson } from "@/lib/api/route-utils";
import { defaultContext } from "@/lib/domain/context";
import { applyItemPatch } from "@/lib/domain/patch";
import { requireUser } from "@/lib/supabase/server";
import { mutatePlan } from "@/services/plan-service";
import { ItemPatchSchema } from "@/schemas/domain";

export const PATCH = handle(async (req: NextRequest, ctx: RouteContext<"/api/care-plans/[id]/encounter/[field]">) => {
  const { id, field } = await ctx.params;
  const auth = await requireUser();
  const patch = await parseJson(req, ItemPatchSchema);
  const bundle = await mutatePlan(auth, id, (b) => applyItemPatch(b, "encounter", field, patch, defaultContext()));
  return ok({ bundle });
});
