import { z } from "zod";
import {
  ACTIVITY_KINDS,
  CONFLICT_CATEGORIES,
  DIET_KINDS,
  DocumentTypeSchema,
  UNCERTAINTY_CATEGORIES,
  WOUND_KINDS,
} from "./extraction";

/** Domain entities use snake_case so they map 1:1 onto Postgres rows. */

export const VERIFICATION_STATUSES = [
  "needs_review",
  "confirmed_by_patient",
  "needs_clinician_clarification",
  "conflicting",
] as const;
export const VerificationStatusSchema = z.enum(VERIFICATION_STATUSES);
export type VerificationStatus = z.infer<typeof VerificationStatusSchema>;

export const LANGUAGES = ["en", "ur"] as const;
export const LanguageSchema = z.enum(LANGUAGES);
export type Language = z.infer<typeof LanguageSchema>;

export const PlainLanguageSchema = z.object({
  en: z.string().nullable(),
  ur: z.string().nullable(),
  /** generated = passed the number-preservation check; rejected = failed it; sample = demo data */
  status: z.enum(["generated", "rejected", "sample", "unavailable"]),
});
export type PlainLanguage = z.infer<typeof PlainLanguageSchema>;

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

const itemBase = {
  id: z.string(),
  care_plan_id: z.string(),
  document_id: z.string().nullable(),
  source_page: z.number().int().nullable(),
  source_excerpt: z.string().nullable(),
  verification_status: VerificationStatusSchema,
  uncertain: z.boolean(),
  uncertainty_note: z.string().nullable(),
  patient_edited: z.boolean(),
  plain_language: PlainLanguageSchema.nullable(),
  created_at: z.string(),
  updated_at: z.string(),
};

export const MedicationSchema = z.object({
  ...itemBase,
  name: z.string(),
  brand_name: z.string().nullable(),
  generic_name: z.string().nullable(),
  strength: z.string().nullable(),
  dose: z.string().nullable(),
  route: z.string().nullable(),
  frequency: z.string().nullable(),
  timing: z.string().nullable(),
  duration: z.string().nullable(),
  special_instructions: z.string().nullable(),
});
export type Medication = z.infer<typeof MedicationSchema>;

export const TASK_CATEGORIES = ["wound_care", "activity", "diet", "other"] as const;
export const TaskCategorySchema = z.enum(TASK_CATEGORIES);
export type TaskCategory = z.infer<typeof TaskCategorySchema>;

export const TASK_KINDS = [
  ...new Set([...WOUND_KINDS, ...ACTIVITY_KINDS, ...DIET_KINDS]),
] as [string, ...string[]];

export const RecoveryTaskSchema = z.object({
  ...itemBase,
  category: TaskCategorySchema,
  kind: z.enum(TASK_KINDS),
  instruction: z.string(),
  /** Only set when the document gives an explicit calendar date. */
  due_date: isoDate.nullable(),
  /** Frequency or duration exactly as documented, e.g. "for 2 weeks". */
  schedule_description: z.string().nullable(),
  completed: z.boolean(),
  completed_at: z.string().nullable(),
});
export type RecoveryTask = z.infer<typeof RecoveryTaskSchema>;

export const FOLLOW_UP_STATUSES = ["upcoming", "attended", "rescheduled"] as const;

export const FollowUpSchema = z.object({
  ...itemBase,
  specialty: z.string().nullable(),
  clinician: z.string().nullable(),
  scheduled_date: isoDate.nullable(),
  scheduled_time: z.string().nullable(),
  investigation: z.string().nullable(),
  preparation_instructions: z.string().nullable(),
  status: z.enum(FOLLOW_UP_STATUSES),
  /** Patient-reported new date; the documented date is preserved separately. */
  patient_reschedule_date: isoDate.nullable(),
  patient_note: z.string().nullable(),
});
export type FollowUp = z.infer<typeof FollowUpSchema>;

export const WarningSignSchema = z.object({
  ...itemBase,
  sign: z.string(),
  action: z.string().nullable(),
});
export type WarningSign = z.infer<typeof WarningSignSchema>;

export const ReviewFlagSchema = z.object({
  id: z.string(),
  care_plan_id: z.string(),
  document_id: z.string().nullable(),
  kind: z.enum(["uncertainty", "conflict"]),
  category: z.enum([...UNCERTAINTY_CATEGORIES, ...CONFLICT_CATEGORIES, "missing_evidence", "unsupported_value"]),
  description: z.string(),
  related_ids: z.array(z.string()),
  excerpts: z.array(z.string()),
  origin: z.enum(["ai", "rule", "sample"]),
  /** Set for flags recomputed by detectConflicts(); they are replaced when the rule no longer applies. */
  rule_key: z.string().nullable(),
  status: z.enum(["open", "discussed_with_care_team"]),
  patient_note: z.string().nullable(),
  created_at: z.string(),
  updated_at: z.string(),
});
export type ReviewFlag = z.infer<typeof ReviewFlagSchema>;

export const ENTITY_TYPES = ["medication", "task", "follow_up", "warning_sign", "encounter", "flag"] as const;
export type EntityType = (typeof ENTITY_TYPES)[number];

export const CorrectionSchema = z.object({
  id: z.string(),
  care_plan_id: z.string(),
  entity_type: z.enum(ENTITY_TYPES),
  entity_id: z.string(),
  field: z.string(),
  previous_value: z.string().nullable(),
  new_value: z.string().nullable(),
  note: z.string().nullable(),
  source: z.literal("patient"),
  created_at: z.string(),
});
export type Correction = z.infer<typeof CorrectionSchema>;

export const PROCESSING_STATUSES = [
  "uploading",
  "uploaded",
  "processing",
  "ready_for_review",
  "failed",
  "rejected",
  "sample",
] as const;
export type ProcessingStatus = (typeof PROCESSING_STATUSES)[number];

export const DocumentRecordSchema = z.object({
  id: z.string(),
  care_plan_id: z.string(),
  file_path: z.string().nullable(),
  original_filename: z.string(),
  mime_type: z.string(),
  file_size: z.number().int(),
  document_type: DocumentTypeSchema,
  classification_source: z.enum(["ai", "patient", "sample", "none"]),
  processing_status: z.enum(PROCESSING_STATUSES),
  processing_error: z.string().nullable(),
  /** Text rendering for synthetic sample documents (demo only). */
  sample_text: z.string().nullable(),
  created_at: z.string(),
  updated_at: z.string(),
});
export type DocumentRecord = z.infer<typeof DocumentRecordSchema>;

export const EncounterEvidenceSchema = z.object({
  document_id: z.string().nullable(),
  source_page: z.number().int().nullable(),
  source_excerpt: z.string().nullable(),
  verification_status: VerificationStatusSchema,
  uncertain: z.boolean(),
  patient_edited: z.boolean(),
});
export type EncounterEvidence = z.infer<typeof EncounterEvidenceSchema>;

export const CarePlanSchema = z.object({
  id: z.string(),
  title: z.string(),
  diagnosis: z.string().nullable(),
  procedure: z.string().nullable(),
  admission_date: isoDate.nullable(),
  discharge_date: isoDate.nullable(),
  facility: z.string().nullable(),
  clinician: z.string().nullable(),
  encounter_evidence: z.record(z.string(), EncounterEvidenceSchema),
  status: z.enum(["draft", "active", "archived"]),
  is_sample: z.boolean(),
  created_at: z.string(),
  updated_at: z.string(),
});
export type CarePlan = z.infer<typeof CarePlanSchema>;

export const PlanBundleSchema = z.object({
  plan: CarePlanSchema,
  documents: z.array(DocumentRecordSchema),
  medications: z.array(MedicationSchema),
  tasks: z.array(RecoveryTaskSchema),
  follow_ups: z.array(FollowUpSchema),
  warning_signs: z.array(WarningSignSchema),
  flags: z.array(ReviewFlagSchema),
  corrections: z.array(CorrectionSchema),
});
export type PlanBundle = z.infer<typeof PlanBundleSchema>;

export const ProfileSchema = z.object({
  display_name: z.string().trim().max(80).nullable(),
  preferred_language: LanguageSchema,
});
export type Profile = z.infer<typeof ProfileSchema>;

/* ---------- mutation payloads (validated on client and server) ---------- */

export const EDITABLE_FIELDS = {
  medication: [
    "name",
    "brand_name",
    "generic_name",
    "strength",
    "dose",
    "route",
    "frequency",
    "timing",
    "duration",
    "special_instructions",
  ],
  task: ["instruction", "schedule_description", "due_date"],
  follow_up: ["specialty", "clinician", "scheduled_date", "scheduled_time", "investigation", "preparation_instructions"],
  warning_sign: ["sign", "action"],
  encounter: ["diagnosis", "procedure", "admission_date", "discharge_date", "facility", "clinician"],
} as const;

export type EditableKind = keyof typeof EDITABLE_FIELDS;
export const DATE_FIELDS = new Set(["due_date", "scheduled_date", "admission_date", "discharge_date"]);

export const ItemPatchSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("set_status"), status: VerificationStatusSchema }),
  z.object({
    action: z.literal("correct"),
    field: z.string().min(1).max(64),
    value: z.string().trim().max(2000).nullable(),
    note: z.string().trim().max(500).nullable().optional(),
  }),
  z.object({ action: z.literal("complete"), completed: z.boolean() }),
  z.object({
    action: z.literal("follow_up_status"),
    status: z.enum(FOLLOW_UP_STATUSES),
    reschedule_date: isoDate.nullable().optional(),
    note: z.string().trim().max(500).nullable().optional(),
  }),
  z.object({
    action: z.literal("flag_status"),
    status: z.enum(["open", "discussed_with_care_team"]),
    note: z.string().trim().max(500).nullable().optional(),
  }),
]);
export type ItemPatch = z.infer<typeof ItemPatchSchema>;

export const PlanPatchSchema = z.object({
  title: z.string().trim().min(1).max(120).optional(),
});

export const CreatePlanSchema = z.object({
  title: z.string().trim().max(120).optional(),
});

export const UploadRequestSchema = z.object({
  care_plan_id: z.uuid(),
  filename: z.string().min(1).max(255),
  size: z.number().int().positive(),
  mime_type: z.string().max(100),
});

export const DocumentPatchSchema = z.object({
  document_type: DocumentTypeSchema,
});

export { ACTIVITY_KINDS, DIET_KINDS, WOUND_KINDS };
