import { describe, expect, it } from "vitest";
import { applyVersionEdit, approvalReadiness, VersionEditSchema } from "@/lib/clinic/plan-editing";
import { assignableRoles, can, normalizeReviewer, permissionsFor } from "@/lib/clinic/permissions";
import { mapDbError } from "@/lib/clinic/db-errors";
import { hasUrgentKeywords } from "@/lib/clinic/urgent";
import { PatchError } from "@/lib/domain/patch";
import { createEmptyBundle } from "@/lib/domain/plan";
import { CreatePatientSchema, DecisionSchema, RedeemPatientInviteSchema, StaffInviteSchema } from "@/schemas/clinic";
import { PlanBundleSchema } from "@/schemas/domain";

let n = 0;
const ctx = { now: "2026-11-13T10:00:00.000Z", newId: () => `id-${++n}` };

describe("clinic permissions", () => {
  const owner = { role: "owner", clinical_reviewer: false } as const;
  const ownerClinician = { role: "owner", clinical_reviewer: true } as const;
  const admin = { role: "admin", clinical_reviewer: false } as const;
  const clinician = { role: "clinician", clinical_reviewer: true } as const;
  const nurse = { role: "nurse", clinical_reviewer: false } as const;

  it("only clinical reviewers edit and approve plans", () => {
    expect(can(clinician, "plans.decide")).toBe(true);
    expect(can(ownerClinician, "plans.decide")).toBe(true);
    expect(can(owner, "plans.decide")).toBe(false);
    expect(can(admin, "plans.edit")).toBe(false);
    expect(can(nurse, "plans.decide")).toBe(false);
    expect(can(nurse, "plans.edit")).toBe(false);
    // A nurse can never become a reviewer, even if the flag is set by mistake.
    expect(can({ role: "nurse", clinical_reviewer: true }, "plans.decide")).toBe(false);
  });

  it("administrative operations are limited to owners and admins", () => {
    for (const p of ["staff.manage", "org.manage", "audit.read", "billing.read", "patients.archive", "documents.delete"] as const) {
      expect(can(owner, p), p).toBe(true);
      expect(can(admin, p), p).toBe(true);
      expect(can(clinician, p), p).toBe(false);
      expect(can(nurse, p), p).toBe(false);
    }
    expect(can(admin, "staff.manage_admins")).toBe(false);
    expect(can(owner, "staff.manage_admins")).toBe(true);
  });

  it("all staff register patients, upload documents and invite patients", () => {
    for (const m of [owner, admin, clinician, nurse]) {
      expect(can(m, "patients.write")).toBe(true);
      expect(can(m, "documents.upload")).toBe(true);
      expect(can(m, "invitations.manage")).toBe(true);
    }
    expect(can(null, "patients.read")).toBe(false);
  });

  it("assignable roles and reviewer normalisation mirror the database", () => {
    expect(assignableRoles(owner)).toEqual(["admin", "clinician", "nurse"]);
    expect(assignableRoles(admin)).toEqual(["clinician", "nurse"]);
    expect(assignableRoles(nurse)).toEqual([]);
    expect(normalizeReviewer("clinician", false)).toBe(true);
    expect(normalizeReviewer("nurse", true)).toBe(false);
    expect(normalizeReviewer("admin", true)).toBe(true);
    expect(permissionsFor(nurse)).not.toContain("plans.decide");
  });
});

describe("urgent-symptom keyword screen", () => {
  it("flags messages that may describe urgent symptoms, in English and Urdu", () => {
    for (const text of [
      "I have chest pain since this morning",
      "I can't breathe properly",
      "the wound is bleeding heavily and won't stop",
      "I fainted in the bathroom",
      "fever of 39.5 and shivering",
      "there is pus coming from the wound",
      "seene mein dard ho raha hai",
      "مجھے سانس لینے میں مشکل ہے",
    ]) {
      expect(hasUrgentKeywords(text), text).toBe(true);
    }
  });

  it("does not flag routine questions (and a non-match never means safe)", () => {
    for (const text of ["When can I shower?", "Can I take my tablets with food?", "My follow-up letter has the wrong date"]) {
      expect(hasUrgentKeywords(text), text).toBe(false);
    }
  });
});

describe("database error mapping", () => {
  it("maps known function errors and never leaks raw messages", () => {
    expect(mapDbError({ message: "forbidden" }).status).toBe(403);
    expect(mapDbError({ message: "plan_limit_reached", hint: "active_patients" }).message).toContain("active patients");
    expect(mapDbError({ message: "invitation_expired" }).code).toBe("invitation_invalid");
    expect(mapDbError({ message: 'new row violates row-level security policy for table "x"', code: "42501" }).code).toBe("forbidden");
    expect(mapDbError({ message: "duplicate key value", code: "23505" }).code).toBe("duplicate");
    const unknown = mapDbError({ message: "relation secret_table does not exist", code: "42P01" });
    expect(unknown.code).toBe("database_error");
    expect(unknown.message).not.toContain("secret_table");
  });
});

describe("clinic request schemas", () => {
  it("validates patient registration and rejects future dates of birth", () => {
    const ok = CreatePatientSchema.safeParse({ full_name: "  Synthetic Person ", date_of_birth: "1980-01-31", email: "", phone: "" });
    expect(ok.success && ok.data.full_name).toBe("Synthetic Person");
    expect(ok.success && ok.data.email).toBeNull();
    expect(CreatePatientSchema.safeParse({ full_name: "A B", date_of_birth: "2999-01-01" }).success).toBe(false);
    expect(CreatePatientSchema.safeParse({ full_name: "A B", date_of_birth: "1980-02-30" }).success).toBe(false);
    expect(CreatePatientSchema.safeParse({ full_name: "A B", date_of_birth: "1980-01-01", phone: "call me maybe" }).success).toBe(false);
  });

  it("invitation tokens must be 64 hex characters; staff emails are normalised", () => {
    expect(RedeemPatientInviteSchema.safeParse({ token: "x".repeat(64), date_of_birth: "1980-01-01" }).success).toBe(false);
    expect(RedeemPatientInviteSchema.safeParse({ token: "a".repeat(64), date_of_birth: "1980-01-01" }).success).toBe(true);
    const invite = StaffInviteSchema.parse({ email: " Nurse@Clinic.TEST ", role: "nurse" });
    expect(invite.email).toBe("nurse@clinic.test");
    expect(StaffInviteSchema.safeParse({ email: "a@b.co", role: "owner" }).success).toBe(false);
  });

  it("decisions are limited to approve, reject or request changes", () => {
    expect(DecisionSchema.safeParse({ decision: "approved", attest: true }).success).toBe(true);
    expect(DecisionSchema.safeParse({ decision: "auto_approve" }).success).toBe(false);
  });
});

describe("clinician plan editing", () => {
  const empty = () => createEmptyBundle("plan-1", "Discharge plan", ctx);

  it("adds a medication exactly as entered, recorded as a clinician change", () => {
    const after = applyVersionEdit(empty(), { op: "add", kind: "medication", fields: { name: "Paracetamol", strength: "500 mg", frequency: "TDS" } }, ctx);
    expect(after.medications).toHaveLength(1);
    expect(after.medications[0]).toMatchObject({ name: "Paracetamol", strength: "500 mg", frequency: "TDS", dose: null, duration: null, document_id: null });
    expect(after.corrections.at(-1)).toMatchObject({ source: "clinician", entity_type: "medication", new_value: "added" });
    expect(PlanBundleSchema.safeParse(after).success).toBe(true);
  });

  it("never fills in missing values: unset fields stay null", () => {
    const after = applyVersionEdit(empty(), { op: "add", kind: "medication", fields: { name: "Amoxicillin" } }, ctx);
    const med = after.medications[0];
    for (const f of ["strength", "dose", "route", "frequency", "timing", "duration"] as const) expect(med[f]).toBeNull();
  });

  it("rejects fields that are not editable and invalid dates", () => {
    expect(() => applyVersionEdit(empty(), { op: "add", kind: "medication", fields: { name: "X", verification_status: "confirmed_by_patient" } }, ctx)).toThrow(PatchError);
    expect(() => applyVersionEdit(empty(), { op: "add", kind: "follow_up", fields: { specialty: "Surgery", scheduled_date: "next week" } }, ctx)).toThrow(/complete date/);
    expect(() => applyVersionEdit(empty(), { op: "add", kind: "medication", fields: {} }, ctx)).toThrow(/name/);
  });

  it("corrects a value, keeps the previous value in the history and does not mark it as a patient edit", () => {
    const withMed = applyVersionEdit(empty(), { op: "add", kind: "medication", fields: { name: "Paracetamol", frequency: "TDS" } }, ctx);
    const id = withMed.medications[0].id;
    const after = applyVersionEdit(withMed, { op: "correct", kind: "medication", id, field: "frequency", value: "QDS", note: "Matches page 2" }, ctx);
    expect(after.medications[0].frequency).toBe("QDS");
    expect(after.medications[0].patient_edited).toBe(false);
    expect(after.corrections.at(-1)).toMatchObject({ source: "clinician", field: "frequency", previous_value: "TDS", new_value: "QDS", note: "Matches page 2" });
  });

  it("open flags block approval until a clinician resolves them with a note", () => {
    const withMed = applyVersionEdit(empty(), { op: "add", kind: "medication", fields: { name: "Paracetamol" } }, ctx);
    const flagged = applyVersionEdit(withMed, { op: "flag_item", kind: "medication", id: withMed.medications[0].id, note: "Duration not documented" }, ctx);
    expect(approvalReadiness(flagged).map((i) => i.code)).toEqual(["open_flags"]);
    expect(VersionEditSchema.safeParse({ op: "resolve_flag", id: flagged.flags[0].id, note: "" }).success).toBe(false);
    const resolved = applyVersionEdit(flagged, { op: "resolve_flag", id: flagged.flags[0].id, note: "Confirmed 5 days with prescriber" }, ctx);
    expect(approvalReadiness(resolved)).toEqual([]);
    expect(resolved.flags[0].status).toBe("discussed_with_care_team");
  });

  it("an empty plan is not ready for approval", () => {
    expect(approvalReadiness(empty()).map((i) => i.code)).toEqual(["empty_plan"]);
  });

  it("removing an item records who removed what", () => {
    const withTask = applyVersionEdit(empty(), { op: "add", kind: "task", fields: { category: "wound_care", instruction: "Keep the dressing dry" } }, ctx);
    expect(withTask.tasks[0].category).toBe("wound_care");
    const after = applyVersionEdit(withTask, { op: "remove", kind: "task", id: withTask.tasks[0].id, note: "Duplicate" }, ctx);
    expect(after.tasks).toHaveLength(0);
    expect(after.corrections.at(-1)).toMatchObject({ source: "clinician", previous_value: "present", new_value: null, note: "Duplicate" });
  });
});
