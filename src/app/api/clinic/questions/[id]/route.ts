import { handle, ok, parseJson } from "@/lib/api/route-utils";
import { mapDbError } from "@/lib/clinic/db-errors";
import { must, requireClinic, requireId, rpc } from "@/lib/clinic/server";
import { MessageSchema, QuestionPatchSchema } from "@/schemas/clinic";
import { memberNames } from "@/services/clinic-service";

export const GET = handle(async (_req: Request, ctx: RouteContext<"/api/clinic/questions/[id]">) => {
  const { id } = await ctx.params;
  const clinic = await requireClinic("questions.respond");
  requireId(id, "question");
  const question = must(
    await clinic.supabase
      .from("patient_questions")
      .select("*, patient:clinic_patients(id, full_name, mrn)")
      .eq("id", id)
      .eq("organization_id", clinic.orgId)
      .maybeSingle(),
    "question",
  );
  const { data: messages, error } = await clinic.supabase
    .from("question_messages")
    .select("id, author_kind, author_name, body, created_at")
    .eq("question_id", id)
    .eq("organization_id", clinic.orgId)
    .order("created_at");
  if (error) throw mapDbError(error, "load messages");
  const names = await memberNames(clinic);
  return ok({ question, messages, staff: [...names].map(([user_id, name]) => ({ user_id, name })) });
});

/** Staff reply. Marks the question responded and notifies the patient in-app (no medical detail in the notification). */
export const POST = handle(async (request: Request, ctx: RouteContext<"/api/clinic/questions/[id]">) => {
  const { id } = await ctx.params;
  const clinic = await requireClinic("questions.respond");
  const { body } = await parseJson(request, MessageSchema);
  await rpc(clinic, "add_question_message", { p_question: requireId(id, "question"), p_body: body }, "send the reply");
  return ok({ sent: true }, { status: 201 });
});

export const PATCH = handle(async (request: Request, ctx: RouteContext<"/api/clinic/questions/[id]">) => {
  const { id } = await ctx.params;
  const clinic = await requireClinic("questions.respond");
  const body = await parseJson(request, QuestionPatchSchema);
  await rpc(clinic, "update_question", { p_question: requireId(id, "question"), p_status: body.status ?? null, p_assigned_to: body.assigned_to ?? null }, "update the question");
  return ok({ updated: true });
});
