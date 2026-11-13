import "server-only";
import { AppError } from "@/lib/api/errors";

/**
 * Text layer of a PDF, page by page, for models that cannot read PDF files directly (the FreeLLMAPI
 * router refuses binary documents). Page markers keep `source_page` meaningful. Scanned PDFs have no
 * text layer; they are rejected with advice to upload photos instead of being sent half-read.
 */

export const MIN_TEXT_CHARS = 40;
export const MAX_TEXT_CHARS = 60_000;

export function formatPages(pages: string[]): string {
  return pages.map((text, i) => `[Page ${i + 1}]\n${text.replace(/[ \t]+\n/g, "\n").trim()}`).join("\n\n");
}

export async function pdfToText(bytes: Uint8Array): Promise<{ text: string; pages: number }> {
  let pages: string[];
  try {
    const { extractText, getDocumentProxy } = await import("unpdf");
    const pdf = await getDocumentProxy(new Uint8Array(bytes));
    const result = await extractText(pdf, { mergePages: false });
    pages = Array.isArray(result.text) ? result.text : [result.text];
  } catch {
    throw new AppError("ai_unavailable", "This PDF could not be opened. It may be damaged or password-protected.", 422);
  }
  const text = formatPages(pages);
  if (text.replace(/\[Page \d+\]/g, "").replace(/\s/g, "").length < MIN_TEXT_CHARS) {
    throw new AppError(
      "ai_unavailable",
      "This PDF looks like a scan with no readable text. Upload clear photos (JPG or PNG) of the pages instead.",
      422,
    );
  }
  if (text.length > MAX_TEXT_CHARS) {
    throw new AppError("ai_unavailable", "This PDF is too long to process in one go. Upload the discharge pages separately.", 422);
  }
  return { text, pages: pages.length };
}
