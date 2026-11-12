import type { NextRequest } from "next/server";
import { AppError } from "@/lib/api/errors";
import { ndjsonStream } from "@/lib/api/ndjson";
import { handle } from "@/lib/api/route-utils";
import { serverConfig } from "@/lib/config";
import { applyExtraction } from "@/lib/domain/apply-extraction";
import { defaultContext } from "@/lib/domain/context";
import { applyExplanations, collectExplainable } from "@/lib/domain/explanations";
import { updateDocument } from "@/lib/domain/plan";
import { explainItems, extractDocument, requireAi } from "@/lib/gemini/pipeline";
import { checkFileContent } from "@/lib/security/file-validation";
import { rateLimit } from "@/lib/security/rate-limit";
import { requireUser } from "@/lib/supabase/server";
import { downloadOwnedFile, getOwnedDocument, isActivelyProcessing, STALE_PROCESSING_MS } from "@/services/document-service";
import { loadBundle, persistDiff } from "@/services/plan-repository";
import { EXTRACTION_SCHEMA_VERSION } from "@/schemas/extraction";

export const maxDuration = 300;

/**
 * Processes one stored document and streams real progress as NDJSON. Nothing is saved unless the
 * model output passes schema validation; on failure the document is marked failed with a reason.
 */
export const POST = handle(async (_req: NextRequest, ctx: RouteContext<"/api/documents/[id]/process">) => {
  const { id } = await ctx.params;
  const auth = await requireUser();
  const { supabase, user, bucket } = auth;
  const ai = requireAi();

  const limit = rateLimit(`process:${user.id}`, 10, 10 * 60_000);
  if (!limit.ok) {
    throw new AppError("rate_limited", `You have processed several documents recently. Try again in ${limit.retryAfterSec} seconds.`, 429, true);
  }

  const doc = await getOwnedDocument(supabase, user.id, id);
  if (doc.processing_status === "uploading") throw new AppError("invalid_request", "This upload has not finished yet.", 409);
  if (isActivelyProcessing(doc)) {
    throw new AppError("already_processing", "This document is already being processed. Please wait for it to finish.", 409);
  }

  // Atomic claim: succeeds only if nobody else is processing (or their claim is stale).
  const startedAt = new Date().toISOString();
  const staleBefore = new Date(Date.now() - STALE_PROCESSING_MS).toISOString();
  const { data: claimed, error: claimError } = await supabase
    .from("documents")
    .update({ processing_status: "processing", processing_error: null, processing_started_at: startedAt })
    .eq("id", id)
    .eq("user_id", user.id)
    .or(`processing_status.neq.processing,processing_started_at.lt.${staleBefore},processing_started_at.is.null`)
    .select("id");
  if (claimError) throw new AppError("database_error", "We could not start processing.", 500, true);
  if (!claimed?.length) throw new AppError("already_processing", "This document is already being processed.", 409);

  const { data: run } = await supabase
    .from("extraction_runs")
    .insert({ document_id: id, user_id: user.id, model_identifier: ai.model, provider: ai.provider, status: "started", schema_version: EXTRACTION_SCHEMA_VERSION })
    .select("id")
    .single();

  const fail = async (err: unknown) => {
    const e = err instanceof AppError ? err : new AppError("internal_error", "Processing failed unexpectedly.", 500, true);
    await supabase.from("documents").update({ processing_status: "failed", processing_error: e.message }).eq("id", id).eq("user_id", user.id);
    if (run) {
      await supabase.from("extraction_runs").update({ status: "failed", error_code: e.code, error_message: e.message }).eq("id", run.id);
    }
  };

  return ndjsonStream(async (emit) => {
    try {
      emit({ type: "stage", stage: "reading" });
      const bytes = await downloadOwnedFile(supabase, bucket, doc);
      const check = checkFileContent(bytes, serverConfig().maxUploadBytes);
      if (!check.ok) throw new AppError(check.code, check.message, 400);

      const result = await extractDocument(bytes, check.mime, (stage) => emit({ type: "stage", stage }));

      const domainCtx = defaultContext();
      const before = await loadBundle(supabase, user.id, doc.care_plan_id);
      let after = applyExtraction(before, { documentId: id, extraction: result.extraction, issues: result.issues }, domainCtx);

      const explainable = collectExplainable(after, id);
      if (explainable.length > 0 && result.provider === "gemini") {
        emit({ type: "stage", stage: "explaining" });
        const explanations = await explainItems(explainable);
        if (explanations) after = applyExplanations(after, explainable, explanations);
      }

      emit({ type: "stage", stage: "saving" });
      after = updateDocument(after, id, { processing_status: "ready_for_review", processing_error: null }, domainCtx.now);
      await persistDiff(supabase, user.id, before, after);
      if (run) {
        await supabase.from("extraction_runs").update({ status: "succeeded", extracted_at: new Date().toISOString() }).eq("id", run.id);
      }
      emit({ type: "done", bundle: await loadBundle(supabase, user.id, doc.care_plan_id) });
    } catch (err) {
      await fail(err);
      throw err;
    }
  });
});
