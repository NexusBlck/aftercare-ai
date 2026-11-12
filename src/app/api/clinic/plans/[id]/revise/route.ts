import { handle, ok } from "@/lib/api/route-utils";
import { requireClinic, requireId, rpc } from "@/lib/clinic/server";

/** Starts a new draft version from the latest version. The approved version stays active until the new one is approved. */
export const POST = handle(async (_req: Request, ctx: RouteContext<"/api/clinic/plans/[id]/revise">) => {
  const { id } = await ctx.params;
  const clinic = await requireClinic("plans.edit");
  const versionId = await rpc<string>(clinic, "revise_plan", { p_plan: requireId(id, "plan") }, "start a revision");
  return ok({ version_id: versionId }, { status: 201 });
});
