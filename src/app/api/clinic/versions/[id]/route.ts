import { AppError } from "@/lib/api/errors";
import { handle, ok, parseJson } from "@/lib/api/route-utils";
import { applyVersionEdit, approvalReadiness, VersionEditSchema } from "@/lib/clinic/plan-editing";
import { logClinicEvent, requireClinic } from "@/lib/clinic/server";
import { defaultContext } from "@/lib/domain/context";
import { z } from "zod";
import { getVersion, saveVersionBundle } from "@/services/clinic-service";

const BodySchema = z.object({ expected_updated_at: z.string().min(1).max(40), edit: VersionEditSchema });

/**
 * Clinician edit to a draft version. `expected_updated_at` makes concurrent edits fail safely with a
 * 409 instead of silently overwriting a colleague's change.
 */
export const PATCH = handle(async (request: Request, ctx: RouteContext<"/api/clinic/versions/[id]">) => {
  const { id } = await ctx.params;
  const clinic = await requireClinic("plans.edit");
  const { expected_updated_at, edit } = await parseJson(request, BodySchema);
  const version = await getVersion(clinic, id);
  if (!["draft", "changes_requested"].includes(version.status)) {
    throw new AppError("conflict", "Only draft versions can be edited. Start a new revision to change an approved plan.", 409);
  }
  if (version.updated_at !== expected_updated_at) {
    throw new AppError("conflict", "Someone else changed this plan while you were editing. Reload to see the latest version.", 409);
  }
  const next = applyVersionEdit(version.bundle, edit, defaultContext());
  const saved = next === version.bundle ? version : await saveVersionBundle(clinic, version, next);
  await logClinicEvent(clinic, "plan.edited", "plan_version", id, { op: edit.op, kind: "kind" in edit ? edit.kind : null });
  return ok({ version: saved, readiness: approvalReadiness(saved.bundle) });
});
