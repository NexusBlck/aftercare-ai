import { cookies } from "next/headers";
import { enforceRateLimit } from "@/lib/api/auth-guards";
import { handle, ok, parseJson, requireChanges } from "@/lib/api/route-utils";
import { mapDbError } from "@/lib/clinic/db-errors";
import { ACTIVE_ORG_COOKIE, requireClinic, rpc } from "@/lib/clinic/server";
import { AUTH_COOKIE_OPTIONS } from "@/lib/supabase/cookie-options";
import { requireUser } from "@/lib/supabase/server";
import { CreateOrganizationSchema, UpdateOrganizationSchema } from "@/schemas/clinic";

function slugify(name: string): string {
  const base = name
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 36)
    .replace(/-+$/g, "");
  // A random suffix keeps slugs unguessable and unique; they are never used for access control.
  return `${base.length >= 2 ? base : "clinic"}-${crypto.randomUUID().slice(0, 6)}`;
}

/** Creates a clinic. The caller becomes its owner, atomically, inside the database. */
export const POST = handle(async (request: Request) => {
  const auth = await requireUser();
  enforceRateLimit(request, "org-create", auth.user.id, 5, 60 * 60_000);
  const body = await parseJson(request, CreateOrganizationSchema);
  const id = await rpc<string>(
    auth,
    "create_organization",
    {
      p_name: body.name,
      p_slug: slugify(body.name),
      p_org_type: body.org_type,
      p_contact_email: body.contact_email ?? null,
      p_contact_phone: body.contact_phone ?? null,
      p_city: body.city ?? null,
      p_owner_name: body.owner_name,
      p_owner_is_clinician: body.owner_is_clinician,
    },
    "create the clinic",
  );
  (await cookies()).set(ACTIVE_ORG_COOKIE, id, { ...AUTH_COOKIE_OPTIONS });
  return ok({ organization_id: id }, { status: 201 });
});

export const PATCH = handle(async (request: Request) => {
  const ctx = await requireClinic("org.manage");
  const body = requireChanges(await parseJson(request, UpdateOrganizationSchema));
  const { data, error } = await ctx.supabase.from("organizations").update(body).eq("id", ctx.orgId).select("*").single();
  if (error) throw mapDbError(error, "save the clinic profile");
  return ok({ organization: data });
});
