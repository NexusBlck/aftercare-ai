import { cookies } from "next/headers";
import { AppError } from "@/lib/api/errors";
import { handle, ok, parseJson } from "@/lib/api/route-utils";
import { ACTIVE_ORG_COOKIE, loadMemberships } from "@/lib/clinic/server";
import { AUTH_COOKIE_OPTIONS } from "@/lib/supabase/cookie-options";
import { requireUser } from "@/lib/supabase/server";
import { ActiveOrgSchema } from "@/schemas/clinic";

/** Switches the clinic a staff member works in. Only clinics they are an active member of are accepted. */
export const POST = handle(async (request: Request) => {
  const { organization_id } = await parseJson(request, ActiveOrgSchema);
  const memberships = await loadMemberships(await requireUser());
  if (!memberships.some((m) => m.organization_id === organization_id)) throw new AppError("not_found", "That clinic was not found.", 404);
  (await cookies()).set(ACTIVE_ORG_COOKIE, organization_id, { ...AUTH_COOKIE_OPTIONS });
  return ok({ organization_id });
});
