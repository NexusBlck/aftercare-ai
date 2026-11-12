import { handle, ok } from "@/lib/api/route-utils";
import { permissionsFor } from "@/lib/clinic/permissions";
import { loadMemberships, requireClinic, rpc } from "@/lib/clinic/server";
import { requireUser } from "@/lib/supabase/server";

/** Who am I in the clinic portal: memberships, the active clinic, my permissions and its entitlements. */
export const GET = handle(async () => {
  const auth = await requireUser();
  const memberships = await loadMemberships(auth);
  if (memberships.length === 0) {
    return ok({ user: { id: auth.user.id, email: auth.user.email ?? null }, memberships: [], active: null });
  }
  const ctx = await requireClinic();
  const [org, entitlements] = await Promise.all([
    ctx.supabase.from("organizations").select("*").eq("id", ctx.orgId).single(),
    rpc<Record<string, unknown>>(ctx, "organization_entitlements", { p_org: ctx.orgId }, "load your subscription"),
  ]);
  return ok({
    user: { id: auth.user.id, email: auth.user.email ?? null },
    memberships: memberships.map((m) => ({ organization_id: m.organization_id, name: m.organization.name, role: m.role })),
    active: {
      organization: org.data,
      member: { id: ctx.member.id, role: ctx.member.role, clinical_reviewer: ctx.member.clinical_reviewer, display_name: ctx.member.display_name },
      permissions: permissionsFor(ctx.member),
      entitlements,
    },
  });
});
