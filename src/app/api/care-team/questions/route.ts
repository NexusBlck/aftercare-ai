import { enforceRateLimit } from "@/lib/api/auth-guards";
import { handle, ok, parseJson } from "@/lib/api/route-utils";
import { rpc } from "@/lib/clinic/server";
import { hasUrgentKeywords } from "@/lib/clinic/urgent";
import { requireUser } from "@/lib/supabase/server";
import { QuestionSchema } from "@/schemas/clinic";

/**
 * Patient question to the care team. This is not an emergency service: possible urgent symptoms are
 * flagged for staff and the reply tells the client to show emergency guidance immediately.
 */
export const POST = handle(async (request: Request) => {
  const auth = await requireUser();
  enforceRateLimit(request, "patient-question", auth.user.id, 10, 60 * 60_000);
  const body = await parseJson(request, QuestionSchema);
  const urgent = hasUrgentKeywords(`${body.subject} ${body.body}`);
  const id = await rpc<string>(
    auth,
    "submit_patient_question",
    { p_patient: body.patient_id, p_plan: body.plan_id ?? null, p_subject: body.subject, p_body: body.body, p_urgent_keywords: urgent },
    "send your question",
  );
  return ok({ question_id: id, urgent }, { status: 201 });
});
