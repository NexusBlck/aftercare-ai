import { handle, ok } from "@/lib/api/route-utils";
import { mapDbError } from "@/lib/clinic/db-errors";
import { requireUser } from "@/lib/supabase/server";
import { parseBundle } from "@/services/clinic-service";

/**
 * Everything the signed-in patient may see from the clinics that invited them: only *approved* plan
 * versions (RLS), who approved them, their own progress, follow-up reports, questions and documents
 * the clinic explicitly shared. Patients never see drafts.
 */
export const GET = handle(async () => {
  const { supabase, user } = await requireUser();
  const { data: records, error } = await supabase
    .from("clinic_patients")
    .select("id, organization_id, full_name, preferred_language, organization:organizations(id, name, contact_phone, contact_email, communication_hours, emergency_instructions)")
    .eq("user_id", user.id)
    .eq("status", "active");
  if (error) throw mapDbError(error, "load your care team");
  if (!records?.length) return ok({ clinics: [] });

  const patientIds = records.map((r) => r.id as string);
  const { data: plans, error: planError } = await supabase
    .from("recovery_plans")
    .select("id, patient_id, title, approved_version_id, episode:care_episodes(title, discharge_date, department)")
    .in("patient_id", patientIds)
    .not("approved_version_id", "is", null);
  if (planError) throw mapDbError(planError, "load your plans");
  const versionIds = (plans ?? []).map((p) => p.approved_version_id as string);
  const planIds = (plans ?? []).map((p) => p.id as string);

  const [versions, approvals, progress, tracking, questions, documents] = await Promise.all([
    versionIds.length ? supabase.from("plan_versions").select("id, plan_id, version, bundle, decided_at").in("id", versionIds) : Promise.resolve({ data: [], error: null }),
    versionIds.length
      ? supabase.from("clinical_approvals").select("version_id, clinician_name, decided_at").in("version_id", versionIds).eq("decision", "approved")
      : Promise.resolve({ data: [], error: null }),
    supabase.from("patient_progress").select("version_id, item_kind, item_id, action, created_at").eq("user_id", user.id),
    planIds.length ? supabase.from("follow_up_tracking").select("plan_id, follow_up_item_id, patient_status, patient_note, staff_status").in("plan_id", planIds) : Promise.resolve({ data: [], error: null }),
    supabase.from("patient_questions").select("id, patient_id, subject, status, updated_at").in("patient_id", patientIds).order("updated_at", { ascending: false }),
    supabase.from("clinic_documents").select("id, patient_id, original_filename, document_type, created_at").in("patient_id", patientIds).eq("shared_with_patient", true),
  ]);
  const failed = [versions, approvals, progress, tracking, questions, documents].find((r) => r.error);
  if (failed?.error) throw mapDbError(failed.error, "load your care team");

  const clinics = records.map((record) => ({
    patient_id: record.id,
    organization: record.organization,
    plans: (plans ?? [])
      .filter((p) => p.patient_id === record.id)
      .map((p) => {
        const v = (versions.data ?? []).find((x) => x.id === p.approved_version_id);
        const approval = (approvals.data ?? []).find((a) => a.version_id === p.approved_version_id);
        return {
          id: p.id,
          title: p.title,
          episode: p.episode,
          version_id: p.approved_version_id,
          version: v?.version ?? null,
          bundle: v ? parseBundle(v.bundle) : null,
          approved_by: approval?.clinician_name ?? null,
          approved_at: approval?.decided_at ?? v?.decided_at ?? null,
          progress: (progress.data ?? []).filter((x) => x.version_id === p.approved_version_id),
          follow_ups: (tracking.data ?? []).filter((x) => x.plan_id === p.id),
        };
      }),
    questions: (questions.data ?? []).filter((q) => q.patient_id === record.id),
    documents: (documents.data ?? []).filter((d) => d.patient_id === record.id),
  }));
  return ok({ clinics });
});
