import { describe, expect, it } from "vitest";
import { applyVersionEdit, approvalReadiness } from "@/lib/clinic/plan-editing";
import { applyExtraction } from "@/lib/domain/apply-extraction";
import { createEmptyBundle } from "@/lib/domain/plan";
import { sanitizeExtraction } from "@/lib/domain/sanitize";
import { buildSyntheticDocuments, type FixtureKey } from "@/lib/demo/synthetic-documents";
import { PlanBundleSchema, type DocumentRecord, type PlanBundle } from "@/schemas/domain";
import type { Extraction } from "@/schemas/extraction";

/**
 * The clinic workflow reuses the patient app's extraction pipeline: validated + sanitized model output
 * is merged into a draft plan version, which a clinician must review before approval. These tests run
 * that path with the deterministic synthetic fixtures (no AI calls, no costs).
 */

let n = 0;
const ctx = { now: "2026-11-13T09:00:00.000Z", newId: () => `id-${++n}` };
const docs = buildSyntheticDocuments();

function docRecord(planId: string, id: string): DocumentRecord {
  return {
    id,
    care_plan_id: planId,
    file_path: null,
    original_filename: `${id}.pdf`,
    mime_type: "application/pdf",
    file_size: 1000,
    document_type: "unknown",
    classification_source: "none",
    processing_status: "processing",
    processing_error: null,
    sample_text: null,
    created_at: ctx.now,
    updated_at: ctx.now,
  };
}

function extractInto(bundle: PlanBundle, key: FixtureKey, documentId = `doc-${key}`): PlanBundle {
  const { extraction, issues } = sanitizeExtraction(docs[key].extraction as Extraction);
  const withDoc = { ...bundle, documents: [...bundle.documents.filter((d) => d.id !== documentId), docRecord(bundle.plan.id, documentId)] };
  return applyExtraction(withDoc, { documentId, extraction, issues }, ctx);
}

describe("clinic extraction → review", () => {
  it("prompt injection in a document is ignored, flagged, and blocks approval until a clinician resolves it", () => {
    const draft = extractInto(createEmptyBundle("plan-1", "Synthetic plan", ctx), "prompt-injection");
    expect(draft.medications.map((m) => m.name)).toEqual(["Paracetamol"]);
    expect(JSON.stringify(draft)).not.toMatch(/oxycodone/i);
    // Nothing is treated as confirmed just because the document said so.
    expect(draft.medications.every((m) => m.verification_status === "needs_review")).toBe(true);
    const injectionFlag = draft.flags.find((f) => /instructions aimed at software/.test(f.description));
    expect(injectionFlag?.status).toBe("open");
    expect(approvalReadiness(draft).map((i) => i.code)).toContain("open_flags");

    let resolved = draft;
    for (const f of draft.flags.filter((x) => x.status === "open")) {
      resolved = applyVersionEdit(resolved, { op: "resolve_flag", id: f.id, note: "Reviewed source; injected text ignored" }, ctx);
    }
    expect(approvalReadiness(resolved)).toEqual([]);
    expect(PlanBundleSchema.safeParse(resolved).success).toBe(true);
  });

  it("missing medication details stay empty and are flagged rather than inferred", () => {
    const draft = extractInto(createEmptyBundle("plan-2", "Synthetic plan", ctx), "prescription-missing-duration");
    expect(draft.medications.length).toBeGreaterThan(0);
    expect(draft.medications.some((m) => m.duration === null)).toBe(true);
    expect(draft.flags.some((f) => f.status === "open")).toBe(true);
  });

  it("documents that disagree raise a conflict for the clinician instead of picking a value", () => {
    const draft1 = extractInto(createEmptyBundle("plan-3", "Synthetic plan", ctx), "clear-discharge-summary");
    // A second (synthetic) document lists the same medicine with a different frequency.
    const base = docs["clear-discharge-summary"].extraction as Extraction;
    const med = base.medications[0];
    const altered: Extraction = {
      ...base,
      medications: [{ ...med, frequency: "Once daily", source_excerpt: `${med.name} ${med.strength ?? ""} once daily`.trim() }],
      wound_care: [],
      activity_instructions: [],
      diet_instructions: [],
      follow_ups: [],
      warning_signs: [],
    };
    const { extraction, issues } = sanitizeExtraction(altered);
    const withDoc = { ...draft1, documents: [...draft1.documents, docRecord("plan-3", "doc-second")] };
    const draft = applyExtraction(withDoc, { documentId: "doc-second", extraction, issues }, ctx);
    expect(draft.flags.some((f) => f.kind === "conflict" && f.status === "open")).toBe(true);
    expect(draft.medications.some((m) => m.verification_status === "conflicting")).toBe(true);
  });

  it("every extracted item keeps its source document and verbatim excerpt", () => {
    const draft = extractInto(createEmptyBundle("plan-4", "Synthetic plan", ctx), "clear-discharge-summary");
    const items = [...draft.medications, ...draft.tasks, ...draft.follow_ups, ...draft.warning_signs];
    expect(items.length).toBeGreaterThan(3);
    for (const item of items) {
      expect(item.document_id).toBe("doc-clear-discharge-summary");
      expect(item.source_excerpt === null || item.source_excerpt.length > 0).toBe(true);
    }
    expect(items.filter((i) => i.source_excerpt).length).toBeGreaterThan(3);
  });

  it("re-extracting a document replaces its items instead of duplicating them", () => {
    const once = extractInto(createEmptyBundle("plan-5", "Synthetic plan", ctx), "clear-discharge-summary");
    const twice = extractInto(once, "clear-discharge-summary");
    expect(twice.medications.length).toBe(once.medications.length);
    expect(twice.tasks.length).toBe(once.tasks.length);
  });
});
