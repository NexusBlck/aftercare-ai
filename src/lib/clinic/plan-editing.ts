import { z } from "zod";
import "@/schemas/zod-config";
import { applyItemPatch, PatchError, type ItemKind } from "@/lib/domain/patch";
import type { DomainContext } from "@/lib/domain/context";
import { detectConflicts } from "@/lib/domain/conflicts";
import { isValidIsoDate, isValidTime } from "@/lib/domain/dates";
import { EDITABLE_FIELDS, TASK_CATEGORIES, type PlanBundle } from "@/schemas/domain";

/**
 * Clinician edits to a draft plan version. Pure functions over the same PlanBundle the patient app
 * uses, so extraction, conflict detection and rendering are shared. Every edit is recorded as a
 * correction with source "clinician"; nothing here changes an approved version (the database refuses).
 */

const kind = z.enum(["medication", "task", "follow_up", "warning_sign"]);
const encounterField = z.enum(EDITABLE_FIELDS.encounter);
const text = (max: number) => z.string().trim().max(max);

export const VersionEditSchema = z.discriminatedUnion("op", [
  z.object({
    op: z.literal("correct"),
    kind: z.union([kind, z.literal("encounter")]),
    id: z.string().min(1).max(64),
    field: z.string().min(1).max(64),
    value: text(2000).nullable(),
    note: text(500).nullable().optional(),
  }),
  z.object({ op: z.literal("add"), kind, fields: z.record(z.string(), text(2000).nullable()) }),
  z.object({ op: z.literal("remove"), kind, id: z.string().min(1).max(64), note: text(500).nullable().optional() }),
  z.object({ op: z.literal("flag_item"), kind, id: z.string().min(1).max(64), note: text(500).min(1) }),
  z.object({ op: z.literal("resolve_flag"), id: z.string().min(1).max(64), note: text(500).min(1, "Record how this was resolved.") }),
  z.object({ op: z.literal("title"), value: text(120).min(1) }),
]);
export type VersionEdit = z.infer<typeof VersionEditSchema>;

const COLLECTION = { medication: "medications", task: "tasks", follow_up: "follow_ups", warning_sign: "warning_signs" } as const;
type ItemKey = keyof typeof COLLECTION;

function relabelLastCorrections(before: PlanBundle, after: PlanBundle): PlanBundle {
  const known = new Set(before.corrections.map((c) => c.id));
  return { ...after, corrections: after.corrections.map((c) => (known.has(c.id) ? c : { ...c, source: "clinician" as const })) };
}

function record(bundle: PlanBundle, entityType: ItemKind | "encounter", entityId: string, field: string, previous: string | null, value: string | null, note: string | null | undefined, ctx: DomainContext): PlanBundle {
  return {
    ...bundle,
    corrections: [
      ...bundle.corrections,
      {
        id: ctx.newId(),
        care_plan_id: bundle.plan.id,
        entity_type: entityType === "flag" ? "flag" : entityType,
        entity_id: entityId,
        field,
        previous_value: previous,
        new_value: value,
        note: note ?? null,
        source: "clinician",
        created_at: ctx.now,
      },
    ],
  };
}

function cleanValue(field: string, raw: string | null | undefined): string | null {
  const value = raw == null || raw.trim() === "" ? null : raw.trim();
  if (value !== null && ["due_date", "scheduled_date", "admission_date", "discharge_date"].includes(field) && !isValidIsoDate(value)) {
    throw new PatchError("invalid_value", "Enter a complete date (YYYY-MM-DD).");
  }
  if (value !== null && field === "scheduled_time" && !isValidTime(value)) throw new PatchError("invalid_value", "Enter a time as HH:MM.");
  return value;
}

function newItem(bundle: PlanBundle, k: ItemKey, fields: Record<string, string | null>, ctx: DomainContext): Record<string, unknown> {
  const allowed = EDITABLE_FIELDS[k] as readonly string[];
  const values: Record<string, string | null> = {};
  for (const [key, raw] of Object.entries(fields)) {
    if (key === "category" && k === "task") continue;
    if (!allowed.includes(key)) throw new PatchError("invalid_field", `"${key}" cannot be set.`);
    values[key] = cleanValue(key, raw);
  }
  const base = {
    id: ctx.newId(),
    care_plan_id: bundle.plan.id,
    document_id: null,
    source_page: null,
    source_excerpt: null,
    // Entered by a clinician; still part of the draft that must be approved as a whole.
    verification_status: "needs_review" as const,
    uncertain: false,
    uncertainty_note: null,
    patient_edited: false,
    plain_language: null,
    created_at: ctx.now,
    updated_at: ctx.now,
  };
  switch (k) {
    case "medication": {
      if (!values.name) throw new PatchError("invalid_value", "Enter the medication name as documented.");
      const m = { brand_name: null, generic_name: null, strength: null, dose: null, route: null, frequency: null, timing: null, duration: null, special_instructions: null };
      return { ...base, ...m, ...values };
    }
    case "task": {
      if (!values.instruction) throw new PatchError("invalid_value", "Enter the instruction as documented.");
      const category = (TASK_CATEGORIES as readonly string[]).includes(fields.category ?? "") ? fields.category : "other";
      return { ...base, category, kind: "other", schedule_description: null, due_date: null, completed: false, completed_at: null, ...values };
    }
    case "follow_up": {
      const f = { specialty: null, clinician: null, scheduled_date: null, scheduled_time: null, investigation: null, preparation_instructions: null };
      const item = { ...base, ...f, ...values, status: "upcoming", patient_reschedule_date: null, patient_note: null };
      if (!item.specialty && !item.clinician && !item.scheduled_date && !item.investigation) {
        throw new PatchError("invalid_value", "Enter at least the clinic, clinician, date or investigation.");
      }
      return item;
    }
    case "warning_sign": {
      if (!values.sign) throw new PatchError("invalid_value", "Enter the warning sign as documented.");
      return { ...base, action: null, ...values };
    }
  }
}

export function applyVersionEdit(bundle: PlanBundle, edit: VersionEdit, ctx: DomainContext): PlanBundle {
  switch (edit.op) {
    case "correct": {
      const after = applyItemPatch(bundle, edit.kind, edit.id, { action: "correct", field: edit.field, value: edit.value, note: edit.note ?? null }, ctx);
      if (after === bundle) return bundle;
      // applyItemPatch marks edits as patient edits; here the clinician made them.
      const unmark = <T extends { id: string; patient_edited: boolean }>(items: T[]) =>
        items.map((i) => (i.id === edit.id ? { ...i, patient_edited: false } : i));
      const relabelled = relabelLastCorrections(bundle, after);
      if (edit.kind === "encounter") {
        const key = encounterField.parse(edit.id);
        const ev = relabelled.plan.encounter_evidence[key];
        return ev ? { ...relabelled, plan: { ...relabelled.plan, encounter_evidence: { ...relabelled.plan.encounter_evidence, [key]: { ...ev, patient_edited: false } } } } : relabelled;
      }
      const key = COLLECTION[edit.kind];
      return { ...relabelled, [key]: unmark(relabelled[key] as Array<{ id: string; patient_edited: boolean }>) } as PlanBundle;
    }
    case "add": {
      const key = COLLECTION[edit.kind];
      const item = newItem(bundle, edit.kind, edit.fields, ctx);
      const next = { ...bundle, [key]: [...(bundle[key] as unknown[]), item] } as PlanBundle;
      return detectConflicts(record(next, edit.kind, item.id as string, "*", null, "added", null, ctx), ctx);
    }
    case "remove": {
      const key = COLLECTION[edit.kind];
      const items = bundle[key] as Array<{ id: string }>;
      if (!items.some((i) => i.id === edit.id)) throw new PatchError("not_found", "This item no longer exists.");
      const next = { ...bundle, [key]: items.filter((i) => i.id !== edit.id) } as PlanBundle;
      return detectConflicts(record(next, edit.kind, edit.id, "*", "present", null, edit.note, ctx), ctx);
    }
    case "flag_item": {
      const key = COLLECTION[edit.kind];
      const items = bundle[key] as Array<{ id: string; uncertain: boolean; uncertainty_note: string | null }>;
      const target = items.find((i) => i.id === edit.id);
      if (!target) throw new PatchError("not_found", "This item no longer exists.");
      const flag = {
        id: ctx.newId(),
        care_plan_id: bundle.plan.id,
        document_id: null,
        kind: "uncertainty" as const,
        category: "other" as const,
        description: edit.note,
        related_ids: [edit.id],
        excerpts: [],
        origin: "clinician" as const,
        rule_key: null, // kept by conflict re-detection, which only recomputes rule flags
        status: "open" as const,
        patient_note: null,
        created_at: ctx.now,
        updated_at: ctx.now,
      };
      const next = {
        ...bundle,
        [key]: items.map((i) => (i.id === edit.id ? { ...i, uncertain: true, uncertainty_note: edit.note } : i)),
        flags: [...bundle.flags, flag],
      } as PlanBundle;
      return next;
    }
    case "resolve_flag": {
      const flag = bundle.flags.find((f) => f.id === edit.id);
      if (!flag) throw new PatchError("not_found", "This flag no longer exists.");
      const after = applyItemPatch(bundle, "flag", edit.id, { action: "flag_status", status: "discussed_with_care_team", note: edit.note }, ctx);
      return record(after, "flag", edit.id, "status", flag.status, "resolved", edit.note, ctx);
    }
    case "title": {
      if (edit.value === bundle.plan.title) return bundle;
      const next = { ...bundle, plan: { ...bundle.plan, title: edit.value, updated_at: ctx.now } };
      return record(next, "encounter", "title", "title", bundle.plan.title, edit.value, null, ctx);
    }
  }
}

/** Open review flags block submission and approval: uncertainties must be resolved by a clinician first. */
export function openFlags(bundle: PlanBundle) {
  return bundle.flags.filter((f) => f.status === "open");
}

export interface ReadinessIssue {
  code: "open_flags" | "empty_plan";
  message: string;
}

export function approvalReadiness(bundle: PlanBundle): ReadinessIssue[] {
  const issues: ReadinessIssue[] = [];
  const open = openFlags(bundle).length;
  if (open > 0) issues.push({ code: "open_flags", message: `${open} open ${open === 1 ? "flag needs" : "flags need"} a clinician's resolution.` });
  const items = bundle.medications.length + bundle.tasks.length + bundle.follow_ups.length + bundle.warning_signs.length;
  if (items === 0) issues.push({ code: "empty_plan", message: "The plan has no medications, instructions, follow-ups or warning signs yet." });
  return issues;
}
