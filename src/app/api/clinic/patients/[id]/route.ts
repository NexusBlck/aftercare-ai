import { AppError } from "@/lib/api/errors";
import { handle, ok, parseJson } from "@/lib/api/route-utils";
import { mapDbError } from "@/lib/clinic/db-errors";
import { can } from "@/lib/clinic/permissions";
import { logClinicEvent, requireClinic } from "@/lib/clinic/server";
import { UpdatePatientSchema } from "@/schemas/clinic";
import { getPatient, listFollowUps, PATIENT_COLUMNS } from "@/services/clinic-service";

/** Patient record with episodes, documents, plans, invitations, questions and follow-ups. */
export const GET = handle(async (_req: Request, ctx: RouteContext<"/api/clinic/patients/[id]">) => {
  const { id } = await ctx.params;
  const clinic = await requireClinic("patients.read");
  const patient = await getPatient(clinic, id);
  const db = clinic.supabase;
  const org = clinic.orgId;

  const [episodes, documents, plans, invitations, questions, progress] = await Promise.all([
    db.from("care_episodes").select("*").eq("organization_id", org).eq("patient_id", id).order("created_at", { ascending: false }),
    db
      .from("clinic_documents")
      .select("id, episode_id, original_filename, mime_type, file_size, document_type, processing_status, processing_error, shared_with_patient, created_at")
      .eq("organization_id", org)
      .eq("patient_id", id)
      .order("created_at", { ascending: false }),
    db
      .from("recovery_plans")
      .select("id, episode_id, title, approved_version_id, created_at, versions:plan_versions!plan_versions_plan_id_organization_id_fkey(id, version, status, updated_at)")
      .eq("organization_id", org)
      .eq("patient_id", id),
    db
      .from("patient_invitations")
      .select("id, expires_at, redeemed_at, revoked_at, failed_attempts, delivery_status, created_at")
      .eq("organization_id", org)
      .eq("patient_id", id)
      .order("created_at", { ascending: false }),
    db.from("patient_questions").select("id, subject, status, urgent_keywords, updated_at").eq("organization_id", org).eq("patient_id", id).order("updated_at", { ascending: false }),
    db.from("patient_progress").select("version_id, item_kind, item_id, action, created_at").eq("organization_id", org).eq("patient_id", id).order("created_at", { ascending: false }),
  ]);
  const failed = [episodes, documents, plans, invitations, questions, progress].find((r) => r.error);
  if (failed?.error) throw mapDbError(failed.error, "load the patient");

  return ok({
    patient,
    episodes: episodes.data,
    documents: documents.data,
    plans: plans.data,
    invitations: invitations.data,
    questions: questions.data,
    progress: progress.data,
    followUps: await listFollowUps(clinic, id),
  });
});

export const PATCH = handle(async (request: Request, ctx: RouteContext<"/api/clinic/patients/[id]">) => {
  const { id } = await ctx.params;
  const clinic = await requireClinic("patients.write");
  const body = await parseJson(request, UpdatePatientSchema);
  if (body.status && !can(clinic.member, "patients.archive")) {
    throw new AppError("forbidden", "Only clinic owners and administrators can archive or restore patients.", 403);
  }
  await getPatient(clinic, id);
  const { data, error } = await clinic.supabase
    .from("clinic_patients")
    .update(body)
    .eq("id", id)
    .eq("organization_id", clinic.orgId)
    .select(PATIENT_COLUMNS)
    .single();
  if (error) throw mapDbError(error, "save the patient");
  await logClinicEvent(clinic, "patient.updated", "clinic_patient", id, body.status ? { status: body.status } : {});
  return ok({ patient: data });
});
