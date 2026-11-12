import { AppError } from "@/lib/api/errors";
import { handle, ok, parseJson } from "@/lib/api/route-utils";
import { mapDbError } from "@/lib/clinic/db-errors";
import { assignableRoles } from "@/lib/clinic/permissions";
import { requireClinic, rpc } from "@/lib/clinic/server";
import { StaffInviteSchema } from "@/schemas/clinic";

/** Staff list. Everyone in the clinic can see colleagues; invitations are visible to owners/admins (RLS). */
export const GET = handle(async () => {
  const ctx = await requireClinic("patients.read");
  const [members, invitations] = await Promise.all([
    ctx.supabase
      .from("organization_memberships")
      .select("id, user_id, role, clinical_reviewer, status, display_name, email, created_at, revoked_at")
      .eq("organization_id", ctx.orgId)
      .order("created_at"),
    ctx.supabase
      .from("staff_invitations")
      .select("id, email, role, clinical_reviewer, expires_at, accepted_at, revoked_at, created_at")
      .eq("organization_id", ctx.orgId)
      .is("accepted_at", null)
      .is("revoked_at", null)
      .order("created_at", { ascending: false }),
  ]);
  if (members.error) throw mapDbError(members.error, "load staff");
  return ok({ members: members.data, invitations: invitations.data ?? [], me: ctx.member.id, assignable: assignableRoles(ctx.member) });
});

/**
 * Creates a staff invitation. No email is sent: the link is shown once to the inviter to share
 * through a channel the clinic trusts. Only the token's hash is stored.
 */
export const POST = handle(async (request: Request) => {
  const ctx = await requireClinic("staff.manage");
  const body = await parseJson(request, StaffInviteSchema);
  if (!assignableRoles(ctx.member).includes(body.role)) throw new AppError("forbidden", "Your role cannot invite that role.", 403);
  const rows = await rpc<Array<{ invitation_id: string; token: string; expires_at: string }>>(
    ctx,
    "create_staff_invitation",
    { p_org: ctx.orgId, p_email: body.email, p_role: body.role, p_clinical_reviewer: body.clinical_reviewer },
    "create the invitation",
  );
  const inv = rows[0];
  const origin = new URL(request.url).origin;
  return ok({ invitation_id: inv.invitation_id, expires_at: inv.expires_at, link: `${origin}/clinic/join#t=${inv.token}`, delivery: "manual" }, { status: 201 });
});
