import { describe, expect, it } from "vitest";
import { buildSyntheticDocuments, type FixtureKey } from "@/lib/demo/synthetic-documents";
import { sanitizeExtraction } from "@/lib/domain/sanitize";
import { wordsMissingFromExcerpt } from "@/lib/domain/text";
import type { Extraction } from "@/schemas/extraction";

/** AUD-05: model commentary written into a medication field must not reach review as if transcribed. */

const docs = buildSyntheticDocuments();
const base = () => structuredClone(docs["clear-discharge-summary"].extraction as Extraction);

describe("medication wording must come from the document", () => {
  it("removes and flags model commentary (observed live from a small free model)", () => {
    const x = base();
    const amox = x.medications.findIndex((m) => /amoxicillin/i.test(m.name));
    x.medications[amox].frequency = 'twice a probably need "twice a day"? Actually text: "twice a day" so we use that. Let\'s correct: frequency "twice a day".';
    const { extraction, issues } = sanitizeExtraction(x);
    expect(extraction.medications[amox].frequency).toBeNull();
    expect(extraction.medications[amox].uncertain).toBe(true);
    expect(issues.some((i) => i.category === "unsupported_value" && /wording that is not in the supporting text/.test(i.description))).toBe(true);
  });

  it("keeps faithful transcriptions and small paraphrases untouched", () => {
    expect(wordsMissingFromExcerpt("by mouth", "take 1 tablet by mouth twice a day")).toEqual([]);
    expect(wordsMissingFromExcerpt("orally", "take 1 tablet by mouth twice a day")).toEqual([]); // common dosing word
    expect(wordsMissingFromExcerpt("twice daily with meals", "1 tablet twice a day with meals")).toEqual([]);
    for (const key of ["clear-discharge-summary", "prescription-missing-duration", "prompt-injection"] as FixtureKey[]) {
      const x = docs[key].extraction as Extraction;
      const { issues } = sanitizeExtraction(structuredClone(x));
      expect(issues.filter((i) => /wording that is not/.test(i.description)), key).toEqual([]);
    }
  });

  it("an invented instruction (not in the excerpt) is removed from special instructions", () => {
    const x = base();
    x.medications[0].special_instructions = "Increase to four tablets nightly if pain persists beyond tomorrow";
    const { extraction } = sanitizeExtraction(x);
    expect(extraction.medications[0].special_instructions).toBeNull();
  });
});
