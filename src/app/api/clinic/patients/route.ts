import { AppError } from "@/lib/api/errors";
import { handle, ok, parseJson } from "@/lib/api/route-utils";
import { mapDbError } from "@/lib/clinic/db-errors";
import { logClinicEvent, requireClinic } from "@/lib/clinic/server";
import { CreatePatientSchema, PatientListQuerySchema } from "@/schemas/clinic";
import { escapeLike, PAGE_SIZE, PATIENT_COLUMNS, sanitizeSearch } from "@/services/clinic-service";

/** Paginated patient directory with search (name or clinic reference) and status filter. */
export const GET = handle(async (request: Request) => {
  const ctx = await requireClinic("patients.read");
  const params = Object.fromEntries(new URL(request.url).searchParams);
  const parsed = PatientListQuerySchema.safeParse(params);
  if (!parsed.success) throw new AppError("invalid_request", "The search was not valid.", 400);
  const { status, page } = parsed.data;
  const q = sanitizeSearch(parsed.data.q);

  let query = ctx.supabase
    .from("clinic_patients")
    .select(`${PATIENT_COLUMNS}, plans:recovery_plans(id, approved_version_id)`, { count: "exact" })
    .eq("organization_id", ctx.orgId)
    .order("created_at", { ascending: false })
    .range((page - 1) * PAGE_SIZE, page * PAGE_SIZE - 1);
  if (status !== "all") query = query.eq("status", status);
  if (q) query = query.or(`full_name.ilike.%${q}%,mrn.ilike.%${q}%`);
  const { data, count, error } = await query;
  if (error) throw mapDbError(error, "load patients");
  return ok({ patients: data ?? [], total: count ?? 0, page, pageSize: PAGE_SIZE });
});

/**
 * Registers a patient (and optionally their first care episode). Possible duplicates (same name and
 * date of birth, or same clinic reference) are reported back for confirmation instead of created twice.
 */
export const POST = handle(async (request: Request) => {
  const ctx = await requireClinic("patients.write");
  const { episode, confirm_duplicate, ...patient } = await parseJson(request, CreatePatientSchema);

  if (!confirm_duplicate) {
    const { data: similar, error } = await ctx.supabase
      .from("clinic_patients")
      .select("id, full_name, date_of_birth, mrn, status")
      .eq("organization_id", ctx.orgId)
      .eq("date_of_birth", patient.date_of_birth)
      .ilike("full_name", escapeLike(patient.full_name))
      .limit(5);
    if (error) throw mapDbError(error, "check for duplicates");
    if (similar && similar.length > 0) {
      return ok({ duplicate: true, matches: similar }, { status: 409 });
    }
  }

  const { data, error } = await ctx.supabase
    .from("clinic_patients")
    .insert({ ...patient, organization_id: ctx.orgId })
    .select(PATIENT_COLUMNS)
    .single();
  if (error) {
    if (error.code === "23505") throw new AppError("duplicate", "Another patient already uses this clinic reference (MRN).", 409);
    throw mapDbError(error, "register the patient");
  }
  await logClinicEvent(ctx, "patient.created", "clinic_patient", data.id);

  let episodeId: string | null = null;
  if (episode) {
    const { data: ep, error: epError } = await ctx.supabase
      .from("care_episodes")
      .insert({ ...episode, organization_id: ctx.orgId, patient_id: data.id })
      .select("id")
      .single();
    if (epError) throw mapDbError(epError, "create the care episode");
    episodeId = ep.id;
    await logClinicEvent(ctx, "episode.created", "care_episode", ep.id);
  }
  return ok({ patient: data, episode_id: episodeId }, { status: 201 });
});
