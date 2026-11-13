import { cookies } from "next/headers";
import { enforceRateLimit } from "@/lib/api/auth-guards";
import { handle, ok, parseJson } from "@/lib/api/route-utils";
import { ACTIVE_ORG_COOKIE, rpc } from "@/lib/clinic/server";
import { AUTH_COOKIE_OPTIONS } from "@/lib/supabase/cookie-options";
import { requireUser } from "@/lib/supabase/server";
import { AcceptStaffInviteSchema } from "@/schemas/clinic";

/** Accepts a staff invitation. The database checks the token hash, expiry, single use and that the signed-in email matches. */
export const POST = handle(async (request: Request) => {
  const auth = await requireUser();
  enforceRateLimit(request, "staff-join", auth.user.id, 10, 15 * 60_000);
  const { token, display_name } = await parseJson(request, AcceptStaffInviteSchema);
  const orgId = await rpc<string>(auth, "accept_staff_invitation", { p_token: token, p_display_name: display_name ?? null }, "accept the invitation");
  (await cookies()).set(ACTIVE_ORG_COOKIE, orgId, { ...AUTH_COOKIE_OPTIONS });
  return ok({ organization_id: orgId });
});
