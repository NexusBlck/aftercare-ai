import { handle, ok, parseJson } from "@/lib/api/route-utils";
import { mapDbError } from "@/lib/clinic/db-errors";
import { must } from "@/lib/clinic/server";
import { requireUser } from "@/lib/supabase/server";
import { ProgressSchema } from "@/schemas/clinic";

/** Patient marks an instruction read or a task done (or undoes it). The approved instructions are never changed. */
export const POST = handle(async (request: Request) => {
  const { supabase, user } = await requireUser();
  const body = await parseJson(request, ProgressSchema);
  // RLS returns the version only if it is the approved version of one of this patient's plans.
  const version = must(
    await supabase.from("plan_versions").select("id, organization_id, plan:recovery_plans(patient_id)").eq("id", body.version_id).maybeSingle(),
    "recovery plan",
  ) as unknown as { id: string; organization_id: string; plan: { patient_id: string } };

  if (body.done) {
    const { error } = await supabase.from("patient_progress").upsert(
      {
        organization_id: version.organization_id,
        patient_id: version.plan.patient_id,
        version_id: version.id,
        item_kind: body.item_kind,
        item_id: body.item_id,
        action: body.action,
        user_id: user.id,
      },
      { onConflict: "version_id,item_kind,item_id,action", ignoreDuplicates: true },
    );
    if (error) throw mapDbError(error, "save your progress");
  } else {
    const { error } = await supabase
      .from("patient_progress")
      .delete()
      .eq("version_id", version.id)
      .eq("item_kind", body.item_kind)
      .eq("item_id", body.item_id)
      .eq("action", body.action)
      .eq("user_id", user.id);
    if (error) throw mapDbError(error, "save your progress");
  }
  return ok({ saved: true });
});
