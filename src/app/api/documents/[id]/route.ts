import type { NextRequest } from "next/server";
import { handle, ok, parseJson } from "@/lib/api/route-utils";
import { removeDocument } from "@/lib/domain/apply-extraction";
import { defaultContext } from "@/lib/domain/context";
import { updateDocument } from "@/lib/domain/plan";
import { requireUser } from "@/lib/supabase/server";
import { getOwnedDocument, removeStoredFile } from "@/services/document-service";
import { mutatePlan } from "@/services/plan-service";
import { DocumentPatchSchema, DocumentRecordSchema } from "@/schemas/domain";

type Ctx = RouteContext<"/api/documents/[id]">;

export const GET = handle(async (_req: NextRequest, ctx: Ctx) => {
  const { id } = await ctx.params;
  const { supabase, user } = await requireUser();
  // Re-parsing strips internal columns such as processing_started_at.
  return ok({ document: DocumentRecordSchema.parse(await getOwnedDocument(supabase, user.id, id)) });
});

/** Patient correction of the document classification. */
export const PATCH = handle(async (req: NextRequest, ctx: Ctx) => {
  const { id } = await ctx.params;
  const auth = await requireUser();
  const body = await parseJson(req, DocumentPatchSchema);
  const doc = await getOwnedDocument(auth.supabase, auth.user.id, id);
  const now = new Date().toISOString();
  const bundle = await mutatePlan(auth, doc.care_plan_id, (b) =>
    updateDocument(b, id, { document_type: body.document_type, classification_source: "patient" }, now),
  );
  return ok({ bundle });
});

/** Deletes the stored file, the document, and everything extracted from it. */
export const DELETE = handle(async (_req: NextRequest, ctx: Ctx) => {
  const { id } = await ctx.params;
  const auth = await requireUser();
  const doc = await getOwnedDocument(auth.supabase, auth.user.id, id);
  await removeStoredFile(auth.supabase, auth.bucket, doc.file_path);
  const bundle = await mutatePlan(auth, doc.care_plan_id, (b) => removeDocument(b, id, defaultContext()));
  return ok({ bundle });
});
