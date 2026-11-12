import type { DocumentType } from "@/schemas/extraction";
import type { ProcessingStatus } from "@/schemas/domain";

export const DOCUMENT_TYPE_LABEL: Record<DocumentType, string> = {
  discharge_summary: "Discharge summary",
  prescription: "Prescription",
  laboratory_report: "Laboratory report",
  imaging_report: "Imaging report",
  wound_care_instructions: "Wound-care instructions",
  follow_up_letter: "Follow-up letter",
  other: "Other",
  unknown: "Unknown type",
};

export const PROCESSING_LABEL: Record<ProcessingStatus, string> = {
  uploading: "Uploading",
  uploaded: "Ready to process",
  processing: "Processing",
  ready_for_review: "Ready for review",
  failed: "Processing failed",
  rejected: "Rejected",
  sample: "Sample data",
};

export const FLAG_CATEGORY_LABEL: Record<string, string> = {
  illegible: "Hard to read",
  ambiguous: "Ambiguous",
  missing_information: "Missing information",
  unsupported_assumption: "Unsupported assumption",
  missing_evidence: "No supporting text",
  unsupported_value: "Could not be verified",
  medication_schedule: "Medication schedule",
  date: "Dates",
  instruction: "Instructions",
  other: "Other",
};
