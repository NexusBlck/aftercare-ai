import "server-only";
import { handle, ok, parseJson } from "@/lib/api/route-utils";
import { defaultContext } from "@/lib/domain/context";
import { applyItemPatch, type ItemKind } from "@/lib/domain/patch";
import { requireUser } from "@/lib/supabase/server";
import { ItemPatchSchema } from "@/schemas/domain";
import { planIdForRecord } from "./plan-repository";
import { mutatePlan } from "./plan-service";

/**
 * PATCH handler shared by /api/medications/[id], /api/tasks/[id], /api/follow-ups/[id],
 * /api/warning-signs/[id] and /api/flags/[id]. Ownership is verified before the patch is applied.
 */
export function itemPatchRoute(kind: Exclude<ItemKind, "encounter">, table: string) {
  return handle(async (request: Request, ctx: { params: Promise<{ id: string }> }) => {
    const { id } = await ctx.params;
    const auth = await requireUser();
    const patch = await parseJson(request, ItemPatchSchema);
    const planId = await planIdForRecord(auth.supabase, auth.user.id, table, id);
    const bundle = await mutatePlan(auth, planId, (b) => applyItemPatch(b, kind, id, patch, defaultContext()));
    return ok({ bundle });
  });
}
