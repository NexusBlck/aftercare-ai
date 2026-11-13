import { enforceRateLimit } from "@/lib/api/auth-guards";
import { handle, ok, parseOptionalJson } from "@/lib/api/route-utils";
import { deliverInvitation } from "@/lib/clinic/invitation-delivery";
import { requireClinic, rpc } from "@/lib/clinic/server";
import { PatientInviteSchema } from "@/schemas/clinic";
import { getPatient } from "@/services/clinic-service";

/**
 * Creates a patient invitation (the previous pending one is withdrawn) and, when the clinic asks for it
 * and the patient has an email address on file, emails the link. The link carries only a random token
 * in the URL fragment (never sent to servers or logs); the patient must also confirm their date of
 * birth. The email names the clinic but contains no health information.
 */
export const POST = handle(async (request: Request, ctx: RouteContext<"/api/clinic/patients/[id]/invitations">) => {
  const { id } = await ctx.params;
  const clinic = await requireClinic("invitations.manage");
  enforceRateLimit(request, "patient-invite", clinic.user.id, 30, 60 * 60_000);
  const body = await parseOptionalJson(request, PatientInviteSchema);
  const patient = await getPatient(clinic, id);
  const rows = await rpc<Array<{ invitation_id: string; token: string; expires_at: string }>>(
    clinic,
    "create_patient_invitation",
    { p_patient: patient.id, p_ttl_hours: 72 },
    "create the invitation",
  );
  const origin = new URL(request.url).origin;
  const link = `${origin}/invitation#t=${rows[0].token}`;
  const delivery = body.send_email
    ? await deliverInvitation({ kind: "patient", to: patient.email, link, organization: clinic.member.organization.name, origin })
    : ({ delivery: "manual", email_status: "not_requested" } as const);
  return ok({ invitation_id: rows[0].invitation_id, expires_at: rows[0].expires_at, link, ...delivery }, { status: 201 });
});
