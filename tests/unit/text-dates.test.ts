import { describe, expect, it } from "vitest";
import { addDaysIso, formatDateOnly, isValidIsoDate, isValidTime } from "@/lib/domain/dates";
import { canonicalFrequency, missingNumbers, normalizeMedicationName, numericTokens, valueSupportedByExcerpt, valuesDisagree } from "@/lib/domain/text";

describe("numbers", () => {
  it("extracts digits, decimals, thousands and spelled-out numbers", () => {
    expect(numericTokens("Take 2 tablets of 0.5 mg, max 1,000 mg, twice")).toEqual(expect.arrayContaining(["2", "0.5", "1000"]));
    expect(numericTokens("take two tablets")).toContain("2");
  });

  it("reads Urdu digits as numbers", () => {
    expect(numericTokens("۵۰۰ ملی گرام")).toContain("500");
    expect(missingNumbers("500 mg every 6 hours", "۵۰۰ mg ہر 6 گھنٹے")).toEqual([]);
  });

  it("detects numbers dropped by a rewrite", () => {
    expect(missingNumbers("Do not lift more than 5 kg for 4 weeks", "Avoid heavy lifting for a while")).toEqual(["5", "4"]);
  });

  it("only supports values whose numbers appear in the excerpt", () => {
    expect(valueSupportedByExcerpt("500 mg", "Paracetamol 500 mg tablets")).toBe(true);
    expect(valueSupportedByExcerpt("1000 mg", "Paracetamol 500 mg tablets")).toBe(false);
    expect(valueSupportedByExcerpt("Twice daily", "BD")).toBe(true);
    expect(valueSupportedByExcerpt("5 days", null)).toBe(false);
    expect(valueSupportedByExcerpt(null, null)).toBe(true);
  });
});

describe("medication comparison", () => {
  it("normalizes names by removing forms and strengths", () => {
    expect(normalizeMedicationName("Tab. Paracetamol 500mg")).toBe("paracetamol");
  });

  it("canonicalizes common frequency wording", () => {
    expect(canonicalFrequency("BD")).toBe("2/day");
    expect(canonicalFrequency("twice a day")).toBe("2/day");
    expect(canonicalFrequency("Three times daily")).toBe("3/day");
    expect(canonicalFrequency("every 6 hours when required")).toBe("q6h");
    expect(canonicalFrequency("q8h")).toBe("q8h");
    expect(canonicalFrequency("as directed")).toBeNull();
  });

  it("treats equivalent wording as agreement and real differences as disagreement", () => {
    expect(valuesDisagree("route", "By mouth", "Orally")).toBe(false);
    expect(valuesDisagree("frequency", "Every 6 hours when required for pain", "Every 6 hours as needed for pain")).toBe(false);
    expect(valuesDisagree("frequency", "Twice a day", "Three times daily")).toBe(true);
    expect(valuesDisagree("strength", "500 mg", "500mg")).toBe(false);
    expect(valuesDisagree("duration", "5 days", "7 days")).toBe(true);
  });
});

describe("date-only handling", () => {
  it("validates real calendar dates only", () => {
    expect(isValidIsoDate("2026-11-22")).toBe(true);
    expect(isValidIsoDate("2026-02-29")).toBe(false);
    expect(isValidIsoDate("2028-02-29")).toBe(true);
    expect(isValidIsoDate("22/11/2026")).toBe(false);
    expect(isValidTime("10:30")).toBe(true);
    expect(isValidTime("24:00")).toBe(false);
  });

  it("formats a date without a time component or time-zone shift", () => {
    expect(formatDateOnly("2026-11-22")).toBe("22 Nov 2026");
    expect(formatDateOnly(null)).toBe("Date not stated");
  });

  it("adds days across month boundaries", () => {
    expect(addDaysIso("2026-11-25", 12)).toBe("2026-12-07");
  });
});
