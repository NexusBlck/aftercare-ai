import { AppError } from "@/lib/api/errors";
import { handle, ok } from "@/lib/api/route-utils";
import { serverConfig } from "@/lib/config";
import { mapDbError } from "@/lib/clinic/db-errors";
import { logClinicEvent, requireClinic, rpc } from "@/lib/clinic/server";
import { applyExtraction } from "@/lib/domain/apply-extraction";
import { defaultContext } from "@/lib/domain/context";
import { createEmptyBundle } from "@/lib/domain/plan";
import { extractDocument, requireAi } from "@/lib/gemini/pipeline";
import { rateLimit } from "@/lib/security/rate-limit";
import { checkFileContent } from "@/lib/security/file-validation";
import type { DocumentRecord, PlanBundle } from "@/schemas/domain";
import { getEpisode, getVersion, openVersionFor, saveVersionBundle } from "@/services/clinic-service";
import { downloadClinicFile, getClinicDocument } from "@/services/clinic-documents";

export const maxDuration = 300;

const STALE_MS = 5 * 60 * 1000;

/**
 * Runs the existing extraction pipeline on a clinic document and merges the validated result into the
 * episode's draft plan (creating the plan, or a new revision of an approved plan, when needed). The
 * document is untrusted input: the model is instructed to ignore embedded instructions, its output is
 * schema-validated and sanitized against verbatim excerpts, and every extracted item starts as
 * "needs review". Nothing reaches a patient until a clinician approves the version.
 */
export const POST = handle(async (_req: Request, ctx: RouteContext<"/api/clinic/documents/[id]/process">) => {
  const { id } = await ctx.params;
  const clinic = await requireClinic("documents.upload");
  requireAi();
  const limit = rateLimit(`clinic-process:${clinic.user.id}`, 20, 10 * 60_000);
  if (!limit.ok) throw new AppError("rate_limited", `Several documents were processed recently. Try again in ${limit.retryAfterSec} seconds.`, 429, true);

  const doc = await getClinicDocument(clinic, id);
  if (doc.processing_status === "uploading") throw new AppError("invalid_request", "This upload has not finished yet.", 409);

  // Atomic claim so two clicks (or two staff) cannot process the same document at once.
  const staleBefore = new Date(Date.now() - STALE_MS).toISOString();
  const { data: claimed, error: claimError } = await clinic.supabase
    .from("clinic_documents")
    .update({ processing_status: "processing", processing_error: null, processing_started_at: new Date().toISOString() })
    .eq("id", id)
    .eq("organization_id", clinic.orgId)
    .or(`processing_status.neq.processing,processing_started_at.lt.${staleBefore},processing_started_at.is.null`)
    .select("id");
  if (claimError) throw mapDbError(claimError, "start processing");
  if (!claimed?.length) throw new AppError("already_processing", "This document is already being processed.", 409);

  try {
    const episode = await getEpisode(clinic, doc.episode_id);
    const domainCtx = defaultContext();

    // Find or create the plan and an editable version.
    const { data: existing } = await clinic.supabase.from("recovery_plans").select("id").eq("episode_id", episode.id).eq("organization_id", clinic.orgId).maybeSingle();
    let planId = existing?.id as string | undefined;
    let versionId: string;
    if (!planId) {
      const planUuidPlaceholder = crypto.randomUUID();
      const created = await rpc<Array<{ plan_id: string; version_id: string }>>(
        clinic,
        "create_recovery_plan",
        { p_episode: episode.id, p_title: `${episode.title} — recovery plan`.slice(0, 120), p_bundle: createEmptyBundle(planUuidPlaceholder, episode.title, domainCtx) },
        "create the recovery plan",
      );
      planId = created[0].plan_id;
      versionId = created[0].version_id;
    } else {
      const open = await openVersionFor(clinic.supabase, clinic.orgId, planId);
      if (open?.status === "pending_review") {
        throw new AppError("conflict", "This plan is waiting for clinical review. Process new documents after the reviewer's decision.", 409);
      }
      versionId = open ? open.id : await rpc<string>(clinic, "revise_plan", { p_plan: planId }, "start a new revision");
    }
    const version = await getVersion(clinic, versionId);

    const bytes = await downloadClinicFile(clinic, doc);
    const check = checkFileContent(bytes, serverConfig().maxUploadBytes);
    if (!check.ok) throw new AppError(check.code, check.message, 400);
    const result = await extractDocument(bytes, check.mime);

    // Bundle ids follow the plan; document records mirror the clinic document for provenance.
    const base: PlanBundle = { ...version.bundle, plan: { ...version.bundle.plan, id: planId } };
    const record: DocumentRecord = {
      id: doc.id,
      care_plan_id: planId,
      file_path: null,
      original_filename: doc.original_filename,
      mime_type: doc.mime_type,
      file_size: doc.file_size,
      document_type: doc.document_type as DocumentRecord["document_type"],
      classification_source: doc.document_type === "unknown" ? "none" : "patient",
      processing_status: "processing",
      processing_error: null,
      sample_text: null,
      created_at: doc.created_at,
      updated_at: domainCtx.now,
    };
    const withDoc: PlanBundle = { ...base, documents: [...base.documents.filter((d) => d.id !== doc.id), record] };
    const merged = applyExtraction(withDoc, { documentId: doc.id, extraction: result.extraction, issues: result.issues }, domainCtx);
    const saved = await saveVersionBundle(clinic, version, merged);

    const documentType = merged.documents.find((d) => d.id === doc.id)?.document_type ?? doc.document_type;
    await clinic.supabase
      .from("clinic_documents")
      .update({ processing_status: "processed", processing_error: null, document_type: documentType })
      .eq("id", id)
      .eq("organization_id", clinic.orgId);
    await logClinicEvent(clinic, "document.processed", "clinic_document", id, {
      provider: result.provider,
      items: merged.medications.length + merged.tasks.length + merged.follow_ups.length + merged.warning_signs.length,
      flags: merged.flags.filter((f) => f.status === "open").length,
      embedded_instructions: result.extraction.embedded_instructions_detected,
    });
    return ok({ plan_id: planId, version_id: saved.id, embedded_instructions_detected: result.extraction.embedded_instructions_detected });
  } catch (err) {
    const e = err instanceof AppError ? err : new AppError("internal_error", "Processing failed unexpectedly.", 500, true);
    await clinic.supabase
      .from("clinic_documents")
      .update({ processing_status: "failed", processing_error: e.message.slice(0, 500) })
      .eq("id", id)
      .eq("organization_id", clinic.orgId);
    await logClinicEvent(clinic, "document.processing_failed", "clinic_document", id, { code: e.code });
    throw e;
  }
});
