import { handle, ok } from "@/lib/api/route-utils";
import { mapDbError } from "@/lib/clinic/db-errors";
import { requireClinic } from "@/lib/clinic/server";
import { memberNames } from "@/services/clinic-service";

/** Review queue: versions awaiting a decision, plus drafts and returned versions still being prepared. */
export const GET = handle(async () => {
  const ctx = await requireClinic("patients.read");
  const { data, error } = await ctx.supabase
    .from("plan_versions")
    .select(
      "id, version, status, submitted_by, submitted_at, updated_at, flags:bundle->flags, plan:recovery_plans(id, title, approved_version_id, patient:clinic_patients(id, full_name, mrn))",
    )
    .eq("organization_id", ctx.orgId)
    .in("status", ["pending_review", "draft", "changes_requested"])
    .order("updated_at", { ascending: true })
    .limit(200);
  if (error) throw mapDbError(error, "load the review queue");
  const names = await memberNames(ctx);
  const items = (data ?? []).map((v) => {
    const flags = (v.flags as Array<{ status: string }> | null) ?? [];
    const { flags: _omit, ...rest } = v;
    void _omit;
    return {
      ...rest,
      open_flags: flags.filter((f) => f.status === "open").length,
      submitted_by_name: v.submitted_by ? (names.get(v.submitted_by as string) ?? "Former staff member") : null,
    };
  });
  return ok({ items });
});
