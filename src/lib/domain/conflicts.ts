import type { Medication, PlanBundle, ReviewFlag, VerificationStatus } from "@/schemas/domain";
import type { DomainContext } from "./context";
import { normalizeMedicationName, valuesDisagree } from "./text";

/**
 * Deterministic cross-document conflict detection. Conflicts are surfaced, never resolved.
 *
 * Invariant maintained here: an item is `conflicting` exactly when it is referenced by an open
 * conflict flag — unless the patient already marked it `needs_clinician_clarification`.
 */

const COMPARED_MED_FIELDS = ["strength", "dose", "route", "frequency", "duration"] as const;

interface RuleConflict {
  rule_key: string;
  category: ReviewFlag["category"];
  description: string;
  related_ids: string[];
  excerpts: string[];
  document_id: string | null;
}

function medicationConflicts(meds: Medication[]): RuleConflict[] {
  const groups = new Map<string, Medication[]>();
  for (const med of meds) {
    const key = normalizeMedicationName(med.generic_name ?? med.name);
    if (!key) continue;
    groups.set(key, [...(groups.get(key) ?? []), med]);
  }
  const conflicts: RuleConflict[] = [];
  for (const [key, group] of groups) {
    if (group.length < 2) continue;
    const differing = COMPARED_MED_FIELDS.filter((field) => {
      const values = group.map((m) => m[field]).filter((v): v is string => v !== null);
      return values.some((v) => valuesDisagree(field, v, values[0]));
    });
    if (differing.length === 0) continue;
    const ids = group.map((m) => m.id).sort();
    conflicts.push({
      rule_key: `auto:medication:${key}:${ids.join(",")}`,
      category: "medication_schedule",
      description: `${group[0].name} appears ${group.length} times with a different ${differing.join(", ")}. Do not choose between them yourself — ask your pharmacist or treating clinician which instruction is correct.`,
      related_ids: ids,
      excerpts: group.map((m) => m.source_excerpt).filter((e): e is string => !!e),
      document_id: null,
    });
  }
  return conflicts;
}

function followUpConflicts(bundle: PlanBundle): RuleConflict[] {
  const groups = new Map<string, PlanBundle["follow_ups"]>();
  for (const f of bundle.follow_ups) {
    if (!f.specialty || !f.scheduled_date) continue;
    const key = f.specialty.toLowerCase().replace(/[^a-z]/g, "");
    groups.set(key, [...(groups.get(key) ?? []), f]);
  }
  const conflicts: RuleConflict[] = [];
  for (const [key, group] of groups) {
    const docs = new Set(group.map((f) => f.document_id));
    const dates = new Set(group.map((f) => f.scheduled_date));
    if (group.length < 2 || docs.size < 2 || dates.size < 2) continue;
    const ids = group.map((f) => f.id).sort();
    conflicts.push({
      rule_key: `auto:follow_up:${key}:${ids.join(",")}`,
      category: "date",
      description: `Different documents give different dates for the ${group[0].specialty} follow-up (${[...dates].join(", ")}). Confirm with the clinic whether these are separate appointments.`,
      related_ids: ids,
      excerpts: group.map((f) => f.source_excerpt).filter((e): e is string => !!e),
      document_id: null,
    });
  }
  return conflicts;
}

function nextStatus(current: VerificationStatus, inOpenConflict: boolean): VerificationStatus {
  if (inOpenConflict) {
    return current === "needs_clinician_clarification" ? current : "conflicting";
  }
  return current === "conflicting" ? "needs_review" : current;
}

export function detectConflicts(bundle: PlanBundle, ctx: DomainContext): PlanBundle {
  const found = [...medicationConflicts(bundle.medications), ...followUpConflicts(bundle)];
  const foundKeys = new Set(found.map((c) => c.rule_key));

  const keptFlags = bundle.flags.filter((f) => f.rule_key === null || foundKeys.has(f.rule_key));
  const existingKeys = new Set(keptFlags.map((f) => f.rule_key));
  const newFlags: ReviewFlag[] = found
    .filter((c) => !existingKeys.has(c.rule_key))
    .map((c) => ({
      id: ctx.newId(),
      care_plan_id: bundle.plan.id,
      document_id: c.document_id,
      kind: "conflict",
      category: c.category,
      description: c.description,
      related_ids: c.related_ids,
      excerpts: c.excerpts,
      origin: "rule",
      rule_key: c.rule_key,
      status: "open",
      patient_note: null,
      created_at: ctx.now,
      updated_at: ctx.now,
    }));
  const flags = [...keptFlags, ...newFlags];

  const conflicted = new Set(
    flags.filter((f) => f.kind === "conflict" && f.status === "open").flatMap((f) => f.related_ids),
  );

  const update = <T extends { id: string; verification_status: VerificationStatus; updated_at: string }>(
    items: T[],
  ): T[] =>
    items.map((item) => {
      const status = nextStatus(item.verification_status, conflicted.has(item.id));
      return status === item.verification_status ? item : { ...item, verification_status: status, updated_at: ctx.now };
    });

  const encounter_evidence = Object.fromEntries(
    Object.entries(bundle.plan.encounter_evidence).map(([key, ev]) => [
      key,
      { ...ev, verification_status: nextStatus(ev.verification_status, conflicted.has(`encounter:${key}`)) },
    ]),
  );

  return {
    ...bundle,
    plan: { ...bundle.plan, encounter_evidence },
    flags,
    medications: update(bundle.medications),
    tasks: update(bundle.tasks),
    follow_ups: update(bundle.follow_ups),
    warning_signs: update(bundle.warning_signs),
  };
}
