import type { DocumentRecord, PlanBundle } from "@/schemas/domain";
import type { DomainContext } from "./context";

export const DEFAULT_PLAN_TITLE = "My recovery plan";

export function createEmptyBundle(planId: string, title: string | undefined, ctx: DomainContext): PlanBundle {
  return {
    plan: {
      id: planId,
      title: title?.trim() || DEFAULT_PLAN_TITLE,
      diagnosis: null,
      procedure: null,
      admission_date: null,
      discharge_date: null,
      facility: null,
      clinician: null,
      encounter_evidence: {},
      status: "draft",
      is_sample: false,
      created_at: ctx.now,
      updated_at: ctx.now,
    },
    documents: [],
    medications: [],
    tasks: [],
    follow_ups: [],
    warning_signs: [],
    flags: [],
    corrections: [],
  };
}

export function updateDocument(bundle: PlanBundle, id: string, patch: Partial<DocumentRecord>, now: string): PlanBundle {
  return {
    ...bundle,
    documents: bundle.documents.map((d) => (d.id === id ? { ...d, ...patch, updated_at: now } : d)),
  };
}
