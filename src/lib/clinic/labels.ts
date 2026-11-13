const ACTION_LABELS: Record<string, string> = {
  "organization.created": "Clinic created",
  "staff.invited": "Staff member invited",
  "staff.invitation_revoked": "Staff invitation withdrawn",
  "staff.joined": "Staff member joined",
  "staff.revoked": "Staff access revoked",
  "staff.reinstated": "Staff access reinstated",
  "staff.role_changed": "Staff role changed",
  "patient.created": "Patient registered",
  "patient.updated": "Patient record updated",
  "episode.created": "Care episode created",
  "document.uploaded": "Document uploaded",
  "document.processed": "Document processed by AI",
  "document.processing_failed": "Document processing failed",
  "document.viewed": "Document viewed",
  "document.shared": "Document sharing changed",
  "document.deleted": "Document deleted",
  "plan.created": "Recovery plan started",
  "plan.edited": "Plan edited",
  "plan.submitted": "Plan submitted for review",
  "plan.approved": "Plan approved",
  "plan.rejected": "Plan rejected",
  "plan.changes_requested": "Changes requested",
  "plan.revised": "New plan revision started",
  "plan.approval_revoked": "Plan approval withdrawn",
  "invitation.created": "Patient invited",
  "invitation.revoked": "Patient invitation withdrawn",
  "invitation.redeemed": "Patient linked their account",
  "invitation.verification_failed": "Invitation identity check failed",
  "follow_up.verified": "Follow-up status recorded",
  "question.submitted": "Patient question received",
  "question.responded": "Question answered",
  "question.updated": "Question status changed",
};

export function actionLabel(action: string): string {
  return ACTION_LABELS[action] ?? action.replace(".", " · ").replace(/_/g, " ");
}

export const DOCUMENT_TYPE_LABELS: Record<string, string> = {
  discharge_summary: "Discharge summary",
  prescription: "Prescription",
  laboratory_report: "Investigation / lab report",
  imaging_report: "Imaging report",
  wound_care_instructions: "Wound-care instructions",
  follow_up_letter: "Follow-up letter",
  other: "Other",
  unknown: "Not classified",
};

export const PROCESSING_LABELS: Record<string, { label: string; tone: "neutral" | "teal" | "amber" | "danger" | "navy" }> = {
  uploading: { label: "Uploading", tone: "neutral" },
  uploaded: { label: "Ready to process", tone: "navy" },
  processing: { label: "Processing", tone: "amber" },
  processed: { label: "Extracted", tone: "teal" },
  failed: { label: "Failed", tone: "danger" },
};
