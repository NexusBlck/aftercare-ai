/**
 * Conservative keyword screen for messages patients send to their care team. A match never
 * diagnoses or reassures: it only (1) shows emergency guidance immediately and (2) marks the
 * question so staff see it first. A non-match does not mean a message is safe.
 *
 * GOVERNANCE: this list and the emergency wording are placeholders pending review by the pilot
 * clinic's clinical safety lead (see CLINICAL_SAFETY.md). Do not treat them as clinically approved.
 */

const PATTERNS: RegExp[] = [
  /chest (pain|tightness|pressure)/i,
  /(can'?t|cannot|unable to|hard to|difficulty|trouble) breath/i,
  /short(ness)? of breath|breathless/i,
  /(heavy|severe|uncontrolled|won'?t stop|wont stop|a lot of) bleed/i,
  /bleeding (heavily|a lot|won'?t stop)/i,
  /(faint|fainted|passed out|unconscious|collapse)/i,
  /seizure|fit(s)? |convuls/i,
  /(confus|slurred speech|face drooping|weakness on one side|stroke)/i,
  /(fever|temperature).{0,20}(39|40|41|high)/i,
  /(severe|unbearable|worst) pain/i,
  /suicid|kill myself|end my life|self[- ]harm/i,
  /allergic reaction|swelling of (the )?(face|lips|tongue|throat)|anaphyla/i,
  /(pus|foul smell).{0,30}(wound|stitches|incision)|wound.{0,30}(pus|opened|open up|red and hot)/i,
  /vomiting blood|blood in (my )?(vomit|stool|urine)|black stool/i,
  /calf (pain|swelling)|leg (swollen|swelling) and (pain|red)/i,
  // Common Urdu / Roman Urdu phrases.
  /seene (mein|me) dard|saans (nahi|lene mein)|khoon (beh|nahi ruk)|behosh/i,
  /سینے میں درد|سانس|خون|بے ہوش/,
];

export function hasUrgentKeywords(text: string): boolean {
  return PATTERNS.some((p) => p.test(text));
}

/**
 * Default emergency pathway for Pakistan, shown alongside the clinic's own instructions.
 * Rescue 1122 operates in most provinces; 115 is the Edhi ambulance service.
 */
export const DEFAULT_EMERGENCY_GUIDANCE =
  "If you think this could be an emergency, do not wait for a reply. Call Rescue 1122 or Edhi 115, or go to the nearest emergency department now.";
