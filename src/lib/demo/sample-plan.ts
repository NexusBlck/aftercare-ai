import type { DocumentRecord, PlainLanguage, PlanBundle } from "@/schemas/domain";
import { applyExtraction } from "@/lib/domain/apply-extraction";
import type { DomainContext } from "@/lib/domain/context";
import { addDaysIso, todayIso } from "@/lib/domain/dates";
import { createEmptyBundle } from "@/lib/domain/plan";
import { sanitizeExtraction } from "@/lib/domain/sanitize";
import { buildSyntheticDocuments, DEMO_DOCUMENT_KEYS } from "./synthetic-documents";

/**
 * Builds the SAMPLE plan shown in demo mode from the synthetic documents, using the same domain
 * functions as live processing. It is labelled everywhere as precomputed sample data.
 * Dates are anchored two days before "today" so the demo's upcoming appointment stays upcoming.
 */

/** Hand-written sample explanations, keyed by the item's original wording. */
const SAMPLE_PLAIN: Record<string, { en: string; ur: string }> = {
  Paracetamol: {
    en: "Paracetamol 500 mg: take 2 tablets by mouth every 6 hours, only when you need it for pain. Never take more than 8 tablets in 24 hours. Use for up to 5 days.",
    ur: "Paracetamol 500 mg: درد ہو تو ہر 6 گھنٹے بعد منہ کے ذریعے 2 گولیاں لیں۔ 24 گھنٹوں میں 8 سے زیادہ گولیاں ہرگز نہ لیں۔ زیادہ سے زیادہ 5 دن تک استعمال کریں۔",
  },
  Ibuprofen: {
    en: "Ibuprofen 400 mg: take 1 tablet by mouth three times a day, after eating, for 3 days.",
    ur: "Ibuprofen 400 mg: کھانے کے بعد دن میں تین بار منہ کے ذریعے 1 گولی لیں، 3 دن تک۔",
  },
  "Amoxicillin-clavulanate": {
    en: "Amoxicillin-clavulanate 625 mg (an antibiotic): 1 tablet by mouth. Your documents disagree on how often and for how long — check with your pharmacist or doctor.",
    ur: "Amoxicillin-clavulanate 625 mg (اینٹی بائیوٹک): منہ کے ذریعے 1 گولی۔ آپ کے کاغذات میں دن میں کتنی بار اور کتنے دن لینی ہے اس پر فرق ہے — اپنے فارماسسٹ یا ڈاکٹر سے تصدیق کریں۔",
  },
  "Keep the wounds clean and dry for 48 hours.": {
    en: "For the first 48 hours, keep your cuts clean and do not get them wet.",
    ur: "پہلے 48 گھنٹے اپنے زخم صاف رکھیں اور انہیں گیلا نہ ہونے دیں۔",
  },
  "You may shower after 48 hours. Pat the wounds dry with a clean towel.": {
    en: "After 48 hours you can shower. Gently pat the cuts dry with a clean towel — do not rub.",
    ur: "48 گھنٹے بعد آپ نہا سکتے ہیں۔ زخموں کو صاف تولیے سے آہستہ سے تھپتھپا کر خشک کریں — رگڑیں نہیں۔",
  },
  "Do not soak in a bath or swim for 2 weeks.": {
    en: "Do not sit in a bath or go swimming for 2 weeks.",
    ur: "2 ہفتے تک ٹب میں نہ بیٹھیں اور نہ ہی تیراکی کریں۔",
  },
  "Change the dressing if it becomes wet or soiled.": {
    en: "Put on a new dressing if the one you have gets wet or dirty.",
    ur: "اگر پٹی گیلی یا گندی ہو جائے تو نئی پٹی لگائیں۔",
  },
  "Walk several times a day.": {
    en: "Go for short walks several times each day.",
    ur: "دن میں کئی بار تھوڑی دیر چلیں۔",
  },
  "Do not lift anything heavier than 5 kg for 4 weeks.": {
    en: "For 4 weeks, do not lift anything heavier than 5 kg (about a full shopping bag).",
    ur: "4 ہفتے تک 5 kg سے زیادہ وزن نہ اٹھائیں۔",
  },
  "Do not drive until you can perform an emergency stop without pain.": {
    en: "Do not drive until you can press the brake hard and suddenly without pain.",
    ur: "جب تک آپ بغیر درد کے اچانک زور سے بریک نہ لگا سکیں، گاڑی نہ چلائیں۔",
  },
  "Resume your normal diet as tolerated.": {
    en: "You can go back to your usual food, as much as feels comfortable.",
    ur: "جتنا آرام دہ لگے، اپنی معمول کی خوراک دوبارہ شروع کر سکتے ہیں۔",
  },
  "Drink plenty of fluids.": {
    en: "Drink plenty of water and other fluids.",
    ur: "پانی اور دیگر مشروبات خوب پئیں۔",
  },
  "Remove the outer dressing after 48 hours.": {
    en: "Take off the outer dressing after 48 hours.",
    ur: "48 گھنٹے بعد اوپر والی پٹی اتار دیں۔",
  },
  "The small paper strips (Steri-Strips) will fall off on their own in 7 to 10 days. Do not pull them off.": {
    en: "The small paper strips on your cuts will fall off by themselves in 7 to 10 days. Do not pull them off.",
    ur: "زخموں پر لگی کاغذ کی چھوٹی پٹیاں 7 سے 10 دن میں خود اتر جائیں گی۔ انہیں کھینچ کر نہ اتاریں۔",
  },
  "Apply a new dry dressing as instructed by your nurse.": {
    en: "Put on a new dry dressing the way your nurse showed you. How often is not written — ask your nurse.",
    ur: "نرس کے بتائے ہوئے طریقے سے نئی خشک پٹی لگائیں۔ کتنی بار لگانی ہے یہ لکھا نہیں — اپنی نرس سے پوچھیں۔",
  },
  "Check your wounds daily for redness or discharge.": {
    en: "Look at your cuts every day for redness or any fluid coming out.",
    ur: "روزانہ اپنے زخموں کو دیکھیں کہ کہیں سرخی یا رطوبت تو نہیں۔",
  },
  "Fever above 38°C": {
    en: "A temperature higher than 38°C.",
    ur: "38°C سے زیادہ بخار۔",
  },
  "Increasing redness, swelling or discharge from a wound": {
    en: "A cut becoming more red or swollen, or fluid coming out of it.",
    ur: "زخم میں بڑھتی ہوئی سرخی، سوجن یا رطوبت کا نکلنا۔",
  },
  "Severe or worsening abdominal pain": {
    en: "Very bad stomach pain, or stomach pain that keeps getting worse.",
    ur: "پیٹ میں شدید درد یا ایسا درد جو بڑھتا جائے۔",
  },
  "Persistent vomiting": {
    en: "Vomiting that does not stop.",
    ur: "الٹیاں جو رک نہ رہی ہوں۔",
  },
  "Unable to pass urine": {
    en: "You cannot pee.",
    ur: "پیشاب نہ آنا۔",
  },
  "A wound opening, or bleeding that does not stop with gentle pressure": {
    en: "A cut that opens up, or bleeding that does not stop when you press gently on it.",
    ur: "زخم کا کھل جانا، یا ایسا خون بہنا جو ہلکا دبانے سے نہ رکے۔",
  },
};

const sample = (key: string): PlainLanguage | null => {
  const s = SAMPLE_PLAIN[key];
  return s ? { en: s.en, ur: s.ur, status: "sample" } : null;
};

export function buildSamplePlan(ctx: DomainContext, today: string = todayIso()): PlanBundle {
  const discharge = addDaysIso(today, -2);
  const docs = buildSyntheticDocuments(discharge);
  let bundle = createEmptyBundle(ctx.newId(), "Appendix surgery recovery (sample)", ctx);
  bundle = { ...bundle, plan: { ...bundle.plan, is_sample: true } };

  for (const key of DEMO_DOCUMENT_KEYS) {
    const doc = docs[key];
    if (!doc.extraction) continue;
    const record: DocumentRecord = {
      id: ctx.newId(),
      care_plan_id: bundle.plan.id,
      file_path: null,
      original_filename: doc.filename,
      mime_type: "application/pdf",
      file_size: doc.pages.join("\n").length,
      document_type: doc.documentType,
      classification_source: "sample",
      processing_status: "sample",
      processing_error: null,
      sample_text: doc.pages.join("\n\n— page break —\n\n"),
      created_at: ctx.now,
      updated_at: ctx.now,
    };
    bundle = { ...bundle, documents: [...bundle.documents, record] };
    const { extraction, issues } = sanitizeExtraction(doc.extraction);
    bundle = applyExtraction(bundle, { documentId: record.id, extraction, issues }, ctx);
    // applyExtraction marks processed documents ready_for_review; keep the sample label.
    bundle = {
      ...bundle,
      documents: bundle.documents.map((d) =>
        d.id === record.id ? { ...d, processing_status: "sample", classification_source: "sample" } : d,
      ),
    };
  }

  return {
    ...bundle,
    medications: bundle.medications.map((m) => ({ ...m, plain_language: sample(m.name) })),
    tasks: bundle.tasks.map((t) => ({ ...t, plain_language: sample(t.instruction) })),
    warning_signs: bundle.warning_signs.map((w) => ({ ...w, plain_language: sample(w.sign) })),
    flags: bundle.flags.map((f) => ({ ...f, origin: f.origin === "ai" ? "sample" : f.origin })),
  };
}
