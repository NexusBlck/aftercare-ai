import { enforceRateLimit } from "@/lib/api/auth-guards";
import { handle, ok } from "@/lib/api/route-utils";
import { requireClinic, rpc } from "@/lib/clinic/server";
import { getPatient } from "@/services/clinic-service";

/**
 * Creates a patient invitation (the previous pending one is withdrawn). Nothing is sent: delivery is
 * manual until a messaging provider is configured, and the UI says so. The link carries only a random
 * token in the URL fragment (never sent to servers or logs); the patient must also confirm their
 * date of birth.
 */
export const POST = handle(async (request: Request, ctx: RouteContext<"/api/clinic/patients/[id]/invitations">) => {
  const { id } = await ctx.params;
  const clinic = await requireClinic("invitations.manage");
  enforceRateLimit(request, "patient-invite", clinic.user.id, 30, 60 * 60_000);
  const patient = await getPatient(clinic, id);
  const rows = await rpc<Array<{ invitation_id: string; token: string; expires_at: string }>>(
    clinic,
    "create_patient_invitation",
    { p_patient: patient.id, p_ttl_hours: 72 },
    "create the invitation",
  );
  const origin = new URL(request.url).origin;
  return ok(
    { invitation_id: rows[0].invitation_id, expires_at: rows[0].expires_at, link: `${origin}/invitation#t=${rows[0].token}`, delivery: "manual" },
    { status: 201 },
  );
});
