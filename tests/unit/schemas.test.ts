import { describe, expect, it } from "vitest";
import { AppError } from "@/lib/api/errors";
import { parseModelJson } from "@/lib/gemini/parse";
import { ExtractionSchema, extractionJsonSchema, explanationJsonSchema } from "@/schemas/extraction";
import { ItemPatchSchema, PlanBundleSchema } from "@/schemas/domain";
import { buildSamplePlan } from "@/lib/demo/sample-plan";
import { emptyExtraction, extractionOf, testContext } from "./helpers";

describe("ExtractionSchema", () => {
  it("accepts every hand-written synthetic extraction", () => {
    for (const key of ["clear-discharge-summary", "prescription-missing-duration", "wound-care-sheet", "prompt-injection", "no-clinical-content"] as const) {
      expect(ExtractionSchema.safeParse(extractionOf(key)).success, key).toBe(true);
    }
  });

  it("rejects a medication missing a required property", () => {
    const bad = emptyExtraction() as unknown as Record<string, unknown>;
    bad.medications = [{ name: "Paracetamol" }];
    expect(ExtractionSchema.safeParse(bad).success).toBe(false);
  });

  it("rejects unexpected enum values", () => {
    const bad = { ...emptyExtraction(), document_type: "operation_note" };
    expect(ExtractionSchema.safeParse(bad).success).toBe(false);
  });

  it("rejects a non-integer or zero source page", () => {
    const bad = emptyExtraction({
      warning_signs: [{ sign: "Fever", action: null, source_page: 0, source_excerpt: "Fever", uncertain: false, uncertainty_note: null }],
    });
    expect(ExtractionSchema.safeParse(bad).success).toBe(false);
  });
});

describe("parseModelJson", () => {
  it("rejects truncated JSON", () => {
    const raw = JSON.stringify(emptyExtraction()).slice(0, 60);
    expect(() => parseModelJson(raw)).toThrowError(AppError);
    try {
      parseModelJson(raw);
    } catch (e) {
      expect((e as AppError).code).toBe("invalid_model_response");
    }
  });

  it("rejects JSON that does not match the schema", () => {
    expect(() => parseModelJson(JSON.stringify({ medications: "none" }))).toThrowError(/did not match/);
  });

  it("rejects non-object output", () => {
    expect(() => parseModelJson('"I cannot help with that"')).toThrowError(AppError);
  });

  it("returns a typed extraction for valid output", () => {
    const parsed = parseModelJson(JSON.stringify(extractionOf("clear-discharge-summary")));
    expect(parsed.medications).toHaveLength(3);
  });
});

describe("JSON schema sent to Gemini", () => {
  it("is generated from the Zod schema and has no $schema key", () => {
    const schema = extractionJsonSchema();
    expect(schema.$schema).toBeUndefined();
    const props = schema.properties as Record<string, unknown>;
    expect(Object.keys(props).sort()).toEqual(Object.keys(ExtractionSchema.shape).sort());
    expect(explanationJsonSchema().$schema).toBeUndefined();
  });

  it("marks every medication field as required (nullable instead of optional)", () => {
    const med = ((extractionJsonSchema().properties as Record<string, { items: { required: string[] } }>).medications).items;
    expect(med.required).toEqual(expect.arrayContaining(["name", "dose", "frequency", "duration", "source_excerpt"]));
  });
});

describe("domain schemas", () => {
  it("the sample plan round-trips through PlanBundleSchema", () => {
    const bundle = buildSamplePlan(testContext(), "2026-11-12");
    expect(PlanBundleSchema.safeParse(bundle).success).toBe(true);
  });

  it("rejects unknown patch actions and patient-set conflict status", () => {
    expect(ItemPatchSchema.safeParse({ action: "delete" }).success).toBe(false);
    expect(ItemPatchSchema.safeParse({ action: "set_status", status: "approved_by_doctor" }).success).toBe(false);
  });
});
