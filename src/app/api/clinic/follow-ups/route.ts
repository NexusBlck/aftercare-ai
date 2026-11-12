import { handle, ok, parseJson } from "@/lib/api/route-utils";
import { requireClinic, rpc } from "@/lib/clinic/server";
import { FollowUpVerifySchema } from "@/schemas/clinic";
import { listFollowUps } from "@/services/clinic-service";

/** Documented follow-ups from approved plans, with patient-reported and staff-verified status kept separate. */
export const GET = handle(async () => {
  const ctx = await requireClinic("patients.read");
  return ok({ items: await listFollowUps(ctx) });
});

/** Staff verification of attendance. This never schedules anything with an external provider. */
export const POST = handle(async (request: Request) => {
  const ctx = await requireClinic("followups.verify");
  const body = await parseJson(request, FollowUpVerifySchema);
  await rpc(ctx, "verify_follow_up", { p_plan: body.plan_id, p_item: body.item_id, p_status: body.status, p_note: body.note ?? null }, "update the follow-up");
  return ok({ updated: true });
});
