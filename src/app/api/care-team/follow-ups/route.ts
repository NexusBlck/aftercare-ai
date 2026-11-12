import { handle, ok, parseJson } from "@/lib/api/route-utils";
import { rpc } from "@/lib/clinic/server";
import { requireUser } from "@/lib/supabase/server";
import { FollowUpReportSchema } from "@/schemas/clinic";

/** Patient-reported attendance. Shown to staff as "reported by patient", separate from verified attendance. */
export const POST = handle(async (request: Request) => {
  const auth = await requireUser();
  const body = await parseJson(request, FollowUpReportSchema);
  await rpc(auth, "report_follow_up", { p_plan: body.plan_id, p_item: body.item_id, p_status: body.status, p_note: body.note ?? null }, "save your update");
  return ok({ saved: true });
});
