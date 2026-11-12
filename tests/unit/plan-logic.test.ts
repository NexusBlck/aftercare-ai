import { describe, expect, it } from "vitest";
import { applyExtraction, removeDocument } from "@/lib/domain/apply-extraction";
import { buildSamplePlan } from "@/lib/demo/sample-plan";
import { applyItemPatch, PatchError } from "@/lib/domain/patch";
import { buildDoctorQuestions } from "@/lib/domain/questions";
import { sanitizeExtraction } from "@/lib/domain/sanitize";
import { buildTimeline, planOverview, todaysTasks } from "@/lib/domain/summary";
import type { PlanBundle } from "@/schemas/domain";
import { bundleWithDocs, emptyExtraction, extractionOf, testContext } from "./helpers";

function processed(keys: Array<Parameters<typeof extractionOf>[0]>) {
  const ctx = testContext();
  const { bundle: initial, docIds } = bundleWithDocs(ctx, keys.length);
  let bundle = initial;
  keys.forEach((key, i) => {
    const { extraction, issues } = sanitizeExtraction(extractionOf(key));
    bundle = applyExtraction(bundle, { documentId: docIds[i], extraction, issues }, ctx);
  });
  return { bundle, ctx, docIds };
}

const amox = (b: PlanBundle) => b.medications.filter((m) => m.name.startsWith("Amoxicillin"));

describe("applyExtraction", () => {
  it("creates items that all need review, linked to their source document", () => {
    const { bundle, docIds } = processed(["clear-discharge-summary"]);
    expect(bundle.medications).toHaveLength(3);
    expect(bundle.tasks).toHaveLength(9);
    expect(bundle.follow_ups).toHaveLength(1);
    expect(bundle.warning_signs).toHaveLength(5);
    for (const item of [...bundle.medications, ...bundle.tasks, ...bundle.follow_ups, ...bundle.warning_signs]) {
      expect(item.verification_status).toBe("needs_review");
      expect(item.document_id).toBe(docIds[0]);
      expect(item.source_excerpt).toBeTruthy();
    }
    expect(bundle.plan.discharge_date).toBe("2026-11-10");
    expect(bundle.documents[0].processing_status).toBe("ready_for_review");
    expect(bundle.documents[0].document_type).toBe("discharge_summary");
  });

  it("detects the cross-document medication conflict without resolving it", () => {
    const { bundle } = processed(["clear-discharge-summary", "prescription-missing-duration"]);
    const conflicts = bundle.flags.filter((f) => f.kind === "conflict");
    expect(conflicts).toHaveLength(1);
    expect(conflicts[0].description).toMatch(/Amoxicillin-clavulanate/);
    expect(conflicts[0].description).toMatch(/frequency/);
    expect(amox(bundle).every((m) => m.verification_status === "conflicting")).toBe(true);
    // Both versions are kept; neither is chosen.
    expect(amox(bundle).map((m) => m.frequency).sort()).toEqual(["Three times daily", "Twice a day"]);
    // Equivalent paracetamol wording is not a conflict.
    expect(bundle.medications.filter((m) => m.name === "Paracetamol").every((m) => m.verification_status === "needs_review")).toBe(true);
  });

  it("raises a conflict instead of overwriting a different encounter value", () => {
    const ctx = testContext();
    const { bundle: initial, docIds } = bundleWithDocs(ctx, 2);
    const first = sanitizeExtraction(extractionOf("clear-discharge-summary"));
    let bundle = applyExtraction(initial, { documentId: docIds[0], ...first }, ctx);
    const other = extractionOf("clear-discharge-summary");
    other.encounter.discharge_date = { value: "2026-11-11", source_page: 1, source_excerpt: "Discharge date: 11 November 2026", uncertain: false, uncertainty_note: null };
    bundle = applyExtraction(bundle, { documentId: docIds[1], ...sanitizeExtraction(other) }, ctx);
    expect(bundle.plan.discharge_date).toBe("2026-11-10");
    expect(bundle.plan.encounter_evidence.discharge_date.verification_status).toBe("conflicting");
    expect(bundle.flags.some((f) => f.related_ids.includes("encounter:discharge_date"))).toBe(true);
  });

  it("replaces a document's items when it is reprocessed", () => {
    const { bundle, ctx, docIds } = processed(["clear-discharge-summary"]);
    const again = applyExtraction(bundle, { documentId: docIds[0], ...sanitizeExtraction(extractionOf("clear-discharge-summary")) }, ctx);
    expect(again.medications).toHaveLength(3);
  });

  it("removing a document removes its items and clears conflicts it caused", () => {
    const { bundle, ctx, docIds } = processed(["clear-discharge-summary", "prescription-missing-duration"]);
    const after = removeDocument(bundle, docIds[1], ctx);
    expect(after.documents).toHaveLength(1);
    expect(after.medications).toHaveLength(3);
    expect(after.flags.filter((f) => f.kind === "conflict")).toHaveLength(0);
    expect(amox(after)[0].verification_status).toBe("needs_review");
  });

  it("records an empty document without inventing content", () => {
    const ctx = testContext();
    const { bundle: initial, docIds } = bundleWithDocs(ctx, 1);
    const bundle = applyExtraction(initial, { documentId: docIds[0], ...sanitizeExtraction(emptyExtraction({ has_clinical_content: false, document_type: "other" })) }, ctx);
    expect(bundle.medications).toHaveLength(0);
    expect(bundle.flags[0].description).toMatch(/No recovery instructions/);
  });
});

describe("applyItemPatch", () => {
  it("confirms, undoes and asks for clarification", () => {
    const { bundle, ctx } = processed(["clear-discharge-summary"]);
    const id = bundle.medications[0].id;
    let b = applyItemPatch(bundle, "medication", id, { action: "set_status", status: "confirmed_by_patient" }, ctx);
    expect(b.medications[0].verification_status).toBe("confirmed_by_patient");
    b = applyItemPatch(b, "medication", id, { action: "set_status", status: "needs_clinician_clarification" }, ctx);
    expect(b.medications[0].verification_status).toBe("needs_clinician_clarification");
  });

  it("does not let the patient set or bypass 'conflicting'", () => {
    const { bundle, ctx } = processed(["clear-discharge-summary", "prescription-missing-duration"]);
    const conflicted = amox(bundle)[0];
    expect(() => applyItemPatch(bundle, "medication", conflicted.id, { action: "set_status", status: "confirmed_by_patient" }, ctx)).toThrowError(PatchError);
    expect(() => applyItemPatch(bundle, "medication", conflicted.id, { action: "set_status", status: "conflicting" }, ctx)).toThrowError(/Only the system/);
  });

  it("marking a conflict as discussed returns the items to review, and reopening restores the conflict", () => {
    const { bundle, ctx } = processed(["clear-discharge-summary", "prescription-missing-duration"]);
    const flag = bundle.flags.find((f) => f.kind === "conflict")!;
    let b = applyItemPatch(bundle, "flag", flag.id, { action: "flag_status", status: "discussed_with_care_team", note: "Pharmacist said 3 times daily" }, ctx);
    expect(amox(b).every((m) => m.verification_status === "needs_review")).toBe(true);
    expect(b.flags.find((f) => f.id === flag.id)?.patient_note).toBe("Pharmacist said 3 times daily");
    b = applyItemPatch(b, "flag", flag.id, { action: "flag_status", status: "open" }, ctx);
    expect(amox(b).every((m) => m.verification_status === "conflicting")).toBe(true);
  });

  it("records corrections with previous and new values, and requires re-review", () => {
    const { bundle, ctx } = processed(["clear-discharge-summary"]);
    const med = bundle.medications[1];
    let b = applyItemPatch(bundle, "medication", med.id, { action: "set_status", status: "confirmed_by_patient" }, ctx);
    b = applyItemPatch(b, "medication", med.id, { action: "correct", field: "timing", value: "After breakfast, lunch and dinner", note: "Clearer" }, ctx);
    const updated = b.medications.find((m) => m.id === med.id)!;
    expect(updated.timing).toBe("After breakfast, lunch and dinner");
    expect(updated.patient_edited).toBe(true);
    expect(updated.verification_status).toBe("needs_review");
    expect(b.corrections).toEqual([
      expect.objectContaining({ entity_type: "medication", entity_id: med.id, field: "timing", previous_value: "After food", new_value: "After breakfast, lunch and dinner", source: "patient" }),
    ]);
  });

  it("rejects corrections to non-editable fields and invalid values", () => {
    const { bundle, ctx } = processed(["clear-discharge-summary"]);
    const med = bundle.medications[0];
    expect(() => applyItemPatch(bundle, "medication", med.id, { action: "correct", field: "verification_status", value: "confirmed_by_patient" }, ctx)).toThrowError(/cannot be edited/);
    expect(() => applyItemPatch(bundle, "medication", med.id, { action: "correct", field: "name", value: "  " }, ctx)).toThrowError(/cannot be empty/);
    const fu = bundle.follow_ups[0];
    expect(() => applyItemPatch(bundle, "follow_up", fu.id, { action: "correct", field: "scheduled_date", value: "next week" }, ctx)).toThrowError(/complete date/);
  });

  it("task completion records and clears a timestamp", () => {
    const { bundle, ctx } = processed(["clear-discharge-summary"]);
    const t = bundle.tasks[0];
    let b = applyItemPatch(bundle, "task", t.id, { action: "complete", completed: true }, ctx);
    expect(b.tasks[0]).toMatchObject({ completed: true, completed_at: ctx.now });
    b = applyItemPatch(b, "task", t.id, { action: "complete", completed: false }, ctx);
    expect(b.tasks[0]).toMatchObject({ completed: false, completed_at: null });
    expect(() => applyItemPatch(b, "medication", b.medications[0].id, { action: "complete", completed: true }, ctx)).toThrowError(/Only recovery tasks/);
  });

  it("rescheduling keeps the documented date", () => {
    const { bundle, ctx } = processed(["clear-discharge-summary"]);
    const f = bundle.follow_ups[0];
    const b = applyItemPatch(bundle, "follow_up", f.id, { action: "follow_up_status", status: "rescheduled", reschedule_date: "2026-11-25" }, ctx);
    expect(b.follow_ups[0]).toMatchObject({ scheduled_date: "2026-11-22", patient_reschedule_date: "2026-11-25", status: "rescheduled" });
  });

  it("corrects encounter details with an audit record", () => {
    const { bundle, ctx } = processed(["clear-discharge-summary"]);
    const b = applyItemPatch(bundle, "encounter", "facility", { action: "correct", field: "facility", value: "Riverside General" }, ctx);
    expect(b.plan.facility).toBe("Riverside General");
    expect(b.plan.encounter_evidence.facility.patient_edited).toBe(true);
    expect(b.corrections[0].entity_type).toBe("encounter");
  });

  it("throws not_found for unknown items", () => {
    const { bundle, ctx } = processed(["clear-discharge-summary"]);
    expect(() => applyItemPatch(bundle, "task", "nope", { action: "complete", completed: true }, ctx)).toThrowError(/no longer exists/);
  });
});

describe("summary, timeline and questions", () => {
  it("only uses documented dates on the timeline", () => {
    const { bundle } = processed(["clear-discharge-summary", "wound-care-sheet"]);
    const timeline = buildTimeline(bundle, "2026-11-12");
    expect(timeline.map((e) => e.kind)).toEqual(["admission", "discharge", "today", "follow_up"]);
    expect(timeline.map((e) => e.date)).toEqual(["2026-11-08", "2026-11-10", "2026-11-12", "2026-11-22"]);
  });

  it("overview counts reviews, conflicts and the next appointment", () => {
    const { bundle } = processed(["clear-discharge-summary", "prescription-missing-duration"]);
    const o = planOverview(bundle, "2026-11-12");
    expect(o.openConflicts).toBe(1);
    expect(o.totalMedications).toBe(5);
    expect(o.confirmedMedications).toBe(0);
    expect(o.nextFollowUp?.scheduled_date).toBe("2026-11-22");
    expect(todaysTasks(bundle, "2026-11-12")).toHaveLength(9);
  });

  it("asks neutral questions for gaps and conflicts, without duplicating facts stated elsewhere", () => {
    const { bundle } = processed(["clear-discharge-summary", "prescription-missing-duration", "wound-care-sheet"]);
    const questions = buildDoctorQuestions(bundle).map((q) => q.question);
    expect(questions.some((q) => q.includes("Which one should I follow?"))).toBe(true);
    expect(questions.some((q) => q.includes("How often should my dressing be changed"))).toBe(true);
    // Paracetamol's duration is stated in the discharge summary, so no question about it.
    expect(questions.some((q) => q.includes("how long to take Paracetamol"))).toBe(false);
    for (const q of questions) expect(q).not.toMatch(/\b(stop|increase|decrease|switch)\b/i);
  });

  it("asks about missing follow-up dates and missing warning signs", () => {
    const ctx = testContext();
    const { bundle: initial, docIds } = bundleWithDocs(ctx, 1);
    const extraction = emptyExtraction({
      follow_ups: [{ date: null, time: null, specialty: "General Surgery", clinician: null, investigation: "Full blood count", preparation: null, source_page: 1, source_excerpt: "Review in General Surgery clinic in about 2 weeks", uncertain: false, uncertainty_note: null }],
    });
    const bundle = applyExtraction(initial, { documentId: docIds[0], ...sanitizeExtraction(extraction) }, ctx);
    const questions = buildDoctorQuestions(bundle).map((q) => q.question);
    expect(questions).toContain("When is my General Surgery appointment for Full blood count? No date is written in my documents.");
    expect(questions.some((q) => q.includes("Which symptoms should make me seek urgent care?"))).toBe(true);
  });
});

describe("sample plan", () => {
  it("is labelled as sample data with a fixed conflict and anchored dates", () => {
    const bundle = buildSamplePlan(testContext(), "2026-12-01");
    expect(bundle.plan.is_sample).toBe(true);
    expect(bundle.plan.discharge_date).toBe("2026-11-29");
    expect(bundle.documents.every((d) => d.processing_status === "sample" && d.sample_text)).toBe(true);
    expect(bundle.flags.filter((f) => f.kind === "conflict")).toHaveLength(1);
    expect(bundle.medications.every((m) => m.plain_language?.status === "sample")).toBe(true);
  });
});
