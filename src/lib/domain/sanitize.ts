import type { Extraction } from "@/schemas/extraction";
import { ENCOUNTER_KEYS } from "@/schemas/extraction";
import { isValidIsoDate, isValidTime } from "./dates";
import { nameAppearsInExcerpt, numericTokens, valueSupportedByExcerpt, wordsMissingFromExcerpt } from "./text";

/**
 * Deterministic safety pass applied to every validated model response before it is stored.
 * It never fills in information; it only removes values it cannot trust and records why.
 */

export type SectionKey =
  | "medications"
  | "wound_care"
  | "activity_instructions"
  | "diet_instructions"
  | "follow_ups"
  | "warning_signs"
  | "encounter";

export interface SanitizerIssue {
  category: "missing_evidence" | "unsupported_value" | "ambiguous" | "missing_information" | "other";
  description: string;
  excerpt: string | null;
  page: number | null;
  ref: { section: SectionKey; index: number; key?: string } | null;
}

export interface SanitizeResult {
  extraction: Extraction;
  issues: SanitizerIssue[];
}

type Evidence = {
  source_page: number | null;
  source_excerpt: string | null;
  uncertain: boolean;
  uncertainty_note: string | null;
};

function clean(value: string | null): string | null {
  if (value === null) return null;
  const trimmed = value.replace(/\s+/g, " ").trim();
  return trimmed === "" ? null : trimmed;
}

function cleanStrings<T extends Record<string, unknown>>(obj: T): T {
  const out: Record<string, unknown> = { ...obj };
  for (const [key, value] of Object.entries(out)) {
    if (typeof value === "string") out[key] = clean(value) ?? (key === "name" || key === "instruction" || key === "sign" ? "" : null);
  }
  return out as T;
}

function markUncertain<T extends Evidence>(item: T, note: string): T {
  const existing = item.uncertainty_note ? `${item.uncertainty_note} ` : "";
  return { ...item, uncertain: true, uncertainty_note: `${existing}${note}`.trim() };
}

/** True when the day and year of an ISO date both appear in the excerpt (formats may differ). */
export function dateSupportedByExcerpt(iso: string, excerpt: string | null): boolean {
  if (!excerpt) return false;
  const tokens = new Set(numericTokens(excerpt));
  if (tokens.size === 0) return false;
  const [year, , day] = iso.split("-");
  // Month names are words, so only day + year are checked numerically. A year the document does
  // not state (e.g. "follow up on 18 November") must not be supplied by the model.
  const dayOk = tokens.has(String(Number(day)));
  const yearOk = tokens.has(year) || tokens.has(String(Number(year.slice(2))));
  return dayOk && yearOk;
}

const MED_NUMERIC_FIELDS = ["strength", "dose", "frequency", "timing", "duration"] as const;
/** Free-text dosing fields that must reuse the document's wording. */
const MED_TEXT_FIELDS = ["dose", "route", "frequency", "timing", "duration", "special_instructions"] as const;

export function sanitizeExtraction(input: Extraction): SanitizeResult {
  const issues: SanitizerIssue[] = [];
  const x: Extraction = structuredClone(input);

  const requireEvidence = <T extends Evidence>(item: T, section: SectionKey, index: number, label: string): T => {
    if (!item.source_excerpt) {
      issues.push({
        category: "missing_evidence",
        description: `No supporting text was returned for ${label}. Check it against the original document.`,
        excerpt: null,
        page: item.source_page,
        ref: { section, index },
      });
      return markUncertain(item, "No supporting excerpt.");
    }
    return item;
  };

  // Encounter
  for (const key of ENCOUNTER_KEYS) {
    let field = x.encounter[key];
    if (!field) continue;
    field = { ...field, value: clean(field.value) ?? "", source_excerpt: clean(field.source_excerpt) };
    if (field.value === "") {
      x.encounter[key] = null;
      continue;
    }
    if (key === "admission_date" || key === "discharge_date") {
      if (!isValidIsoDate(field.value)) {
        issues.push({
          category: "ambiguous",
          description: `The ${key.replace("_", " ")} "${field.value}" is not a complete calendar date, so it was not used.`,
          excerpt: field.source_excerpt,
          page: field.source_page,
          ref: null,
        });
        x.encounter[key] = null;
        continue;
      }
      if (!dateSupportedByExcerpt(field.value, field.source_excerpt)) {
        field = markUncertain(field, "Date could not be matched to the supporting text.");
        issues.push({
          category: "unsupported_value",
          description: `The ${key.replace("_", " ")} could not be matched to the supporting text.`,
          excerpt: field.source_excerpt,
          page: field.source_page,
          ref: { section: "encounter", index: 0, key },
        });
      }
    }
    x.encounter[key] = requireEvidence(field, "encounter", 0, `the ${key.replace("_", " ")}`);
  }

  // Medications
  x.medications = x.medications
    .map((m) => cleanStrings(m))
    .filter((m) => m.name !== "")
    .map((med, index) => {
      let m = requireEvidence(med, "medications", index, `the medication "${med.name}"`);
      if (m.source_excerpt && !nameAppearsInExcerpt(m.name, m.source_excerpt)) {
        m = markUncertain(m, "Medication name not found in the supporting text.");
        issues.push({
          category: "unsupported_value",
          description: `The medication name "${m.name}" could not be found in its supporting text.`,
          excerpt: m.source_excerpt,
          page: m.source_page,
          ref: { section: "medications", index },
        });
      }
      for (const field of MED_NUMERIC_FIELDS) {
        const value = m[field];
        if (value && m.source_excerpt && !valueSupportedByExcerpt(value, m.source_excerpt)) {
          issues.push({
            category: "unsupported_value",
            description: `The ${field} "${value}" for ${m.name} does not match the numbers in the supporting text. It has been removed — please check the original document.`,
            excerpt: m.source_excerpt,
            page: m.source_page,
            ref: { section: "medications", index },
          });
          m = markUncertain({ ...m, [field]: null }, `The ${field} could not be verified and was removed.`);
        }
      }
      for (const field of MED_TEXT_FIELDS) {
        const value = m[field];
        const unexplained = wordsMissingFromExcerpt(value, m.source_excerpt);
        if (value && unexplained.length >= 3) {
          issues.push({
            category: "unsupported_value",
            description: `The ${field} "${value}" for ${m.name} contains wording that is not in the supporting text. It has been removed — please check the original document.`,
            excerpt: m.source_excerpt,
            page: m.source_page,
            ref: { section: "medications", index },
          });
          m = markUncertain({ ...m, [field]: null }, `The ${field} did not match the document's wording and was removed.`);
        }
      }
      return m;
    });

  // Wound care / activity / diet
  x.wound_care = x.wound_care
    .map((w) => cleanStrings(w))
    .filter((w) => w.instruction !== "")
    .map((item, index) => {
      let w = requireEvidence(item, "wound_care", index, "a wound-care instruction");
      if (w.frequency && w.source_excerpt && !valueSupportedByExcerpt(w.frequency, w.source_excerpt)) {
        issues.push({
          category: "unsupported_value",
          description: `The dressing frequency "${w.frequency}" could not be matched to the supporting text and was removed.`,
          excerpt: w.source_excerpt,
          page: w.source_page,
          ref: { section: "wound_care", index },
        });
        w = markUncertain({ ...w, frequency: null }, "Frequency could not be verified and was removed.");
      }
      return w;
    });

  x.activity_instructions = x.activity_instructions
    .map((a) => cleanStrings(a))
    .filter((a) => a.instruction !== "")
    .map((item, index) => {
      let a = requireEvidence(item, "activity_instructions", index, "an activity instruction");
      if (a.duration && a.source_excerpt && !valueSupportedByExcerpt(a.duration, a.source_excerpt)) {
        issues.push({
          category: "unsupported_value",
          description: `The restriction duration "${a.duration}" could not be matched to the supporting text and was removed.`,
          excerpt: a.source_excerpt,
          page: a.source_page,
          ref: { section: "activity_instructions", index },
        });
        a = markUncertain({ ...a, duration: null }, "Duration could not be verified and was removed.");
      }
      return a;
    });

  x.diet_instructions = x.diet_instructions
    .map((d) => cleanStrings(d))
    .filter((d) => d.instruction !== "")
    .map((d, index) => requireEvidence(d, "diet_instructions", index, "a diet instruction"));

  // Follow-ups
  x.follow_ups = x.follow_ups
    .map((f) => cleanStrings(f))
    .map((item, index) => {
      let f = requireEvidence(item, "follow_ups", index, "a follow-up appointment");
      if (f.date !== null && !isValidIsoDate(f.date)) {
        issues.push({
          category: "ambiguous",
          description: `The follow-up date "${f.date}" is not a complete calendar date, so no date was set.`,
          excerpt: f.source_excerpt,
          page: f.source_page,
          ref: { section: "follow_ups", index },
        });
        f = markUncertain({ ...f, date: null }, "Date was incomplete.");
      } else if (f.date && !dateSupportedByExcerpt(f.date, f.source_excerpt)) {
        issues.push({
          category: "unsupported_value",
          description: `The follow-up date could not be matched to the supporting text and was removed.`,
          excerpt: f.source_excerpt,
          page: f.source_page,
          ref: { section: "follow_ups", index },
        });
        f = markUncertain({ ...f, date: null }, "Date could not be verified and was removed.");
      }
      if (f.time !== null && !isValidTime(f.time)) {
        f = markUncertain({ ...f, time: null }, "Time was unclear and was not used.");
      }
      if (f.date === null) {
        issues.push({
          category: "missing_information",
          description: `No date is documented for the ${f.specialty ?? "follow-up"} appointment.`,
          excerpt: f.source_excerpt,
          page: f.source_page,
          ref: { section: "follow_ups", index },
        });
      }
      return f;
    });

  x.warning_signs = x.warning_signs
    .map((w) => cleanStrings(w))
    .filter((w) => w.sign !== "")
    .map((w, index) => requireEvidence(w, "warning_signs", index, "a warning sign"));

  if (x.embedded_instructions_detected) {
    issues.push({
      category: "other",
      description:
        "This document contains text that looks like instructions aimed at software. AFTERCARE AI ignored it and treated it only as document content. Review this document carefully.",
      excerpt: null,
      page: null,
      ref: null,
    });
  }

  if (!x.has_clinical_content) {
    issues.push({
      category: "missing_information",
      description: "No recovery instructions were found in this document.",
      excerpt: null,
      page: null,
      ref: null,
    });
  }

  return { extraction: x, issues };
}
