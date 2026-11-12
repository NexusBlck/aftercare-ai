import { describe, expect, it } from "vitest";
import { dateSupportedByExcerpt, sanitizeExtraction } from "@/lib/domain/sanitize";
import { emptyExtraction, extractionOf } from "./helpers";

const med = (over: Record<string, unknown> = {}) => ({
  name: "Amoxicillin",
  brand_name: null,
  generic_name: null,
  strength: "500 mg",
  dose: "1 capsule",
  route: "By mouth",
  frequency: "Three times a day",
  timing: null,
  duration: null,
  special_instructions: null,
  source_page: 1,
  source_excerpt: "Amoxicillin 500 mg: 1 capsule by mouth three times a day.",
  uncertain: false,
  uncertainty_note: null,
  ...over,
});

describe("sanitizeExtraction", () => {
  it("leaves a clean synthetic discharge summary unchanged and raises no issues", () => {
    const input = extractionOf("clear-discharge-summary");
    const { extraction, issues } = sanitizeExtraction(input);
    expect(issues).toEqual([]);
    expect(extraction.medications.map((m) => m.dose)).toEqual(["2 tablets", "1 tablet", "1 tablet"]);
  });

  it("keeps missing medication fields null — never filled in", () => {
    const { extraction } = sanitizeExtraction(emptyExtraction({ medications: [med()] }));
    expect(extraction.medications[0].duration).toBeNull();
    expect(extraction.medications[0].timing).toBeNull();
  });

  it("removes a dose whose numbers are not in the supporting excerpt and flags it", () => {
    const { extraction, issues } = sanitizeExtraction(emptyExtraction({ medications: [med({ strength: "875 mg" })] }));
    expect(extraction.medications[0].strength).toBeNull();
    expect(extraction.medications[0].uncertain).toBe(true);
    expect(issues).toContainEqual(expect.objectContaining({ category: "unsupported_value", ref: { section: "medications", index: 0 } }));
  });

  it("flags a duration the model invented", () => {
    const { extraction, issues } = sanitizeExtraction(emptyExtraction({ medications: [med({ duration: "7 days" })] }));
    expect(extraction.medications[0].duration).toBeNull();
    expect(issues.some((i) => i.description.includes("duration"))).toBe(true);
  });

  it("accepts spelled-out numbers in the excerpt", () => {
    const { extraction, issues } = sanitizeExtraction(
      emptyExtraction({ medications: [med({ dose: "2 tablets", source_excerpt: "Amoxicillin 500 mg, two tablets three times a day" })] }),
    );
    expect(extraction.medications[0].dose).toBe("2 tablets");
    expect(issues).toEqual([]);
  });

  it("flags a medication name that does not appear in its excerpt", () => {
    const { issues } = sanitizeExtraction(emptyExtraction({ medications: [med({ name: "Oxycodone" })] }));
    expect(issues.some((i) => i.description.includes("Oxycodone"))).toBe(true);
  });

  it("flags items with no supporting excerpt", () => {
    const { extraction, issues } = sanitizeExtraction(
      emptyExtraction({ warning_signs: [{ sign: "Fever", action: null, source_page: null, source_excerpt: null, uncertain: false, uncertainty_note: null }] }),
    );
    expect(extraction.warning_signs[0].uncertain).toBe(true);
    expect(issues[0].category).toBe("missing_evidence");
  });

  it("drops incomplete or unverifiable follow-up dates and records the gap", () => {
    const base = { time: null, specialty: "Surgery", clinician: null, investigation: null, preparation: null, source_page: 1, uncertain: false, uncertainty_note: null };
    const { extraction, issues } = sanitizeExtraction(
      emptyExtraction({
        follow_ups: [
          { ...base, date: "2026-11", source_excerpt: "Clinic in November" },
          // Year was not written in the document — the model must not supply it.
          { ...base, date: "2026-11-18", source_excerpt: "Clinic on 18 November" },
          { ...base, date: "2026-11-18", time: "25:99", source_excerpt: "Clinic on 18 November 2026" },
        ],
      }),
    );
    expect(extraction.follow_ups[0].date).toBeNull();
    expect(extraction.follow_ups[1].date).toBeNull();
    expect(extraction.follow_ups[2].date).toBe("2026-11-18");
    expect(extraction.follow_ups[2].time).toBeNull();
    expect(issues.filter((i) => i.category === "missing_information")).toHaveLength(2);
  });

  it("nulls invalid encounter dates instead of guessing", () => {
    const { extraction, issues } = sanitizeExtraction(
      emptyExtraction({
        encounter: {
          ...emptyExtraction().encounter,
          discharge_date: { value: "2026-02-30", source_page: 1, source_excerpt: "Discharged 30 Feb 2026", uncertain: false, uncertainty_note: null },
        },
      }),
    );
    expect(extraction.encounter.discharge_date).toBeNull();
    expect(issues[0].category).toBe("ambiguous");
  });

  it("reports embedded instructions and documents without clinical content", () => {
    expect(sanitizeExtraction(extractionOf("prompt-injection")).issues.some((i) => i.description.includes("instructions aimed at software"))).toBe(true);
    expect(sanitizeExtraction(extractionOf("no-clinical-content")).issues.some((i) => i.category === "missing_information")).toBe(true);
  });

  it("drops empty-string items and trims whitespace", () => {
    const { extraction } = sanitizeExtraction(
      emptyExtraction({
        diet_instructions: [
          { kind: "diet", instruction: "   ", source_page: 1, source_excerpt: "x", uncertain: false, uncertainty_note: null },
          { kind: "fluid", instruction: "  Drink   fluids ", source_page: 1, source_excerpt: "Drink fluids", uncertain: false, uncertainty_note: null },
        ],
      }),
    );
    expect(extraction.diet_instructions).toHaveLength(1);
    expect(extraction.diet_instructions[0].instruction).toBe("Drink fluids");
  });
});

describe("dateSupportedByExcerpt", () => {
  it("matches day and year across formats", () => {
    expect(dateSupportedByExcerpt("2026-11-22", "on 22 November 2026 at 10:30")).toBe(true);
    expect(dateSupportedByExcerpt("2026-11-22", "Review 22/11/26")).toBe(true);
    expect(dateSupportedByExcerpt("2026-11-22", "Review 23 November 2026")).toBe(false);
    expect(dateSupportedByExcerpt("2026-11-22", null)).toBe(false);
  });
});
