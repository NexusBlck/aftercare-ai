const NUMBER_WORDS: Record<string, string> = {
  zero: "0",
  one: "1",
  two: "2",
  three: "3",
  four: "4",
  five: "5",
  six: "6",
  seven: "7",
  eight: "8",
  nine: "9",
  ten: "10",
  eleven: "11",
  twelve: "12",
  fourteen: "14",
  twenty: "20",
  thirty: "30",
  half: "0.5",
};

const URDU_DIGITS = "۰۱۲۳۴۵۶۷۸۹";
const ARABIC_DIGITS = "٠١٢٣٤٥٦٧٨٩";

/** Converts Urdu/Arabic-Indic digits to ASCII so numbers can be compared across languages. */
export function toAsciiDigits(text: string): string {
  return text.replace(/[۰-۹٠-٩]/g, (ch) => {
    const urdu = URDU_DIGITS.indexOf(ch);
    if (urdu >= 0) return String(urdu);
    return String(ARABIC_DIGITS.indexOf(ch));
  });
}

/** Extracts numeric tokens ("500", "0.5", "1,000" → "1000"), including spelled-out small numbers. */
export function numericTokens(text: string | null | undefined): string[] {
  if (!text) return [];
  const ascii = toAsciiDigits(text).toLowerCase();
  const tokens = new Set<string>();
  for (const match of ascii.matchAll(/\d+(?:[.,]\d+)*/g)) {
    tokens.add(normalizeNumber(match[0]));
  }
  for (const word of ascii.split(/[^a-z]+/)) {
    const value = NUMBER_WORDS[word];
    if (value) tokens.add(value);
  }
  return [...tokens];
}

function normalizeNumber(raw: string): string {
  // "1,000" → "1000"; "2,5" (decimal comma) → "2.5"
  let value = raw;
  if (/^\d{1,3}(,\d{3})+$/.test(value)) value = value.replace(/,/g, "");
  else value = value.replace(",", ".");
  const n = Number(value);
  return Number.isFinite(n) ? String(n) : value;
}

/**
 * True when every number in `value` also appears in `excerpt`.
 * Used to catch values the model may have invented (e.g. a dose that is not in the source text).
 */
export function valueSupportedByExcerpt(value: string | null, excerpt: string | null): boolean {
  if (value === null || value.trim() === "") return true;
  const needed = numericTokens(value);
  if (needed.length === 0) return true;
  if (!excerpt) return false;
  const available = new Set(numericTokens(excerpt));
  return needed.every((token) => available.has(token));
}

/** Returns numbers present in `original` that are missing from `rewritten`. */
export function missingNumbers(original: string, rewritten: string): string[] {
  const available = new Set(numericTokens(rewritten));
  return numericTokens(original).filter((token) => !available.has(token));
}

/** Normalizes a medication name for comparison: lowercase, strip strengths/punctuation/forms. */
export function normalizeMedicationName(name: string): string {
  return name
    .toLowerCase()
    .replace(/\b(tab|tabs|tablet|tablets|cap|caps|capsule|capsules|syrup|inj|injection|susp|suspension)\b\.?/g, " ")
    .replace(/\d+(\.\d+)?\s*(mg|mcg|g|ml|iu|%)/g, " ")
    .replace(/[^a-z\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** Loose equality for clinical strings: case, whitespace and trailing punctuation are ignored. */
export function sameClinicalText(a: string | null, b: string | null): boolean {
  const norm = (s: string | null) => (s ?? "").toLowerCase().replace(/\s+/g, " ").replace(/[.;,]+$/g, "").trim();
  return norm(a) === norm(b);
}

/**
 * Canonical form of a documented frequency ("BD", "twice daily" → "2/day"; "every 6 hours" → "q6h").
 * Returns null when the wording is not recognised; callers then fall back to comparing numbers.
 */
export function canonicalFrequency(text: string | null): string | null {
  if (!text) return null;
  const t = ` ${text.toLowerCase().replace(/[^a-z0-9 ]/g, " ").replace(/\s+/g, " ")} `;
  const every = /every (\d+) (hours|hour|hrs|hr|h)\b/.exec(t) ?? /\bq ?(\d+) ?h\b/.exec(t);
  if (every) return `q${Number(every[1])}h`;
  const perDay: Array<[RegExp, string]> = [
    [/ (four times|4 times|qds|qid) /, "4/day"],
    [/ (three times|3 times|thrice|tds|tid) /, "3/day"],
    [/ (twice|two times|2 times|bd|bid) /, "2/day"],
    [/ (once a day|once daily|one time|1 time|od|daily|every day|once) /, "1/day"],
  ];
  for (const [re, value] of perDay) if (re.test(t)) return value;
  return null;
}

export function canonicalRoute(text: string | null): string | null {
  if (!text) return null;
  const t = text.toLowerCase().trim();
  if (/^(by mouth|orally|oral|po|p\.o\.|mouth)$/.test(t)) return "oral";
  return t;
}

/** True when two documented values for the same field genuinely disagree. */
export function valuesDisagree(field: "strength" | "dose" | "route" | "frequency" | "duration", a: string, b: string): boolean {
  if (sameClinicalText(a, b)) return false;
  if (field === "route") return canonicalRoute(a) !== canonicalRoute(b);
  if (field === "frequency") {
    const [ca, cb] = [canonicalFrequency(a), canonicalFrequency(b)];
    if (ca && cb) return ca !== cb;
  }
  const [na, nb] = [numericTokens(a).sort().join(","), numericTokens(b).sort().join(",")];
  return na !== nb;
}

export function nameAppearsInExcerpt(name: string, excerpt: string | null): boolean {
  if (!excerpt) return false;
  const words = normalizeMedicationName(name).split(" ").filter((w) => w.length >= 3);
  if (words.length === 0) return true;
  const hay = excerpt.toLowerCase();
  return words.some((w) => hay.includes(w));
}

export function truncate(text: string, max: number): string {
  return text.length <= max ? text : `${text.slice(0, max - 1).trimEnd()}…`;
}
