import { handle, ok, parseJson } from "@/lib/api/route-utils";
import { mapDbError } from "@/lib/clinic/db-errors";
import { must, requireId, rpc } from "@/lib/clinic/server";
import { hasUrgentKeywords } from "@/lib/clinic/urgent";
import { requireUser } from "@/lib/supabase/server";
import { MessageSchema } from "@/schemas/clinic";

export const GET = handle(async (_req: Request, ctx: RouteContext<"/api/care-team/questions/[id]">) => {
  const { id } = await ctx.params;
  const { supabase } = await requireUser();
  requireId(id, "question");
  const question = must(await supabase.from("patient_questions").select("id, subject, status, created_at, updated_at").eq("id", id).maybeSingle(), "question");
  const { data: messages, error } = await supabase
    .from("question_messages")
    .select("id, author_kind, author_name, body, created_at")
    .eq("question_id", id)
    .order("created_at");
  if (error) throw mapDbError(error, "load messages");
  return ok({ question, messages });
});

export const POST = handle(async (request: Request, ctx: RouteContext<"/api/care-team/questions/[id]">) => {
  const { id } = await ctx.params;
  const auth = await requireUser();
  const { body } = await parseJson(request, MessageSchema);
  await rpc(auth, "add_question_message", { p_question: requireId(id, "question"), p_body: body }, "send your message");
  return ok({ sent: true, urgent: hasUrgentKeywords(body) }, { status: 201 });
});
