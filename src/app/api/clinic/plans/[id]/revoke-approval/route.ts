import { handle, ok, parseJson } from "@/lib/api/route-utils";
import { requireClinic, requireId, rpc } from "@/lib/clinic/server";
import { RevokeApprovalSchema } from "@/schemas/clinic";

/** Withdraws approval (e.g. an error was found). The patient no longer sees the plan until a new version is approved. */
export const POST = handle(async (request: Request, ctx: RouteContext<"/api/clinic/plans/[id]/revoke-approval">) => {
  const { id } = await ctx.params;
  const clinic = await requireClinic("plans.decide");
  const { reason } = await parseJson(request, RevokeApprovalSchema);
  await rpc(clinic, "revoke_plan_approval", { p_plan: requireId(id, "plan"), p_reason: reason }, "withdraw approval");
  return ok({ revoked: true });
});
