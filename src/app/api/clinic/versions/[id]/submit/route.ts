import { AppError } from "@/lib/api/errors";
import { handle, ok } from "@/lib/api/route-utils";
import { approvalReadiness } from "@/lib/clinic/plan-editing";
import { requireClinic, rpc } from "@/lib/clinic/server";
import { getVersion } from "@/services/clinic-service";

/** Sends a draft for clinical review. Open flags and empty plans are refused before they reach a reviewer. */
export const POST = handle(async (_req: Request, ctx: RouteContext<"/api/clinic/versions/[id]/submit">) => {
  const { id } = await ctx.params;
  const clinic = await requireClinic("plans.submit");
  const version = await getVersion(clinic, id);
  const issues = approvalReadiness(version.bundle);
  if (issues.length > 0) throw new AppError("conflict", issues.map((i) => i.message).join(" "), 409);
  await rpc(clinic, "submit_plan_version", { p_version: id }, "submit the plan");
  return ok({ status: "pending_review" });
});
