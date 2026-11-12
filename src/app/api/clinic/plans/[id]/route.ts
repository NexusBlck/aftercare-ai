import { handle, ok } from "@/lib/api/route-utils";
import { approvalReadiness } from "@/lib/clinic/plan-editing";
import { mapDbError } from "@/lib/clinic/db-errors";
import { requireClinic } from "@/lib/clinic/server";
import { getPlan, getVersion, memberNames } from "@/services/clinic-service";

/** Plan detail for review: version history, approvals, the working version and the approved version. */
export const GET = handle(async (_req: Request, ctx: RouteContext<"/api/clinic/plans/[id]">) => {
  const { id } = await ctx.params;
  const clinic = await requireClinic("patients.read");
  const plan = await getPlan(clinic, id);

  const [versions, approvals, patient, episode, documents, names] = await Promise.all([
    clinic.supabase
      .from("plan_versions")
      .select("id, version, status, created_by, submitted_by, submitted_at, decided_at, created_at, updated_at, based_on_version_id")
      .eq("plan_id", id)
      .eq("organization_id", clinic.orgId)
      .order("version", { ascending: false }),
    clinic.supabase.from("clinical_approvals").select("*").eq("plan_id", id).eq("organization_id", clinic.orgId).order("decided_at", { ascending: false }),
    clinic.supabase.from("clinic_patients").select("id, full_name, date_of_birth, mrn, preferred_language, linked_at").eq("id", plan.patient_id).eq("organization_id", clinic.orgId).single(),
    clinic.supabase.from("care_episodes").select("*").eq("id", plan.episode_id).eq("organization_id", clinic.orgId).single(),
    clinic.supabase
      .from("clinic_documents")
      .select("id, original_filename, mime_type, document_type, processing_status, processing_error, shared_with_patient, created_at")
      .eq("episode_id", plan.episode_id)
      .eq("organization_id", clinic.orgId)
      .order("created_at"),
    memberNames(clinic),
  ]);
  const failed = [versions, approvals, patient, episode, documents].find((r) => r.error);
  if (failed?.error) throw mapDbError(failed.error, "load the plan");

  const rows = versions.data ?? [];
  const working = rows.find((v) => ["draft", "pending_review", "changes_requested"].includes(v.status as string));
  const current = working ?? rows[0];
  const currentVersion = current ? await getVersion(clinic, current.id as string) : null;
  const approvedVersion =
    plan.approved_version_id && plan.approved_version_id !== currentVersion?.id ? await getVersion(clinic, plan.approved_version_id as string) : null;

  const name = (uid: unknown) => (typeof uid === "string" ? (names.get(uid) ?? "Former staff member") : null);
  return ok({
    plan,
    patient: patient.data,
    episode: episode.data,
    documents: documents.data,
    versions: rows.map((v) => ({ ...v, created_by_name: name(v.created_by), submitted_by_name: name(v.submitted_by) })),
    approvals: approvals.data,
    current: currentVersion,
    approved: approvedVersion,
    readiness: currentVersion ? approvalReadiness(currentVersion.bundle) : [],
  });
});
