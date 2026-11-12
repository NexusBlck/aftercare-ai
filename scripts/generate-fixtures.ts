/**
 * Renders the SYNTHETIC documents (fictional patient) into PDF fixtures for tests and for the
 * downloadable sample on the Documents page. Run: npm run fixtures
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { PDFDocument, PDFName, PDFString, StandardFonts, rgb } from "pdf-lib";
import { buildSyntheticDocuments, FIXTURE_MARKER_PREFIX } from "../src/lib/demo/synthetic-documents";

const FIXED_DATE = new Date("2026-11-10T09:00:00Z");

async function render(key: string, pages: string[], faint: boolean): Promise<Uint8Array> {
  const pdf = await PDFDocument.create();
  pdf.setTitle(`Synthetic test document (${key})`);
  pdf.setSubject(`${FIXTURE_MARKER_PREFIX}${key}`);
  pdf.setKeywords([`${FIXTURE_MARKER_PREFIX}${key}`, "synthetic", "fictional"]);
  pdf.setProducer("AFTERCARE AI fixture generator");
  pdf.setCreator("AFTERCARE AI fixture generator");
  // Plain (uncompressed, literal-string) marker the deterministic test extractor can find.
  pdf.catalog.set(PDFName.of("AftercareFixture"), PDFString.of(`${FIXTURE_MARKER_PREFIX}${key}`));
  pdf.setCreationDate(FIXED_DATE);
  pdf.setModificationDate(FIXED_DATE);
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  for (const text of pages) {
    const page = pdf.addPage([595.28, 841.89]);
    let y = 790;
    for (const raw of text.split("\n")) {
      const isHeading = raw === raw.toUpperCase() && /[A-Z]/.test(raw) && raw.length < 90;
      const f = isHeading ? bold : font;
      const size = isHeading ? 11 : 10;
      const words = raw.split(" ");
      let line = "";
      const flush = () => {
        page.drawText(line, { x: 50, y, size, font: f, color: faint ? rgb(0.55, 0.55, 0.55) : rgb(0.1, 0.1, 0.12) });
        y -= size * 1.5;
        line = "";
      };
      if (raw.trim() === "") {
        y -= 8;
        continue;
      }
      for (const w of words) {
        const candidate = line ? `${line} ${w}` : w;
        if (f.widthOfTextAtSize(candidate, size) > 495) flush();
        line = line ? `${line} ${w}` : w;
      }
      flush();
    }
  }
  return pdf.save({ useObjectStreams: false });
}

async function main() {
  const docs = buildSyntheticDocuments();
  const out = join(process.cwd(), "tests", "fixtures", "documents");
  mkdirSync(out, { recursive: true });
  for (const doc of Object.values(docs)) {
    const bytes = await render(doc.key, doc.pages, doc.key === "ambiguous-medication");
    writeFileSync(join(out, doc.filename), bytes);
    console.log("wrote", doc.filename);
  }
  // Unsupported-format fixtures: plain text, and text disguised with a .pdf extension.
  writeFileSync(join(out, "unsupported-notes.txt"), "Synthetic note. Not a supported format.\n");
  writeFileSync(join(out, "disguised-text.pdf"), "This is plain text pretending to be a PDF.\n");

  const samples = join(process.cwd(), "public", "samples");
  mkdirSync(samples, { recursive: true });
  for (const key of ["clear-discharge-summary", "prescription-missing-duration", "wound-care-sheet"] as const) {
    const doc = docs[key];
    writeFileSync(join(samples, doc.filename), await render(doc.key, doc.pages, false));
  }
  console.log("done");
}

void main();
