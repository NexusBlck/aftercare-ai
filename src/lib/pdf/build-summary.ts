import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage, type RGB } from "pdf-lib";
import type { PlanBundle, VerificationStatus } from "@/schemas/domain";
import { formatDateOnly, formatTimestamp } from "@/lib/domain/dates";
import { buildDoctorQuestions } from "@/lib/domain/questions";
import { TASK_CATEGORY_LABEL, taskTitle } from "@/lib/domain/summary";

/**
 * Recovery summary PDF. Shared by the browser (demo mode) and GET /api/export/[id].
 * Unconfirmed and conflicting information is always labelled — never exported as confirmed.
 */

export const EXPORT_NOTICE =
  "This summary organizes information from documents provided by the patient. It is not a substitute for instructions from the treating healthcare professional. Confirm uncertain or conflicting information with your care team.";

const STATUS_LABEL: Record<VerificationStatus, string> = {
  needs_review: "NOT YET REVIEWED",
  confirmed_by_patient: "Confirmed by patient (not clinician-verified)",
  needs_clinician_clarification: "NEEDS CLINICIAN CLARIFICATION",
  conflicting: "CONFLICTING - DO NOT RELY ON THIS",
};

const NAVY = rgb(0.06, 0.11, 0.2);
const MUTED = rgb(0.36, 0.4, 0.47);
const TEAL = rgb(0.06, 0.46, 0.43);
const AMBER = rgb(0.67, 0.4, 0.02);
const RED = rgb(0.72, 0.11, 0.11);

const WIN_ANSI_EXTRA = "–—‘’“”•…€";

/** Standard PDF fonts only cover Windows-1252; anything else (e.g. Urdu) is replaced. */
export function toWinAnsi(text: string): string {
  return [...text]
    .map((ch) => {
      const code = ch.charCodeAt(0);
      if (ch === "\n") return " ";
      if ((code >= 0x20 && code <= 0x7e) || (code >= 0xa0 && code <= 0xff) || WIN_ANSI_EXTRA.includes(ch)) return ch;
      return "?";
    })
    .join("");
}

class Writer {
  private page!: PDFPage;
  private y = 0;
  private readonly width = 595.28;
  private readonly height = 841.89;
  private readonly margin = 48;

  constructor(
    private doc: PDFDocument,
    private font: PDFFont,
    private bold: PDFFont,
  ) {
    this.addPage();
  }

  private addPage() {
    this.page = this.doc.addPage([this.width, this.height]);
    this.y = this.height - this.margin;
  }

  private ensure(space: number) {
    if (this.y - space < this.margin + 20) this.addPage();
  }

  private wrap(text: string, font: PDFFont, size: number, maxWidth: number): string[] {
    const words = toWinAnsi(text).split(/\s+/).filter(Boolean);
    const lines: string[] = [];
    let line = "";
    for (const word of words) {
      const candidate = line ? `${line} ${word}` : word;
      if (font.widthOfTextAtSize(candidate, size) <= maxWidth) line = candidate;
      else {
        if (line) lines.push(line);
        // Hard-break very long tokens.
        let rest = word;
        while (font.widthOfTextAtSize(rest, size) > maxWidth && rest.length > 1) {
          let cut = rest.length - 1;
          while (cut > 1 && font.widthOfTextAtSize(rest.slice(0, cut), size) > maxWidth) cut--;
          lines.push(rest.slice(0, cut));
          rest = rest.slice(cut);
        }
        line = rest;
      }
    }
    if (line) lines.push(line);
    return lines.length ? lines : [""];
  }

  text(text: string, opts: { size?: number; bold?: boolean; color?: RGB; indent?: number; gap?: number } = {}) {
    const size = opts.size ?? 10;
    const font = opts.bold ? this.bold : this.font;
    const indent = opts.indent ?? 0;
    const lineHeight = size * 1.35;
    for (const line of this.wrap(text, font, size, this.width - this.margin * 2 - indent)) {
      this.ensure(lineHeight);
      this.page.drawText(line, { x: this.margin + indent, y: this.y - size, size, font, color: opts.color ?? NAVY });
      this.y -= lineHeight;
    }
    this.y -= opts.gap ?? 2;
  }

  heading(text: string) {
    this.ensure(40);
    this.y -= 10;
    this.text(text, { size: 13, bold: true, gap: 2 });
    this.page.drawLine({
      start: { x: this.margin, y: this.y },
      end: { x: this.width - this.margin, y: this.y },
      thickness: 0.6,
      color: rgb(0.85, 0.87, 0.9),
    });
    this.y -= 8;
  }

  box(text: string, color: RGB) {
    const size = 9.5;
    const lines = this.wrap(text, this.bold, size, this.width - this.margin * 2 - 20);
    const h = lines.length * size * 1.35 + 14;
    this.ensure(h + 6);
    this.page.drawRectangle({
      x: this.margin,
      y: this.y - h,
      width: this.width - this.margin * 2,
      height: h,
      borderColor: color,
      borderWidth: 1,
      color: rgb(1, 0.98, 0.94),
    });
    let y = this.y - 7 - size;
    for (const line of lines) {
      this.page.drawText(line, { x: this.margin + 10, y, size, font: this.bold, color });
      y -= size * 1.35;
    }
    this.y -= h + 8;
  }

  space(n = 6) {
    this.y -= n;
  }

  footer(label: string) {
    const pages = this.doc.getPages();
    pages.forEach((p, i) => {
      p.drawText(toWinAnsi(`${label}   ·   Page ${i + 1} of ${pages.length}`), {
        x: this.margin,
        y: 24,
        size: 7.5,
        font: this.font,
        color: MUTED,
      });
    });
  }
}

const statusColor = (s: VerificationStatus) =>
  s === "confirmed_by_patient" ? TEAL : s === "conflicting" ? RED : AMBER;

export async function buildSummaryPdf(bundle: PlanBundle, generatedAt: Date = new Date()): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  doc.setTitle(toWinAnsi(`AFTERCARE AI - ${bundle.plan.title}`));
  doc.setProducer("AFTERCARE AI");
  doc.setCreator("AFTERCARE AI");
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  const w = new Writer(doc, font, bold);
  const { plan } = bundle;
  const docName = new Map(bundle.documents.map((d) => [d.id, d.original_filename]));
  const source = (documentId: string | null, page: number | null) =>
    documentId ? `Source: ${docName.get(documentId) ?? "deleted document"}${page ? `, page ${page}` : ""}` : "Source: entered by patient";
  const missing = "Not stated in documents";

  w.text("AFTERCARE AI", { size: 9, bold: true, color: TEAL });
  w.text("Recovery summary", { size: 20, bold: true, gap: 4 });
  w.text(plan.title, { size: 12, bold: true, color: MUTED });
  w.text(`Generated ${formatTimestamp(generatedAt.toISOString())}`, { size: 9, color: MUTED, gap: 8 });
  if (plan.is_sample) w.box("SAMPLE DATA - synthetic documents for a fictional patient. Not a real medical record.", AMBER);
  w.box(EXPORT_NOTICE, NAVY);

  w.heading("Hospital stay (as documented)");
  const encounter: Array<[string, string | null, keyof typeof plan.encounter_evidence]> = [
    ["Diagnosis", plan.diagnosis, "diagnosis"],
    ["Procedure", plan.procedure, "procedure"],
    ["Admission date", plan.admission_date ? formatDateOnly(plan.admission_date) : null, "admission_date"],
    ["Discharge date", plan.discharge_date ? formatDateOnly(plan.discharge_date) : null, "discharge_date"],
    ["Facility", plan.facility, "facility"],
    ["Clinician", plan.clinician, "clinician"],
  ];
  for (const [label, value, key] of encounter) {
    const ev = plan.encounter_evidence[key];
    w.text(`${label}: ${value ?? missing}`, { bold: true, gap: 0 });
    if (value && ev) {
      w.text(`${STATUS_LABEL[ev.verification_status]}  ·  ${source(ev.document_id, ev.source_page)}`, {
        size: 8.5,
        color: statusColor(ev.verification_status),
        gap: 4,
      });
    } else w.space(3);
  }

  w.heading("Medications");
  if (bundle.medications.length === 0) w.text("No medications were found in the uploaded documents.", { color: MUTED });
  const confirmedMeds = bundle.medications.filter((m) => m.verification_status === "confirmed_by_patient");
  const otherMeds = bundle.medications.filter((m) => m.verification_status !== "confirmed_by_patient");
  const medBlock = (m: PlanBundle["medications"][number]) => {
    w.text(`${m.name}${m.strength ? ` ${m.strength}` : ""}`, { bold: true, size: 11, gap: 0 });
    w.text(
      [
        `Dose: ${m.dose ?? missing}`,
        `Route: ${m.route ?? missing}`,
        `Frequency: ${m.frequency ?? missing}`,
        `Timing: ${m.timing ?? missing}`,
        `Duration: ${m.duration ?? missing}`,
      ].join("   ·   "),
      { size: 9.5, indent: 10, gap: 0 },
    );
    if (m.special_instructions) w.text(`Instructions: ${m.special_instructions}`, { size: 9.5, indent: 10, gap: 0 });
    w.text(`${STATUS_LABEL[m.verification_status]}${m.patient_edited ? "  ·  Edited by patient" : ""}  ·  ${source(m.document_id, m.source_page)}`, {
      size: 8.5,
      indent: 10,
      color: statusColor(m.verification_status),
      gap: 7,
    });
  };
  if (confirmedMeds.length) {
    w.text("Reviewed and confirmed by the patient", { size: 9, bold: true, color: TEAL, gap: 4 });
    confirmedMeds.forEach(medBlock);
  }
  if (otherMeds.length) {
    w.text("Not confirmed - check with your pharmacist or care team before relying on these", { size: 9, bold: true, color: AMBER, gap: 4 });
    otherMeds.forEach(medBlock);
  }

  w.heading("Recovery instructions");
  if (bundle.tasks.length === 0) w.text("No wound-care, activity or diet instructions were found.", { color: MUTED });
  for (const category of Object.keys(TASK_CATEGORY_LABEL) as Array<keyof typeof TASK_CATEGORY_LABEL>) {
    const tasks = bundle.tasks.filter((t) => t.category === category);
    if (!tasks.length) continue;
    w.text(TASK_CATEGORY_LABEL[category], { bold: true, size: 11, gap: 3 });
    for (const t of tasks) {
      w.text(`• ${t.instruction}${t.schedule_description ? ` (${t.schedule_description})` : ""}`, { indent: 8, gap: 0 });
      w.text(`${taskTitle(t)}  ·  ${STATUS_LABEL[t.verification_status]}  ·  ${source(t.document_id, t.source_page)}`, {
        size: 8.5,
        indent: 18,
        color: statusColor(t.verification_status),
        gap: 5,
      });
    }
  }

  w.heading("Follow-up appointments");
  if (bundle.follow_ups.length === 0) w.text("No follow-up appointments were found.", { color: MUTED });
  for (const f of bundle.follow_ups) {
    w.text(`${f.specialty ?? "Follow-up"}: ${f.scheduled_date ? formatDateOnly(f.scheduled_date) : "Date not stated"}${f.scheduled_time ? ` at ${f.scheduled_time}` : ""}`, {
      bold: true,
      gap: 0,
    });
    const details = [f.clinician && `Clinician: ${f.clinician}`, f.investigation && `Purpose/investigation: ${f.investigation}`, f.preparation_instructions && `Preparation: ${f.preparation_instructions}`]
      .filter(Boolean)
      .join("   ·   ");
    if (details) w.text(details, { size: 9.5, indent: 10, gap: 0 });
    if (f.status !== "upcoming") {
      w.text(
        f.status === "attended"
          ? "Marked as attended by patient"
          : `Patient reports this was rescheduled${f.patient_reschedule_date ? ` to ${formatDateOnly(f.patient_reschedule_date)}` : ""}`,
        { size: 9, indent: 10, gap: 0 },
      );
    }
    w.text(`${STATUS_LABEL[f.verification_status]}  ·  ${source(f.document_id, f.source_page)}`, {
      size: 8.5,
      indent: 10,
      color: statusColor(f.verification_status),
      gap: 6,
    });
  }

  w.heading("Warning signs documented in your instructions");
  if (bundle.warning_signs.length === 0) {
    w.text("Your documents did not list warning signs. Ask your care team which symptoms need urgent attention.", { color: MUTED });
  }
  for (const s of bundle.warning_signs) {
    w.text(`• ${s.sign}${s.action ? ` - ${s.action}` : ""}`, { bold: true, color: RED, indent: 4, gap: 0 });
    w.text(source(s.document_id, s.source_page), { size: 8.5, indent: 14, color: MUTED, gap: 4 });
  }
  w.text("In an emergency, call your local emergency number. This summary is not an emergency service.", { size: 9, bold: true, gap: 4 });

  w.heading("Unresolved uncertainties and conflicts");
  const open = bundle.flags.filter((f) => f.status === "open");
  const discussed = bundle.flags.filter((f) => f.status === "discussed_with_care_team");
  if (open.length === 0) w.text("None open.", { color: MUTED });
  for (const f of open) {
    w.text(`${f.kind === "conflict" ? "CONFLICT" : "UNCERTAIN"}: ${f.description}`, { color: f.kind === "conflict" ? RED : AMBER, bold: true, size: 9.5, gap: 0 });
    for (const e of f.excerpts.slice(0, 3)) w.text(`"${e}"`, { size: 8.5, indent: 12, color: MUTED, gap: 0 });
    w.space(5);
  }
  if (discussed.length) {
    w.text("Marked by the patient as discussed with their care team", { size: 9, bold: true, gap: 3 });
    for (const f of discussed) w.text(`• ${f.description}${f.patient_note ? ` - Patient note: ${f.patient_note}` : ""}`, { size: 9, indent: 6, gap: 3 });
  }

  const questions = buildDoctorQuestions(bundle);
  if (questions.length) {
    w.heading("Questions to ask your care team");
    questions.forEach((q, i) => w.text(`${i + 1}. ${q.question}`, { size: 9.5, gap: 4 }));
  }

  w.heading("Source documents");
  if (bundle.documents.length === 0) w.text("No documents uploaded.", { color: MUTED });
  for (const d of bundle.documents) {
    w.text(`${d.original_filename} - ${d.document_type.replace(/_/g, " ")}${d.processing_status === "sample" ? " (sample)" : ""}`, { size: 9.5, gap: 2 });
  }
  if (bundle.corrections.length) {
    w.text(`${bundle.corrections.length} correction(s) were made by the patient; corrected values are labelled "Edited by patient".`, {
      size: 9,
      color: MUTED,
      gap: 2,
    });
  }

  w.footer("AFTERCARE AI - organizes patient-provided documents; not medical advice");
  return doc.save();
}
