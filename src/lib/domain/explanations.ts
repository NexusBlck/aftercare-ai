import type { Medication, PlainLanguage, PlanBundle } from "@/schemas/domain";
import type { ExplanationResponse } from "@/schemas/extraction";
import { missingNumbers } from "./text";

export interface ExplainableItem {
  id: string;
  text: string;
}

export function medicationText(m: Medication): string {
  return [
    m.name,
    m.strength,
    m.dose && `dose: ${m.dose}`,
    m.route && `route: ${m.route}`,
    m.frequency && `frequency: ${m.frequency}`,
    m.timing && `timing: ${m.timing}`,
    m.duration && `duration: ${m.duration}`,
    m.special_instructions && `note: ${m.special_instructions}`,
  ]
    .filter(Boolean)
    .join("; ");
}

/** Items (optionally from one document) whose original wording will be simplified. */
export function collectExplainable(bundle: PlanBundle, documentId?: string): ExplainableItem[] {
  const match = (d: string | null) => documentId === undefined || d === documentId;
  return [
    ...bundle.medications.filter((m) => match(m.document_id)).map((m) => ({ id: m.id, text: medicationText(m) })),
    ...bundle.tasks
      .filter((t) => match(t.document_id))
      .map((t) => ({ id: t.id, text: [t.instruction, t.schedule_description].filter(Boolean).join(" — ") })),
    ...bundle.warning_signs
      .filter((w) => match(w.document_id))
      .map((w) => ({ id: w.id, text: [w.sign, w.action].filter(Boolean).join(" — ") })),
    ...bundle.follow_ups
      .filter((f) => match(f.document_id) && f.preparation_instructions)
      .map((f) => ({ id: f.id, text: f.preparation_instructions as string })),
  ];
}

/**
 * Accepts an explanation only if every number in the original survives in the rewrite.
 * A rejected English explanation is discarded entirely; a failing Urdu translation is dropped
 * while the English one is kept.
 */
export function checkExplanation(original: string, plainEn: string, plainUr: string | null): PlainLanguage {
  if (missingNumbers(original, plainEn).length > 0) {
    return { en: null, ur: null, status: "rejected" };
  }
  const ur = plainUr && missingNumbers(original, plainUr).length === 0 ? plainUr : null;
  return { en: plainEn, ur, status: "generated" };
}

export function applyExplanations(
  bundle: PlanBundle,
  items: ExplainableItem[],
  response: ExplanationResponse,
): PlanBundle {
  const originals = new Map(items.map((i) => [i.id, i.text]));
  const results = new Map<string, PlainLanguage>();
  for (const r of response.items) {
    const original = originals.get(r.id);
    if (original === undefined) continue; // the model returned an ID we did not send
    results.set(r.id, checkExplanation(original, r.plain_en, r.plain_ur));
  }
  const apply = <T extends { id: string; plain_language: PlainLanguage | null }>(list: T[]): T[] =>
    list.map((x) => (results.has(x.id) ? { ...x, plain_language: results.get(x.id) ?? null } : x));
  return {
    ...bundle,
    medications: apply(bundle.medications),
    tasks: apply(bundle.tasks),
    warning_signs: apply(bundle.warning_signs),
    follow_ups: apply(bundle.follow_ups),
  };
}
