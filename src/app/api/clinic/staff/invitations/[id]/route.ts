import { handle, ok } from "@/lib/api/route-utils";
import { requireClinic, requireId, rpc } from "@/lib/clinic/server";

export const DELETE = handle(async (_req: Request, ctx: RouteContext<"/api/clinic/staff/invitations/[id]">) => {
  const { id } = await ctx.params;
  const clinic = await requireClinic("staff.manage");
  await rpc(clinic, "revoke_staff_invitation", { p_invitation: requireId(id, "invitation") }, "withdraw the invitation");
  return ok({ revoked: true });
});
