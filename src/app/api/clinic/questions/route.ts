import { handle, ok } from "@/lib/api/route-utils";
import { mapDbError } from "@/lib/clinic/db-errors";
import { requireClinic } from "@/lib/clinic/server";
import { memberNames } from "@/services/clinic-service";

export const GET = handle(async (request: Request) => {
  const ctx = await requireClinic("questions.respond");
  const status = new URL(request.url).searchParams.get("status");
  let query = ctx.supabase
    .from("patient_questions")
    .select("id, subject, status, urgent_keywords, assigned_to, created_at, updated_at, patient:clinic_patients(id, full_name)")
    .eq("organization_id", ctx.orgId)
    .order("updated_at", { ascending: false })
    .limit(200);
  if (status === "open") query = query.in("status", ["new", "assigned", "in_progress"]);
  else if (status === "responded" || status === "closed") query = query.eq("status", status);
  const { data, error } = await query;
  if (error) throw mapDbError(error, "load questions");
  const names = await memberNames(ctx);
  return ok({ items: (data ?? []).map((q) => ({ ...q, assigned_to_name: q.assigned_to ? (names.get(q.assigned_to as string) ?? null) : null })) });
});
