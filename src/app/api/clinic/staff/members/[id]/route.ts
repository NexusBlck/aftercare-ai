import { handle, ok, parseJson } from "@/lib/api/route-utils";
import { requireClinic, requireId, rpc } from "@/lib/clinic/server";
import { MemberPatchSchema } from "@/schemas/clinic";

/** Changes a member's role or revokes/reinstates access. Rules (owner vs admin, no self-change) are enforced in the database. */
export const PATCH = handle(async (request: Request, ctx: RouteContext<"/api/clinic/staff/members/[id]">) => {
  const { id } = await ctx.params;
  const clinic = await requireClinic("staff.manage");
  const body = await parseJson(request, MemberPatchSchema);
  await rpc(
    clinic,
    "update_member",
    { p_membership: requireId(id, "staff member"), p_role: body.role ?? null, p_clinical_reviewer: body.clinical_reviewer ?? null, p_status: body.status ?? null },
    "update the staff member",
  );
  return ok({ updated: true });
});
