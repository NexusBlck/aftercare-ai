import { z } from "zod";

/**
 * Schema for what the model is allowed to return.
 *
 * Every nullable field means "the document did not state this". The model is told never to fill a
 * field by inference. Stable IDs and document IDs are assigned by our code after validation, never
 * by the model.
 */

export const EXTRACTION_SCHEMA_VERSION = "2026-11-12.1";

export const DOCUMENT_TYPES = [
  "discharge_summary",
  "prescription",
  "laboratory_report",
  "imaging_report",
  "wound_care_instructions",
  "follow_up_letter",
  "other",
  "unknown",
] as const;
export const DocumentTypeSchema = z.enum(DOCUMENT_TYPES);
export type DocumentType = z.infer<typeof DocumentTypeSchema>;

const nullableString = () => z.string().nullable();

const evidence = {
  source_page: z.number().int().min(1).nullable(),
  source_excerpt: nullableString(),
  uncertain: z.boolean(),
  uncertainty_note: nullableString(),
};

export const EncounterFieldSchema = z.object({
  value: z.string(),
  ...evidence,
});

export const ExtractedMedicationSchema = z.object({
  name: z.string(),
  brand_name: nullableString(),
  generic_name: nullableString(),
  strength: nullableString(),
  dose: nullableString(),
  route: nullableString(),
  frequency: nullableString(),
  timing: nullableString(),
  duration: nullableString(),
  special_instructions: nullableString(),
  ...evidence,
});

export const WOUND_KINDS = ["cleaning", "dressing", "restriction", "other"] as const;
export const ACTIVITY_KINDS = ["restriction", "permitted", "other"] as const;
export const DIET_KINDS = ["diet", "fluid", "restriction", "other"] as const;

export const ExtractedWoundCareSchema = z.object({
  kind: z.enum(WOUND_KINDS),
  instruction: z.string(),
  frequency: nullableString(),
  ...evidence,
});

export const ExtractedActivitySchema = z.object({
  kind: z.enum(ACTIVITY_KINDS),
  instruction: z.string(),
  duration: nullableString(),
  ...evidence,
});

export const ExtractedDietSchema = z.object({
  kind: z.enum(DIET_KINDS),
  instruction: z.string(),
  ...evidence,
});

export const ExtractedFollowUpSchema = z.object({
  date: nullableString(),
  time: nullableString(),
  specialty: nullableString(),
  clinician: nullableString(),
  investigation: nullableString(),
  preparation: nullableString(),
  ...evidence,
});

export const ExtractedWarningSignSchema = z.object({
  sign: z.string(),
  action: nullableString(),
  ...evidence,
});

export const UNCERTAINTY_CATEGORIES = [
  "illegible",
  "ambiguous",
  "missing_information",
  "unsupported_assumption",
  "other",
] as const;

export const ExtractedUncertaintySchema = z.object({
  category: z.enum(UNCERTAINTY_CATEGORIES),
  description: z.string(),
  source_page: z.number().int().min(1).nullable(),
  source_excerpt: nullableString(),
});

export const CONFLICT_CATEGORIES = ["medication_schedule", "date", "instruction", "other"] as const;

export const ExtractedConflictSchema = z.object({
  category: z.enum(CONFLICT_CATEGORIES),
  description: z.string(),
  excerpts: z.array(z.string()),
});

export const ExtractionSchema = z.object({
  document_type: DocumentTypeSchema,
  classification_confidence: z.enum(["high", "medium", "low"]),
  has_clinical_content: z.boolean(),
  embedded_instructions_detected: z.boolean(),
  encounter: z.object({
    diagnosis: EncounterFieldSchema.nullable(),
    procedure: EncounterFieldSchema.nullable(),
    admission_date: EncounterFieldSchema.nullable(),
    discharge_date: EncounterFieldSchema.nullable(),
    facility: EncounterFieldSchema.nullable(),
    clinician: EncounterFieldSchema.nullable(),
  }),
  medications: z.array(ExtractedMedicationSchema),
  wound_care: z.array(ExtractedWoundCareSchema),
  activity_instructions: z.array(ExtractedActivitySchema),
  diet_instructions: z.array(ExtractedDietSchema),
  follow_ups: z.array(ExtractedFollowUpSchema),
  warning_signs: z.array(ExtractedWarningSignSchema),
  uncertainties: z.array(ExtractedUncertaintySchema),
  conflicts: z.array(ExtractedConflictSchema),
});

export type Extraction = z.infer<typeof ExtractionSchema>;
export type ExtractedMedication = z.infer<typeof ExtractedMedicationSchema>;
export type EncounterField = z.infer<typeof EncounterFieldSchema>;
export type EncounterKey = keyof Extraction["encounter"];

export const ENCOUNTER_KEYS: EncounterKey[] = [
  "diagnosis",
  "procedure",
  "admission_date",
  "discharge_date",
  "facility",
  "clinician",
];

/**
 * JSON Schema sent to Gemini as `responseJsonSchema`, generated from the Zod schema so the two can
 * never drift. `$schema` is stripped because Gemini does not accept it.
 */
export function extractionJsonSchema(): Record<string, unknown> {
  const schema = z.toJSONSchema(ExtractionSchema, { target: "draft-2020-12" }) as Record<
    string,
    unknown
  >;
  delete schema.$schema;
  return schema;
}

/** Explanation layer output. */
export const ExplanationSchema = z.object({
  items: z.array(
    z.object({
      id: z.string(),
      plain_en: z.string(),
      plain_ur: z.string().nullable(),
    }),
  ),
});
export type ExplanationResponse = z.infer<typeof ExplanationSchema>;

export function explanationJsonSchema(): Record<string, unknown> {
  const schema = z.toJSONSchema(ExplanationSchema, { target: "draft-2020-12" }) as Record<
    string,
    unknown
  >;
  delete schema.$schema;
  return schema;
}
