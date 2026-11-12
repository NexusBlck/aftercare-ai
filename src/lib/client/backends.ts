"use client";

import type { ProcessStage } from "@/lib/api/process-events";
import { applyExtraction, removeDocument } from "@/lib/domain/apply-extraction";
import { defaultContext } from "@/lib/domain/context";
import { applyExplanations, collectExplainable } from "@/lib/domain/explanations";
import { applyItemPatch, type ItemKind } from "@/lib/domain/patch";
import { createEmptyBundle, updateDocument } from "@/lib/domain/plan";
import { buildSamplePlan } from "@/lib/demo/sample-plan";
import { checkFileClaims, checkFileContent, maxUploadBytes, safeDisplayName } from "@/lib/security/file-validation";
import type { DocumentRecord, ItemPatch, PlanBundle, Profile } from "@/schemas/domain";
import { ExplanationSchema, ExtractionSchema, type DocumentType } from "@/schemas/extraction";
import { LEGAL_DOCUMENTS, LEGAL_VERSIONS, type LegalDocument } from "@/lib/legal";
import type { LegalStatus } from "@/schemas/legal";
import { apiBlob, apiFetch, ClientError, readProcessStream, xhrUpload } from "./http";
import {
  clearLocalFiles,
  deleteLocalFile,
  getLocalFile,
  putLocalFile,
  readLocalPlan,
  readLocalProfile,
  writeLocalPlan,
  writeLocalProfile,
  type LocalProfile,
} from "./local-store";

export type Mode = "demo" | "account";

export interface UploadOptions {
  onProgress?: (fraction: number) => void;
  signal?: AbortSignal;
}

export type DocumentPreview = { kind: "url"; url: string; mimeType: string; revoke?: () => void } | { kind: "text"; text: string };

export interface PlanBackend {
  mode: Mode;
  loadProfile(): Promise<{ profile: LocalProfile; email: string | null }>;
  saveProfile(profile: Profile): Promise<void>;
  loadCurrent(): Promise<PlanBundle | null>;
  createPlan(title?: string): Promise<PlanBundle>;
  renamePlan(bundle: PlanBundle, title: string): Promise<PlanBundle>;
  uploadDocument(bundle: PlanBundle, file: File, opts: UploadOptions): Promise<PlanBundle>;
  processDocument(bundle: PlanBundle, documentId: string, onStage: (stage: ProcessStage) => void): Promise<PlanBundle>;
  setDocumentType(bundle: PlanBundle, documentId: string, type: DocumentType): Promise<PlanBundle>;
  deleteDocument(bundle: PlanBundle, documentId: string): Promise<PlanBundle>;
  previewDocument(bundle: PlanBundle, documentId: string): Promise<DocumentPreview>;
  patchItem(bundle: PlanBundle, kind: ItemKind, id: string, patch: ItemPatch): Promise<PlanBundle>;
  exportPdf(bundle: PlanBundle): Promise<Blob>;
  deleteAllData(): Promise<{ accountDeleted: boolean }>;
  legalStatus(): Promise<LegalStatus>;
  acceptLegal(documents: LegalDocument[]): Promise<LegalStatus>;
  setMarketing(optIn: boolean): Promise<LegalStatus>;
  /** Everything held about the user, as a downloadable JSON file. */
  exportData(): Promise<Blob>;
}

async function pdfInBrowser(bundle: PlanBundle): Promise<Blob> {
  const { buildSummaryPdf } = await import("@/lib/pdf/build-summary");
  try {
    const bytes = await buildSummaryPdf(bundle);
    return new Blob([bytes as BlobPart], { type: "application/pdf" });
  } catch {
    throw new ClientError("pdf_failed", "We could not create the PDF. Please try again.");
  }
}

/* -------------------------------------------------------------------- demo (browser only) */

export class LocalBackend implements PlanBackend {
  mode = "demo" as const;

  async loadProfile() {
    return { profile: readLocalProfile(), email: null };
  }

  async saveProfile(profile: Profile) {
    writeLocalProfile({ ...profile, onboarded: true });
  }

  async loadCurrent() {
    return readLocalPlan();
  }

  async createPlan(title?: string) {
    await clearLocalFiles();
    const ctx = defaultContext();
    const bundle = createEmptyBundle(ctx.newId(), title, ctx);
    writeLocalPlan(bundle);
    return bundle;
  }

  /** Replaces the plan with the labelled sample plan. */
  async loadSample() {
    await clearLocalFiles();
    const bundle = buildSamplePlan(defaultContext());
    writeLocalPlan(bundle);
    return bundle;
  }

  async renamePlan(bundle: PlanBundle, title: string) {
    const next = { ...bundle, plan: { ...bundle.plan, title, updated_at: new Date().toISOString() } };
    writeLocalPlan(next);
    return next;
  }

  async uploadDocument(bundle: PlanBundle, file: File, opts: UploadOptions) {
    const max = maxUploadBytes();
    const claim = checkFileClaims(file.name, file.size, max);
    if (!claim.ok) throw new ClientError(claim.code, claim.message);
    const bytes = new Uint8Array(await file.arrayBuffer());
    const content = checkFileContent(bytes, max);
    if (!content.ok) throw new ClientError(content.code, content.message);
    if (opts.signal?.aborted) throw new ClientError("aborted", "Upload cancelled.");
    const ctx = defaultContext();
    const id = ctx.newId();
    await putLocalFile(id, new Blob([bytes], { type: content.mime }));
    opts.onProgress?.(1);
    const record: DocumentRecord = {
      id,
      care_plan_id: bundle.plan.id,
      file_path: null,
      original_filename: safeDisplayName(file.name),
      mime_type: content.mime,
      file_size: bytes.length,
      document_type: "unknown",
      classification_source: "none",
      processing_status: "uploaded",
      processing_error: null,
      sample_text: null,
      created_at: ctx.now,
      updated_at: ctx.now,
    };
    const next = { ...bundle, documents: [...bundle.documents, record] };
    writeLocalPlan(next);
    return next;
  }

  async processDocument(bundle: PlanBundle, documentId: string, onStage: (stage: ProcessStage) => void) {
    const blob = await getLocalFile(documentId);
    if (!blob) throw new ClientError("not_found", "This file is no longer stored in your browser. Remove it and upload it again.");
    const now = () => new Date().toISOString();
    let working = updateDocument(bundle, documentId, { processing_status: "processing", processing_error: null }, now());
    writeLocalPlan(working);

    try {
      const form = new FormData();
      form.append("file", blob, "document");
      let result: unknown = null;
      await readProcessStream("/api/extract", { body: form }, (event) => {
        if (event.type === "stage") onStage(event.stage);
        if (event.type === "extracted") result = event.result;
      });
      // Defense in depth: validate the server's result again before using it.
      const parsed = ExtractionSchema.safeParse((result as { extraction?: unknown } | null)?.extraction);
      if (!parsed.success) throw new ClientError("invalid_model_response", "The result could not be validated, so nothing was saved.");
      const issues = (result as unknown as { issues: Parameters<typeof applyExtraction>[1]["issues"] }).issues ?? [];

      const ctx = defaultContext();
      working = applyExtraction(working, { documentId, extraction: parsed.data, issues }, ctx);

      const explainable = collectExplainable(working, documentId);
      const provider = (result as unknown as { provider: string }).provider;
      if (explainable.length && provider !== "mock") {
        onStage("explaining");
        try {
          const res = await apiFetch<{ explanations: unknown }>("/api/explain", {
            method: "POST",
            body: JSON.stringify({ items: explainable.slice(0, 60) }),
          });
          const exp = ExplanationSchema.safeParse(res.explanations);
          if (exp.success) working = applyExplanations(working, explainable, exp.data);
        } catch {
          // Explanations are optional; originals remain visible.
        }
      }
      onStage("saving");
      writeLocalPlan(working);
      return working;
    } catch (err) {
      const message = err instanceof ClientError ? err.message : "Processing failed. Please try again.";
      writeLocalPlan(updateDocument(bundle, documentId, { processing_status: "failed", processing_error: message }, now()));
      throw err;
    }
  }

  async setDocumentType(bundle: PlanBundle, documentId: string, type: DocumentType) {
    const next = updateDocument(bundle, documentId, { document_type: type, classification_source: "patient" }, new Date().toISOString());
    writeLocalPlan(next);
    return next;
  }

  async deleteDocument(bundle: PlanBundle, documentId: string) {
    await deleteLocalFile(documentId);
    const next = removeDocument(bundle, documentId, defaultContext());
    writeLocalPlan(next);
    return next;
  }

  async previewDocument(bundle: PlanBundle, documentId: string): Promise<DocumentPreview> {
    const doc = bundle.documents.find((d) => d.id === documentId);
    if (!doc) throw new ClientError("not_found", "This document was not found.");
    if (doc.sample_text) return { kind: "text", text: doc.sample_text };
    const blob = await getLocalFile(documentId);
    if (!blob) throw new ClientError("not_found", "This file is no longer stored in your browser.");
    const url = URL.createObjectURL(blob);
    return { kind: "url", url, mimeType: doc.mime_type, revoke: () => URL.revokeObjectURL(url) };
  }

  async patchItem(bundle: PlanBundle, kind: ItemKind, id: string, patch: ItemPatch) {
    const next = applyItemPatch(bundle, kind, id, patch, defaultContext());
    writeLocalPlan(next);
    return next;
  }

  exportPdf(bundle: PlanBundle) {
    return pdfInBrowser(bundle);
  }

  async deleteAllData() {
    writeLocalPlan(null);
    writeLocalProfile({ display_name: null, preferred_language: "en", onboarded: false });
    writeLocalLegal([]);
    await clearLocalFiles();
    return { accountDeleted: false };
  }

  async legalStatus(): Promise<LegalStatus> {
    return localLegalStatus(readLocalLegal());
  }

  async acceptLegal(documents: LegalDocument[]): Promise<LegalStatus> {
    const now = new Date().toISOString();
    const current = readLocalLegal();
    const added = documents
      .filter((d) => !current.some((a) => a.document === d && a.version === LEGAL_VERSIONS[d]))
      .map((document) => ({ document, version: LEGAL_VERSIONS[document], accepted_at: now, source: "in_app" }));
    const next = [...added, ...current];
    writeLocalLegal(next);
    return localLegalStatus(next);
  }

  async setMarketing(): Promise<LegalStatus> {
    // Demo mode has no email address, so there is nothing to opt in to.
    return localLegalStatus(readLocalLegal());
  }

  async exportData(): Promise<Blob> {
    const payload = {
      export_format: "aftercare-ai-data-export/1",
      generated_at: new Date().toISOString(),
      mode: "demo (stored only in this browser)",
      profile: readLocalProfile(),
      agreements: { current_versions: LEGAL_VERSIONS, accepted: readLocalLegal() },
      care_plan: readLocalPlan(),
    };
    return new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
  }
}

const LEGAL_KEY = "aftercare.demo.legal.v1";

function readLocalLegal(): LegalStatus["accepted"] {
  try {
    const raw = localStorage.getItem(LEGAL_KEY);
    const parsed: unknown = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? (parsed as LegalStatus["accepted"]) : [];
  } catch {
    return [];
  }
}

function writeLocalLegal(rows: LegalStatus["accepted"]) {
  try {
    if (rows.length) localStorage.setItem(LEGAL_KEY, JSON.stringify(rows));
    else localStorage.removeItem(LEGAL_KEY);
  } catch {
    // Storage blocked: the agreement prompt will simply appear again next visit.
  }
}

function localLegalStatus(accepted: LegalStatus["accepted"]): LegalStatus {
  return {
    required: { ...LEGAL_VERSIONS },
    accepted,
    needs: LEGAL_DOCUMENTS.filter((d) => !accepted.some((a) => a.document === d && a.version === LEGAL_VERSIONS[d])),
    marketing_opt_in: false,
    marketing_opt_in_at: null,
  };
}

/* -------------------------------------------------------------------- account (Supabase via API) */

const ITEM_PATH: Record<Exclude<ItemKind, "encounter">, string> = {
  medication: "medications",
  task: "tasks",
  follow_up: "follow-ups",
  warning_sign: "warning-signs",
  flag: "flags",
};

export class ApiBackend implements PlanBackend {
  mode = "account" as const;

  async loadProfile() {
    return apiFetch<{ profile: LocalProfile; email: string | null }>("/api/profile");
  }

  async saveProfile(profile: Profile) {
    await apiFetch("/api/profile", { method: "PUT", body: JSON.stringify(profile) });
  }

  async loadCurrent() {
    return (await apiFetch<{ bundle: PlanBundle | null }>("/api/care-plans/current")).bundle;
  }

  async createPlan(title?: string) {
    return (await apiFetch<{ bundle: PlanBundle }>("/api/care-plans", { method: "POST", body: JSON.stringify({ title }) })).bundle;
  }

  async renamePlan(bundle: PlanBundle, title: string) {
    return (
      await apiFetch<{ bundle: PlanBundle }>(`/api/care-plans/${bundle.plan.id}`, { method: "PATCH", body: JSON.stringify({ title }) })
    ).bundle;
  }

  async uploadDocument(bundle: PlanBundle, file: File, opts: UploadOptions) {
    const claim = checkFileClaims(file.name, file.size, maxUploadBytes());
    if (!claim.ok) throw new ClientError(claim.code, claim.message);
    const head = new Uint8Array(await file.slice(0, 16).arrayBuffer());
    const content = checkFileContent(head, Number.MAX_SAFE_INTEGER);
    if (!content.ok) throw new ClientError(content.code, content.message);

    const created = await apiFetch<{ document: DocumentRecord; uploadUrl: string; contentType: string }>("/api/documents/upload", {
      method: "POST",
      body: JSON.stringify({ care_plan_id: bundle.plan.id, filename: file.name, size: file.size, mime_type: file.type || content.mime }),
      signal: opts.signal,
    });
    try {
      const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
      await xhrUpload(created.uploadUrl, file, created.contentType, {
        onProgress: opts.onProgress,
        signal: opts.signal,
        headers: anon ? { apikey: anon } : undefined,
      });
      await apiFetch(`/api/documents/${created.document.id}/finalize`, { method: "POST" });
    } catch (err) {
      // Clean up the half-finished upload; ignore secondary failures.
      await apiFetch(`/api/documents/${created.document.id}`, { method: "DELETE" }).catch(() => undefined);
      throw err;
    }
    return (await this.loadCurrent()) ?? bundle;
  }

  async processDocument(bundle: PlanBundle, documentId: string, onStage: (stage: ProcessStage) => void) {
    let result: PlanBundle | null = null;
    await readProcessStream(`/api/documents/${documentId}/process`, {}, (event) => {
      if (event.type === "stage") onStage(event.stage);
      if (event.type === "done") result = event.bundle;
    });
    return result ?? bundle;
  }

  async setDocumentType(_bundle: PlanBundle, documentId: string, type: DocumentType) {
    return (
      await apiFetch<{ bundle: PlanBundle }>(`/api/documents/${documentId}`, { method: "PATCH", body: JSON.stringify({ document_type: type }) })
    ).bundle;
  }

  async deleteDocument(_bundle: PlanBundle, documentId: string) {
    return (await apiFetch<{ bundle: PlanBundle }>(`/api/documents/${documentId}`, { method: "DELETE" })).bundle;
  }

  async previewDocument(_bundle: PlanBundle, documentId: string): Promise<DocumentPreview> {
    const res = await apiFetch<{ url: string; mimeType: string }>(`/api/documents/${documentId}/file`);
    return { kind: "url", url: res.url, mimeType: res.mimeType };
  }

  async patchItem(bundle: PlanBundle, kind: ItemKind, id: string, patch: ItemPatch) {
    const url = kind === "encounter" ? `/api/care-plans/${bundle.plan.id}/encounter/${id}` : `/api/${ITEM_PATH[kind]}/${id}`;
    return (await apiFetch<{ bundle: PlanBundle }>(url, { method: "PATCH", body: JSON.stringify(patch) })).bundle;
  }

  exportPdf(bundle: PlanBundle) {
    return apiBlob(`/api/export/${bundle.plan.id}`);
  }

  async deleteAllData() {
    const res = await apiFetch<{ accountDeleted: boolean }>("/api/account", { method: "DELETE" });
    return { accountDeleted: res.accountDeleted };
  }

  legalStatus() {
    return apiFetch<LegalStatus>("/api/legal");
  }

  acceptLegal(documents: LegalDocument[]) {
    return apiFetch<LegalStatus>("/api/legal", { method: "POST", body: JSON.stringify({ documents }) });
  }

  setMarketing(optIn: boolean) {
    return apiFetch<LegalStatus>("/api/legal", { method: "PATCH", body: JSON.stringify({ marketing_opt_in: optIn }) });
  }

  exportData() {
    return apiBlob("/api/account/export");
  }
}
