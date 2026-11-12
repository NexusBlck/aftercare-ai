import { handle, ok, parseJson } from "@/lib/api/route-utils";
import { mapDbError } from "@/lib/clinic/db-errors";
import { logClinicEvent, requireClinic } from "@/lib/clinic/server";
import { EpisodeSchema } from "@/schemas/clinic";
import { getPatient } from "@/services/clinic-service";

export const POST = handle(async (request: Request, ctx: RouteContext<"/api/clinic/patients/[id]/episodes">) => {
  const { id } = await ctx.params;
  const clinic = await requireClinic("patients.write");
  const patient = await getPatient(clinic, id);
  const body = await parseJson(request, EpisodeSchema);
  const { data, error } = await clinic.supabase
    .from("care_episodes")
    .insert({ ...body, organization_id: clinic.orgId, patient_id: patient.id })
    .select("*")
    .single();
  if (error) throw mapDbError(error, "create the care episode");
  await logClinicEvent(clinic, "episode.created", "care_episode", data.id);
  return ok({ episode: data }, { status: 201 });
});
