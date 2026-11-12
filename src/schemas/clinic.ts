import { z } from "zod";
import "./zod-config";
import { DOCUMENT_TYPES } from "./extraction";
import { isValidIsoDate } from "@/lib/domain/dates";

/** Request schemas for the clinic portal and the patient care-team area. Validated on client and server. */

const trimmed = (max: number) => z.string().trim().max(max);
const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .transform((v) => (v === "" ? null : v))
    .nullable()
    .optional();
const isoDate = z.string().refine(isValidIsoDate, "Enter a complete date (YYYY-MM-DD).");
const email = z.string().trim().toLowerCase().pipe(z.email("Enter a valid email address.")).pipe(z.string().max(254));
const optionalEmail = z
  .string()
  .trim()
  .toLowerCase()
  .max(254)
  .refine((v) => v === "" || z.email().safeParse(v).success, "Enter a valid email address.")
  .transform((v) => (v === "" ? null : v))
  .nullable()
  .optional();
const phone = z
  .string()
  .trim()
  .max(40)
  .refine((v) => v === "" || /^[+0-9 ()-]{6,40}$/.test(v), "Enter a valid phone number.")
  .transform((v) => (v === "" ? null : v))
  .nullable()
  .optional();
const token = z.string().regex(/^[0-9a-f]{64}$/, "This link is not valid.");

export const ORG_TYPES = ["hospital", "clinic", "practice", "other"] as const;

export const CreateOrganizationSchema = z.object({
  name: trimmed(120).min(2, "Enter the clinic name."),
  org_type: z.enum(ORG_TYPES),
  city: optionalText(80),
  contact_email: optionalEmail,
  contact_phone: phone,
  owner_name: trimmed(80).min(2, "Enter your name."),
  owner_is_clinician: z.boolean(),
});
export type CreateOrganization = z.infer<typeof CreateOrganizationSchema>;

export const UpdateOrganizationSchema = z.object({
  name: trimmed(120).min(2).optional(),
  org_type: z.enum(ORG_TYPES).optional(),
  city: optionalText(80),
  address: optionalText(300),
  contact_email: optionalEmail,
  contact_phone: phone,
  communication_hours: optionalText(300),
  emergency_instructions: optionalText(600),
});

export const PatientInputSchema = z.object({
  full_name: trimmed(120).min(2, "Enter the patient's full name."),
  date_of_birth: isoDate.refine((d) => d > "1900-01-01" && d <= new Date().toISOString().slice(0, 10), "Enter a valid date of birth."),
  mrn: optionalText(40),
  email: optionalEmail,
  phone,
  preferred_language: z.enum(["en", "ur"]).default("en"),
  emergency_contact_name: optionalText(120),
  emergency_contact_phone: phone,
  consent_status: z.enum(["not_recorded", "verbal", "written", "declined"]).default("not_recorded"),
});
export const CreatePatientSchema = PatientInputSchema.extend({
  /** Set after the user has seen a possible-duplicate warning. */
  confirm_duplicate: z.boolean().optional(),
  episode: z
    .object({
      title: trimmed(160).min(2, "Describe the care episode."),
      department: optionalText(80),
      admission_date: isoDate.nullable().optional(),
      discharge_date: isoDate.nullable().optional(),
    })
    .optional(),
});
export const UpdatePatientSchema = PatientInputSchema.partial().extend({
  status: z.enum(["active", "archived"]).optional(),
});

export const EpisodeSchema = z
  .object({
    title: trimmed(160).min(2, "Describe the care episode."),
    department: optionalText(80),
    admission_date: isoDate.nullable().optional(),
    discharge_date: isoDate.nullable().optional(),
  })
  .refine((e) => !e.admission_date || !e.discharge_date || e.discharge_date >= e.admission_date, {
    message: "Discharge date cannot be before admission.",
    path: ["discharge_date"],
  });

export const PatientListQuerySchema = z.object({
  q: z.string().trim().max(80).optional(),
  status: z.enum(["active", "archived", "all"]).default("active"),
  page: z.coerce.number().int().min(1).max(10_000).default(1),
});

export const ClinicUploadSchema = z.object({
  episode_id: z.uuid(),
  filename: z.string().min(1).max(255),
  size: z.number().int().positive(),
  document_type: z.enum(DOCUMENT_TYPES).default("unknown"),
});

export const ClinicDocumentPatchSchema = z.object({
  document_type: z.enum(DOCUMENT_TYPES).optional(),
  shared_with_patient: z.boolean().optional(),
});

export const DecisionSchema = z.object({
  decision: z.enum(["approved", "rejected", "changes_requested"]),
  comments: z.string().trim().max(2000).optional(),
  /** The reviewer confirms they compared the plan with the source documents. */
  attest: z.literal(true).optional(),
});

export const RevokeApprovalSchema = z.object({ reason: trimmed(500).min(3, "Explain why approval is being withdrawn.") });

export const StaffInviteSchema = z.object({
  email,
  role: z.enum(["admin", "clinician", "nurse"]),
  clinical_reviewer: z.boolean().default(false),
});
export const MemberPatchSchema = z.object({
  role: z.enum(["admin", "clinician", "nurse"]).optional(),
  clinical_reviewer: z.boolean().optional(),
  status: z.enum(["active", "revoked"]).optional(),
});
export const AcceptStaffInviteSchema = z.object({ token, display_name: optionalText(80) });

export const RedeemPatientInviteSchema = z.object({ token, date_of_birth: isoDate });

export const FollowUpVerifySchema = z.object({
  plan_id: z.uuid(),
  item_id: z.string().min(1).max(64),
  status: z.enum(["unverified", "verified_attended", "verified_missed", "cancelled"]),
  note: optionalText(500),
});
export const FollowUpReportSchema = z.object({
  plan_id: z.uuid(),
  item_id: z.string().min(1).max(64),
  status: z.enum(["none", "reported_attended", "reported_missed", "reported_rescheduled"]),
  note: optionalText(500),
});

export const ProgressSchema = z.object({
  version_id: z.uuid(),
  item_kind: z.enum(["task", "medication", "warning_signs", "plan"]),
  item_id: z.string().min(1).max(64),
  action: z.enum(["completed", "acknowledged"]),
  done: z.boolean(),
});

export const QuestionSchema = z.object({
  patient_id: z.uuid(),
  plan_id: z.uuid().nullable().optional(),
  subject: trimmed(140).min(3, "Add a short subject."),
  body: trimmed(4000).min(1, "Write your question."),
});
export const MessageSchema = z.object({ body: trimmed(4000).min(1, "Write a message.") });
export const QuestionPatchSchema = z.object({
  status: z.enum(["new", "assigned", "in_progress", "responded", "closed"]).optional(),
  assigned_to: z.uuid().nullable().optional(),
});

export const ActiveOrgSchema = z.object({ organization_id: z.uuid() });
