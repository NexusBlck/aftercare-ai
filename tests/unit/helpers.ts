import type { DomainContext } from "@/lib/domain/context";
import { buildSyntheticDocuments } from "@/lib/demo/synthetic-documents";
import { createEmptyBundle } from "@/lib/domain/plan";
import type { DocumentRecord, PlanBundle } from "@/schemas/domain";
import type { Extraction } from "@/schemas/extraction";

/** Deterministic context: fixed clock, sequential UUID-shaped IDs. */
export function testContext(now = "2026-11-12T10:00:00.000Z"): DomainContext {
  let n = 0;
  return {
    now,
    newId: () => {
      n += 1;
      return `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
    },
  };
}

export function docs() {
  return buildSyntheticDocuments();
}

export function extractionOf(key: keyof ReturnType<typeof buildSyntheticDocuments>): Extraction {
  const e = docs()[key].extraction;
  if (!e) throw new Error(`no extraction for ${key}`);
  return structuredClone(e);
}

export function emptyExtraction(overrides: Partial<Extraction> = {}): Extraction {
  return {
    document_type: "discharge_summary",
    classification_confidence: "high",
    has_clinical_content: true,
    embedded_instructions_detected: false,
    encounter: { diagnosis: null, procedure: null, admission_date: null, discharge_date: null, facility: null, clinician: null },
    medications: [],
    wound_care: [],
    activity_instructions: [],
    diet_instructions: [],
    follow_ups: [],
    warning_signs: [],
    uncertainties: [],
    conflicts: [],
    ...overrides,
  };
}

export function bundleWithDocs(ctx: DomainContext, count: number): { bundle: PlanBundle; docIds: string[] } {
  let bundle = createEmptyBundle(ctx.newId(), "Test plan", ctx);
  const docIds: string[] = [];
  for (let i = 0; i < count; i++) {
    const id = ctx.newId();
    docIds.push(id);
    const doc: DocumentRecord = {
      id,
      care_plan_id: bundle.plan.id,
      file_path: null,
      original_filename: `doc-${i}.pdf`,
      mime_type: "application/pdf",
      file_size: 100,
      document_type: "unknown",
      classification_source: "none",
      processing_status: "uploaded",
      processing_error: null,
      sample_text: null,
      created_at: ctx.now,
      updated_at: ctx.now,
    };
    bundle = { ...bundle, documents: [...bundle.documents, doc] };
  }
  return { bundle, docIds };
}
