import { PDFDocument } from "pdf-lib";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { buildSamplePlan } from "@/lib/demo/sample-plan";
import { applyExplanations, checkExplanation, collectExplainable } from "@/lib/domain/explanations";
import { buildSummaryPdf, EXPORT_NOTICE, toWinAnsi } from "@/lib/pdf/build-summary";
import { memoryRateLimit } from "@/lib/security/rate-limit";
import {
  buildStoragePath,
  checkFileClaims,
  checkFileContent,
  isUuid,
  safeDisplayName,
  sniffMime,
} from "@/lib/security/file-validation";
import { testContext } from "./helpers";

const fixture = (name: string) => new Uint8Array(readFileSync(join(process.cwd(), "tests", "fixtures", "documents", name)));

describe("explanation layer", () => {
  it("accepts explanations that keep every number", () => {
    const r = checkExplanation("Paracetamol 500 mg, 2 tablets every 6 hours", "Take 2 tablets of paracetamol 500 mg every 6 hours.", "ہر 6 گھنٹے بعد 500 mg کی 2 گولیاں");
    expect(r.status).toBe("generated");
    expect(r.ur).not.toBeNull();
  });

  it("rejects an English explanation that changes a number", () => {
    expect(checkExplanation("Do not lift more than 5 kg for 4 weeks", "Avoid lifting heavy things for a month.", null)).toEqual({ en: null, ur: null, status: "rejected" });
  });

  it("drops only the Urdu translation if it loses a number", () => {
    const r = checkExplanation("Take 1 tablet three times a day for 3 days", "Take 1 tablet 3 times a day for 3 days.", "دن میں تین بار ایک گولی");
    expect(r.status).toBe("generated");
    expect(r.ur).toBeNull();
  });

  it("ignores explanations for IDs that were not requested", () => {
    const bundle = buildSamplePlan(testContext(), "2026-11-12");
    const items = collectExplainable(bundle).slice(0, 1);
    const next = applyExplanations(bundle, items, { items: [{ id: "injected-id", plain_en: "x", plain_ur: null }] });
    expect(next).toEqual(bundle);
  });
});

describe("file validation", () => {
  it("identifies real PDFs by content and rejects disguised text", () => {
    expect(sniffMime(fixture("synthetic-discharge-summary.pdf"))).toBe("application/pdf");
    const disguised = checkFileContent(fixture("disguised-text.pdf"), 10 * 1024 * 1024);
    expect(disguised).toMatchObject({ ok: false, code: "unsupported_type" });
  });

  it("recognises JPEG and PNG signatures", () => {
    expect(sniffMime(new Uint8Array([0xff, 0xd8, 0xff, 0xe0]))).toBe("image/jpeg");
    expect(sniffMime(new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))).toBe("image/png");
    expect(sniffMime(new Uint8Array([0x50, 0x4b, 0x03, 0x04]))).toBeNull(); // zip/docx
  });

  it("rejects unsupported extensions, empty and oversized files", () => {
    expect(checkFileClaims("notes.txt", 100, 1000)).toMatchObject({ ok: false, code: "unsupported_type" });
    expect(checkFileClaims("scan.docx", 100, 1000)).toMatchObject({ ok: false, code: "unsupported_type" });
    expect(checkFileClaims("scan.pdf", 0, 1000)).toMatchObject({ ok: false, code: "empty_file" });
    expect(checkFileClaims("scan.pdf", 2000, 1000)).toMatchObject({ ok: false, code: "file_too_large" });
    expect(checkFileClaims("Scan.PDF", 100, 1000)).toEqual({ ok: true });
    expect(checkFileContent(new Uint8Array(11 * 1024 * 1024).fill(0x25), 10 * 1024 * 1024)).toMatchObject({ code: "file_too_large" });
  });

  it("builds storage paths only from UUIDs, so filenames cannot escape the user's folder", () => {
    const u = "11111111-1111-4111-8111-111111111111";
    const p = "22222222-2222-4222-8222-222222222222";
    const o = "33333333-3333-4333-8333-333333333333";
    expect(buildStoragePath(u, p, o, "application/pdf")).toBe(`${u}/${p}/${o}.pdf`);
    expect(() => buildStoragePath("../other-user", p, o, "application/pdf")).toThrow();
    expect(() => buildStoragePath(u, p, "../../x", "image/png")).toThrow();
    expect(isUuid("not-a-uuid")).toBe(false);
  });

  it("sanitizes display names", () => {
    expect(safeDisplayName("../../etc/passwd")).toBe("passwd");
    expect(safeDisplayName('C:\\Users\\me\\scan<1>.pdf')).toBe("scan1.pdf");
    expect(safeDisplayName("\u0000\u0007")).toBe("document");
  });
});

describe("rate limiting", () => {
  it("blocks after the limit within the window and recovers after it", () => {
    const key = `test-${Math.random()}`;
    expect(memoryRateLimit(key, 2, 1000, 0).ok).toBe(true);
    expect(memoryRateLimit(key, 2, 1000, 10).ok).toBe(true);
    expect(memoryRateLimit(key, 2, 1000, 20)).toMatchObject({ ok: false });
    expect(memoryRateLimit(key, 2, 1000, 1500).ok).toBe(true);
  });
});

describe("PDF export", () => {
  it("uses the required notice wording", () => {
    expect(EXPORT_NOTICE).toBe(
      "This summary organizes information from documents provided by the patient. It is not a substitute for instructions from the treating healthcare professional. Confirm uncertain or conflicting information with your care team.",
    );
  });

  it("produces a valid multi-page PDF for the sample plan", async () => {
    const bytes = await buildSummaryPdf(buildSamplePlan(testContext(), "2026-11-12"), new Date("2026-11-12T10:00:00Z"));
    const doc = await PDFDocument.load(bytes);
    expect(doc.getPageCount()).toBeGreaterThanOrEqual(2);
    expect(doc.getTitle()).toContain("AFTERCARE AI");
  });

  it("replaces characters the standard PDF font cannot draw", () => {
    expect(toWinAnsi("Fever above 38°C — call")).toBe("Fever above 38°C — call");
    expect(toWinAnsi("درد")).toBe("???");
  });
});

describe("post-login redirect", () => {
  it("allows same-origin paths and rejects open redirects", async () => {
    const { safeNext } = await import("@/lib/security/redirect");
    const origin = "https://aftercare.example";
    expect(safeNext("/medications?x=1#top", origin)).toBe("/medications?x=1#top");
    const bs = String.fromCharCode(92); // a literal backslash, which browsers treat like "/"
    for (const evil of ["//evil.com", `/${bs}evil.com`, `/${bs}/evil.com`, "/	/evil.com", "https://evil.com", "javascript:alert(1)", "", null]) {
      expect(safeNext(evil, origin), String(evil)).toBe("/dashboard");
    }
  });
});
