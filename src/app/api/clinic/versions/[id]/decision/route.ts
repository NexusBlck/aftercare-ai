import { AppError } from "@/lib/api/errors";
import { handle, ok, parseJson } from "@/lib/api/route-utils";
import { approvalReadiness } from "@/lib/clinic/plan-editing";
import { requireClinic, rpc } from "@/lib/clinic/server";
import { DecisionSchema } from "@/schemas/clinic";
import { getVersion } from "@/services/clinic-service";

/**
 * Clinical decision on a submitted version. Approval requires the reviewer's explicit attestation and
 * no open flags; the database records the clinician, time and version and refuses non-reviewers.
 */
export const POST = handle(async (request: Request, ctx: RouteContext<"/api/clinic/versions/[id]/decision">) => {
  const { id } = await ctx.params;
  const clinic = await requireClinic("plans.decide");
  const body = await parseJson(request, DecisionSchema);
  const version = await getVersion(clinic, id);
  if (body.decision === "approved") {
    if (body.attest !== true) {
      throw new AppError("invalid_request", "Confirm that you have compared the plan with the source documents.", 400);
    }
    const issues = approvalReadiness(version.bundle);
    if (issues.length > 0) throw new AppError("conflict", issues.map((i) => i.message).join(" "), 409);
  }
  await rpc(clinic, "decide_plan_version", { p_version: id, p_decision: body.decision, p_comments: body.comments ?? null }, "record the decision");
  return ok({ status: body.decision });
});
