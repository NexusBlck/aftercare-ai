import {
  DATE_FIELDS,
  EDITABLE_FIELDS,
  type Correction,
  type EditableKind,
  type ItemPatch,
  type PlanBundle,
  type VerificationStatus,
} from "@/schemas/domain";
import type { EncounterKey } from "@/schemas/extraction";
import type { DomainContext } from "./context";
import { detectConflicts } from "./conflicts";
import { isValidIsoDate, isValidTime } from "./dates";

export type ItemKind = "medication" | "task" | "follow_up" | "warning_sign" | "flag" | "encounter";

export class PatchError extends Error {
  constructor(
    public code: "not_found" | "invalid_field" | "invalid_value" | "not_allowed",
    message: string,
  ) {
    super(message);
  }
}

const COLLECTION = {
  medication: "medications",
  task: "tasks",
  follow_up: "follow_ups",
  warning_sign: "warning_signs",
  flag: "flags",
} as const;

const PATIENT_STATUSES: VerificationStatus[] = ["needs_review", "confirmed_by_patient", "needs_clinician_clarification"];

/**
 * Applies one patient action to a plan and returns the new plan. Used verbatim by the browser
 * (demo mode) and by the API (account mode), so both modes enforce identical rules.
 */
export function applyItemPatch(
  bundle: PlanBundle,
  kind: ItemKind,
  id: string,
  patch: ItemPatch,
  ctx: DomainContext,
): PlanBundle {
  if (kind === "encounter") return detectConflicts(applyEncounterPatch(bundle, id as EncounterKey, patch, ctx), ctx);

  const key = COLLECTION[kind];
  const items = bundle[key] as Array<Record<string, unknown> & { id: string }>;
  const index = items.findIndex((i) => i.id === id);
  if (index < 0) throw new PatchError("not_found", "This item no longer exists.");
  const item = items[index];
  const updated: Record<string, unknown> = { ...item, updated_at: ctx.now };
  const corrections: Correction[] = [];
  let next: PlanBundle = bundle;

  switch (patch.action) {
    case "set_status": {
      if (kind === "flag") throw new PatchError("not_allowed", "Use flag_status for review flags.");
      if (!PATIENT_STATUSES.includes(patch.status)) {
        throw new PatchError("not_allowed", "Only the system can mark information as conflicting.");
      }
      if (item.verification_status === "conflicting" && patch.status === "confirmed_by_patient") {
        throw new PatchError(
          "not_allowed",
          "This item conflicts with another document. Check with your care team, then mark the conflict as discussed before confirming.",
        );
      }
      updated.verification_status = patch.status;
      break;
    }
    case "correct": {
      if (kind === "flag") throw new PatchError("not_allowed", "Review flags cannot be edited.");
      const allowed = EDITABLE_FIELDS[kind as EditableKind] as readonly string[];
      if (!allowed.includes(patch.field)) throw new PatchError("invalid_field", `"${patch.field}" cannot be edited.`);
      const value = validateFieldValue(patch.field, patch.value);
      const previous = (item[patch.field] as string | null) ?? null;
      if (previous === value) return bundle;
      corrections.push(correctionRecord(bundle, kind, id, patch.field, previous, value, patch.note ?? null, ctx));
      updated[patch.field] = value;
      updated.patient_edited = true;
      // An edited value must be reviewed again; a conflict stays a conflict.
      if (item.verification_status !== "conflicting") updated.verification_status = "needs_review";
      // The previous explanation described the old wording.
      if ("plain_language" in item) updated.plain_language = null;
      break;
    }
    case "complete": {
      if (kind !== "task") throw new PatchError("not_allowed", "Only recovery tasks can be completed.");
      updated.completed = patch.completed;
      updated.completed_at = patch.completed ? ctx.now : null;
      break;
    }
    case "follow_up_status": {
      if (kind !== "follow_up") throw new PatchError("not_allowed", "Only appointments have an attendance status.");
      updated.status = patch.status;
      const date = patch.status === "rescheduled" ? patch.reschedule_date ?? null : null;
      if (date !== null && !isValidIsoDate(date)) throw new PatchError("invalid_value", "Enter a valid date.");
      updated.patient_reschedule_date = date;
      if (patch.note !== undefined) updated.patient_note = patch.note || null;
      break;
    }
    case "flag_status": {
      if (kind !== "flag") throw new PatchError("not_allowed", "Only review flags have this status.");
      updated.status = patch.status;
      if (patch.note !== undefined) updated.patient_note = patch.note || null;
      break;
    }
  }

  const nextItems = [...items];
  nextItems[index] = updated as (typeof items)[number];
  next = { ...bundle, [key]: nextItems, corrections: [...bundle.corrections, ...corrections] } as PlanBundle;
  return detectConflicts(next, ctx);
}

function applyEncounterPatch(bundle: PlanBundle, field: EncounterKey, patch: ItemPatch, ctx: DomainContext): PlanBundle {
  if (!(EDITABLE_FIELDS.encounter as readonly string[]).includes(field)) {
    throw new PatchError("invalid_field", "Unknown encounter field.");
  }
  const evidence = bundle.plan.encounter_evidence[field] ?? {
    document_id: null,
    source_page: null,
    source_excerpt: null,
    verification_status: "needs_review" as VerificationStatus,
    uncertain: false,
    patient_edited: false,
  };
  const plan = { ...bundle.plan, updated_at: ctx.now, encounter_evidence: { ...bundle.plan.encounter_evidence } };
  const corrections: Correction[] = [];

  if (patch.action === "set_status") {
    if (!PATIENT_STATUSES.includes(patch.status)) throw new PatchError("not_allowed", "Only the system can mark information as conflicting.");
    if (evidence.verification_status === "conflicting" && patch.status === "confirmed_by_patient") {
      throw new PatchError("not_allowed", "Resolve the conflict with your care team before confirming.");
    }
    plan.encounter_evidence[field] = { ...evidence, verification_status: patch.status };
  } else if (patch.action === "correct") {
    if (patch.field !== field) throw new PatchError("invalid_field", "Field mismatch.");
    const value = validateFieldValue(field, patch.value);
    const previous = plan[field];
    if (previous === value) return bundle;
    corrections.push(correctionRecord(bundle, "encounter", field, field, previous, value, patch.note ?? null, ctx));
    (plan as Record<EncounterKey, string | null>)[field] = value;
    plan.encounter_evidence[field] = {
      ...evidence,
      patient_edited: true,
      verification_status: evidence.verification_status === "conflicting" ? "conflicting" : "needs_review",
    };
  } else {
    throw new PatchError("not_allowed", "Unsupported action for encounter details.");
  }
  return { ...bundle, plan, corrections: [...bundle.corrections, ...corrections] };
}

function validateFieldValue(field: string, raw: string | null): string | null {
  const value = raw === null ? null : raw.trim() === "" ? null : raw.trim();
  if (field === "name" || field === "instruction" || field === "sign") {
    if (!value) throw new PatchError("invalid_value", "This field cannot be empty.");
  }
  if (value !== null && DATE_FIELDS.has(field) && !isValidIsoDate(value)) {
    throw new PatchError("invalid_value", "Enter a complete date (YYYY-MM-DD).");
  }
  if (value !== null && field === "scheduled_time" && !isValidTime(value)) {
    throw new PatchError("invalid_value", "Enter a time as HH:MM.");
  }
  return value;
}

function correctionRecord(
  bundle: PlanBundle,
  kind: Exclude<ItemKind, "flag">,
  entityId: string,
  field: string,
  previous: string | null,
  value: string | null,
  note: string | null,
  ctx: DomainContext,
): Correction {
  return {
    id: ctx.newId(),
    care_plan_id: bundle.plan.id,
    entity_type: kind,
    entity_id: entityId,
    field,
    previous_value: previous,
    new_value: value,
    note,
    source: "patient",
    created_at: ctx.now,
  };
}
