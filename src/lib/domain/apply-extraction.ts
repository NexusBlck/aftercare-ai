import type {
  CarePlan,
  FollowUp,
  Medication,
  PlanBundle,
  RecoveryTask,
  ReviewFlag,
  TaskCategory,
  WarningSign,
} from "@/schemas/domain";
import { ENCOUNTER_KEYS, type EncounterKey, type Extraction } from "@/schemas/extraction";
import type { DomainContext } from "./context";
import { detectConflicts } from "./conflicts";
import type { SanitizerIssue, SectionKey } from "./sanitize";
import { sameClinicalText } from "./text";

export interface ApplyExtractionInput {
  documentId: string;
  extraction: Extraction;
  issues: SanitizerIssue[];
}

/**
 * Merges a validated, sanitized extraction into a plan. Every new item starts as `needs_review`.
 * Re-processing a document replaces the items previously extracted from it.
 * Existing encounter values are never overwritten by a different value; a conflict is raised instead.
 */
export function applyExtraction(bundle: PlanBundle, input: ApplyExtractionInput, ctx: DomainContext): PlanBundle {
  const { documentId, extraction, issues } = input;
  const planId = bundle.plan.id;
  const fromOtherDocs = <T extends { document_id: string | null }>(items: T[]) =>
    items.filter((i) => i.document_id !== documentId);

  const base = {
    care_plan_id: planId,
    document_id: documentId,
    verification_status: "needs_review" as const,
    patient_edited: false,
    plain_language: null,
    created_at: ctx.now,
    updated_at: ctx.now,
  };

  const idMap: Record<SectionKey, string[]> = {
    medications: [],
    wound_care: [],
    activity_instructions: [],
    diet_instructions: [],
    follow_ups: [],
    warning_signs: [],
    encounter: [],
  };

  const medications: Medication[] = extraction.medications.map((m) => {
    const id = ctx.newId();
    idMap.medications.push(id);
    return { ...base, ...m, id };
  });

  const toTask = (
    section: "wound_care" | "activity_instructions" | "diet_instructions",
    category: TaskCategory,
    item: {
      kind: string;
      instruction: string;
      source_page: number | null;
      source_excerpt: string | null;
      uncertain: boolean;
      uncertainty_note: string | null;
    },
    schedule: string | null,
  ): RecoveryTask => {
    const id = ctx.newId();
    idMap[section].push(id);
    return {
      ...base,
      id,
      category,
      kind: item.kind,
      instruction: item.instruction,
      due_date: null,
      schedule_description: schedule,
      completed: false,
      completed_at: null,
      source_page: item.source_page,
      source_excerpt: item.source_excerpt,
      uncertain: item.uncertain,
      uncertainty_note: item.uncertainty_note,
    };
  };

  const tasks: RecoveryTask[] = [
    ...extraction.wound_care.map((w) => toTask("wound_care", "wound_care", w, w.frequency)),
    ...extraction.activity_instructions.map((a) => toTask("activity_instructions", "activity", a, a.duration)),
    ...extraction.diet_instructions.map((d) => toTask("diet_instructions", "diet", d, null)),
  ];

  const follow_ups: FollowUp[] = extraction.follow_ups.map((f) => {
    const id = ctx.newId();
    idMap.follow_ups.push(id);
    return {
      ...base,
      id,
      specialty: f.specialty,
      clinician: f.clinician,
      scheduled_date: f.date,
      scheduled_time: f.time,
      investigation: f.investigation,
      preparation_instructions: f.preparation,
      status: "upcoming",
      patient_reschedule_date: null,
      patient_note: null,
      source_page: f.source_page,
      source_excerpt: f.source_excerpt,
      uncertain: f.uncertain,
      uncertainty_note: f.uncertainty_note,
    };
  });

  const warning_signs: WarningSign[] = extraction.warning_signs.map((w) => {
    const id = ctx.newId();
    idMap.warning_signs.push(id);
    return { ...base, ...w, id };
  });

  // Encounter
  const plan: CarePlan = {
    ...bundle.plan,
    encounter_evidence: { ...bundle.plan.encounter_evidence },
    status: "active",
    updated_at: ctx.now,
  };
  const encounterFlags: ReviewFlag[] = [];
  for (const key of ENCOUNTER_KEYS) {
    const field = extraction.encounter[key];
    if (!field) continue;
    const current = plan[key as EncounterKey];
    const evidence = plan.encounter_evidence[key];
    const sameDocument = evidence?.document_id === documentId;
    if (current === null || sameDocument || evidence === undefined) {
      (plan as Record<EncounterKey, string | null>)[key] = field.value;
      plan.encounter_evidence[key] = {
        document_id: documentId,
        source_page: field.source_page,
        source_excerpt: field.source_excerpt,
        verification_status: "needs_review",
        uncertain: field.uncertain,
        patient_edited: false,
      };
    } else if (!sameClinicalText(current, field.value)) {
      encounterFlags.push({
        id: ctx.newId(),
        care_plan_id: planId,
        document_id: documentId,
        kind: "conflict",
        category: key.endsWith("date") ? "date" : "instruction",
        description: `Your documents disagree about the ${key.replace("_", " ")}: "${current}" versus "${field.value}". The first value is shown until your care team confirms which is correct.`,
        related_ids: [`encounter:${key}`],
        excerpts: [evidence?.source_excerpt, field.source_excerpt].filter((e): e is string => !!e),
        origin: "rule",
        rule_key: null,
        status: "open",
        patient_note: null,
        created_at: ctx.now,
        updated_at: ctx.now,
      });
    }
  }

  const flag = (f: Omit<ReviewFlag, "id" | "care_plan_id" | "document_id" | "status" | "patient_note" | "created_at" | "updated_at" | "rule_key">): ReviewFlag => ({
    ...f,
    id: ctx.newId(),
    care_plan_id: planId,
    document_id: documentId,
    rule_key: null,
    status: "open",
    patient_note: null,
    created_at: ctx.now,
    updated_at: ctx.now,
  });

  const issueFlags = issues.map((issue) => {
    let related: string[] = [];
    if (issue.ref?.section === "encounter" && issue.ref.key) related = [`encounter:${issue.ref.key}`];
    else if (issue.ref) related = [idMap[issue.ref.section][issue.ref.index]].filter(Boolean);
    return flag({
      kind: "uncertainty",
      category: issue.category === "ambiguous" ? "ambiguous" : issue.category === "missing_information" ? "missing_information" : issue.category,
      description: issue.description,
      related_ids: related,
      excerpts: issue.excerpt ? [issue.excerpt] : [],
      origin: "rule",
    });
  });

  const aiFlags = [
    ...extraction.uncertainties.map((u) =>
      flag({
        kind: "uncertainty",
        category: u.category,
        description: u.description,
        related_ids: [],
        excerpts: u.source_excerpt ? [u.source_excerpt] : [],
        origin: "ai",
      }),
    ),
    ...extraction.conflicts.map((c) =>
      flag({
        kind: "conflict",
        category: c.category,
        description: c.description,
        related_ids: [],
        excerpts: c.excerpts,
        origin: "ai",
      }),
    ),
  ];

  const documents = bundle.documents.map((d) =>
    d.id === documentId
      ? {
          ...d,
          document_type: d.classification_source === "patient" ? d.document_type : extraction.document_type,
          classification_source: d.classification_source === "patient" ? d.classification_source : ("ai" as const),
          processing_status: "ready_for_review" as const,
          processing_error: null,
          updated_at: ctx.now,
        }
      : d,
  );

  const merged: PlanBundle = {
    ...bundle,
    plan,
    documents,
    medications: [...fromOtherDocs(bundle.medications), ...medications],
    tasks: [...fromOtherDocs(bundle.tasks), ...tasks],
    follow_ups: [...fromOtherDocs(bundle.follow_ups), ...follow_ups],
    warning_signs: [...fromOtherDocs(bundle.warning_signs), ...warning_signs],
    flags: [
      // Rule-managed flags are recomputed below; document-scoped flags from a previous run are replaced.
      ...bundle.flags.filter((f) => f.document_id !== documentId || f.rule_key !== null),
      ...encounterFlags,
      ...issueFlags,
      ...aiFlags,
    ],
  };

  return detectConflicts(merged, ctx);
}

/** Removes a document and everything extracted from it. Corrections are kept as an audit trail. */
export function removeDocument(bundle: PlanBundle, documentId: string, ctx: DomainContext): PlanBundle {
  const keep = <T extends { document_id: string | null }>(items: T[]) => items.filter((i) => i.document_id !== documentId);
  const encounter_evidence = Object.fromEntries(
    Object.entries(bundle.plan.encounter_evidence).filter(([, ev]) => ev.document_id !== documentId),
  );
  const plan = { ...bundle.plan, encounter_evidence, updated_at: ctx.now };
  for (const key of ENCOUNTER_KEYS) {
    if (!(key in encounter_evidence) && bundle.plan.encounter_evidence[key]?.document_id === documentId) {
      (plan as Record<EncounterKey, string | null>)[key] = null;
    }
  }
  return detectConflicts(
    {
      ...bundle,
      plan,
      documents: bundle.documents.filter((d) => d.id !== documentId),
      medications: keep(bundle.medications),
      tasks: keep(bundle.tasks),
      follow_ups: keep(bundle.follow_ups),
      warning_signs: keep(bundle.warning_signs),
      flags: keep(bundle.flags),
    },
    ctx,
  );
}
