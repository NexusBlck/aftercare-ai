import { describe, expect, it } from "vitest";
import { buildSyntheticDocuments } from "@/lib/demo/synthetic-documents";
import { applyExtraction } from "@/lib/domain/apply-extraction";
import { createEmptyBundle } from "@/lib/domain/plan";
import { sanitizeExtraction } from "@/lib/domain/sanitize";
import type { DocumentRecord, PlanBundle } from "@/schemas/domain";
import type { Extraction } from "@/schemas/extraction";

/** AUD-12: a contradiction the model did not report is still surfaced by a deterministic rule. */

let n = 0;
const ctx = { now: "2026-11-13T10:00:00.000Z", newId: () => `id-${++n}` };
const docs = buildSyntheticDocuments();

function withExtraction(extraction: Extraction): PlanBundle {
  const bundle = createEmptyBundle("plan", "t", ctx);
  const doc: DocumentRecord = {
    id: "doc-1", care_plan_id: "plan", file_path: null, original_filename: "a.pdf", mime_type: "application/pdf", file_size: 1,
    document_type: "unknown", classification_source: "none", processing_status: "processing", processing_error: null, sample_text: null,
    created_at: ctx.now, updated_at: ctx.now,
  };
  const { extraction: x, issues } = sanitizeExtraction(extraction);
  return applyExtraction({ ...bundle, documents: [doc] }, { documentId: "doc-1", extraction: x, issues }, ctx);
}

const ev = (excerpt: string) => ({ source_page: 1, source_excerpt: excerpt, uncertain: false, uncertainty_note: null });

describe("activity contradictions", () => {
  it("flags 'avoid lifting' vs 'return to weight training' even when the model reports no conflict (observed live)", () => {
    const x = structuredClone(docs["clear-discharge-summary"].extraction as Extraction);
    x.activity_instructions = [
      { kind: "restriction", instruction: "Avoid lifting anything heavier than 5 kg", duration: "6 weeks", ...ev("Avoid lifting anything heavier than 5 kg for 6 weeks.") },
      { kind: "permitted", instruction: "return to weight training at the gym", duration: null, ...ev("You may return to weight training at the gym after 2 weeks.") },
      { kind: "permitted", instruction: "Walk every day", duration: null, ...ev("Walk every day.") },
    ] as Extraction["activity_instructions"];
    x.conflicts = [];
    const bundle = withExtraction(x);
    const flag = bundle.flags.find((f) => f.kind === "conflict" && f.rule_key?.startsWith("auto:activity:lifting"));
    expect(flag?.status).toBe("open");
    expect(flag?.related_ids).toHaveLength(2); // walking is not part of it
    const conflicting = bundle.tasks.filter((t) => t.verification_status === "conflicting").map((t) => t.instruction);
    expect(conflicting.sort()).toEqual(["Avoid lifting anything heavier than 5 kg", "return to weight training at the gym"]);
  });

  it("does not raise false alarms on a normal discharge summary", () => {
    const bundle = withExtraction(structuredClone(docs["clear-discharge-summary"].extraction as Extraction));
    expect(bundle.flags.filter((f) => f.rule_key?.startsWith("auto:activity"))).toEqual([]);
  });
});
