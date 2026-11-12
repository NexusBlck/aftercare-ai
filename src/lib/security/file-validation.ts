/**
 * File validation that does not trust filenames or client-reported MIME types.
 * Shared by the browser (early feedback) and the server (authoritative check).
 */

export const SUPPORTED_TYPES = {
  "application/pdf": { ext: "pdf", label: "PDF" },
  "image/jpeg": { ext: "jpg", label: "JPEG" },
  "image/png": { ext: "png", label: "PNG" },
} as const;

export type SupportedMime = keyof typeof SUPPORTED_TYPES;

const ALLOWED_EXTENSIONS = new Set(["pdf", "jpg", "jpeg", "png"]);

export const ACCEPT_ATTRIBUTE = ".pdf,.jpg,.jpeg,.png,application/pdf,image/jpeg,image/png";

export function maxUploadBytes(mb: number = Number(process.env.NEXT_PUBLIC_MAX_UPLOAD_MB ?? process.env.MAX_UPLOAD_MB ?? 10)): number {
  const safe = Number.isFinite(mb) && mb > 0 && mb <= 50 ? mb : 10;
  return Math.floor(safe * 1024 * 1024);
}

/** Identifies a file by its leading bytes. Returns null for anything that is not PDF/JPEG/PNG. */
export function sniffMime(bytes: Uint8Array): SupportedMime | null {
  if (bytes.length >= 5 && bytes[0] === 0x25 && bytes[1] === 0x50 && bytes[2] === 0x44 && bytes[3] === 0x46 && bytes[4] === 0x2d) {
    return "application/pdf"; // %PDF-
  }
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) {
    return "image/jpeg";
  }
  const png = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
  if (bytes.length >= 8 && png.every((b, i) => bytes[i] === b)) {
    return "image/png";
  }
  return null;
}

export function fileExtension(filename: string): string {
  const base = filename.split(/[\\/]/).pop() ?? "";
  const dot = base.lastIndexOf(".");
  return dot > 0 ? base.slice(dot + 1).toLowerCase() : "";
}

export type ClaimCheck = { ok: true } | { ok: false; code: "unsupported_type" | "file_too_large" | "empty_file"; message: string };

/** Pre-upload check of what the client claims. The bytes are checked again after upload. */
export function checkFileClaims(filename: string, size: number, maxBytes: number): ClaimCheck {
  if (size <= 0) return { ok: false, code: "empty_file", message: "This file is empty." };
  if (size > maxBytes) {
    return {
      ok: false,
      code: "file_too_large",
      message: `This file is ${(size / 1024 / 1024).toFixed(1)} MB. The limit is ${Math.round(maxBytes / 1024 / 1024)} MB per file.`,
    };
  }
  if (!ALLOWED_EXTENSIONS.has(fileExtension(filename))) {
    return { ok: false, code: "unsupported_type", message: "Only PDF, JPG and PNG files are supported." };
  }
  return { ok: true };
}

export type ContentCheck =
  | { ok: true; mime: SupportedMime }
  | { ok: false; code: "unsupported_type" | "file_too_large" | "empty_file"; message: string };

/** Authoritative check on the actual bytes. */
export function checkFileContent(bytes: Uint8Array, maxBytes: number): ContentCheck {
  if (bytes.length === 0) return { ok: false, code: "empty_file", message: "This file is empty." };
  if (bytes.length > maxBytes) {
    return { ok: false, code: "file_too_large", message: `Files must be ${Math.round(maxBytes / 1024 / 1024)} MB or smaller.` };
  }
  const mime = sniffMime(bytes);
  if (!mime) {
    return {
      ok: false,
      code: "unsupported_type",
      message: "The file contents are not a valid PDF, JPEG or PNG, even if the name suggests otherwise.",
    };
  }
  return { ok: true, mime };
}

/** Display-only filename: strips paths and control characters. Never used to build storage paths. */
export function safeDisplayName(filename: string): string {
  const base = filename.split(/[\\/]/).pop() ?? "document";
  const cleaned = base.replace(/[\u0000-\u001f\u007f<>:"|?*]/g, "").trim();
  return (cleaned || "document").slice(0, 200);
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function isUuid(value: unknown): value is string {
  return typeof value === "string" && UUID_RE.test(value);
}

/**
 * Storage object path built only from server-controlled UUIDs, so a filename such as
 * "../../other-user/x.pdf" can never influence where a file is stored.
 */
export function buildStoragePath(userId: string, planId: string, objectId: string, mime: SupportedMime): string {
  if (!isUuid(userId) || !isUuid(planId) || !isUuid(objectId)) {
    throw new Error("Invalid identifier for storage path");
  }
  return `${userId}/${planId}/${objectId}.${SUPPORTED_TYPES[mime].ext}`;
}

/** Maps a claimed filename to the MIME type we expect its bytes to have. */
export function expectedMimeFromName(filename: string): SupportedMime | null {
  const ext = fileExtension(filename);
  if (ext === "pdf") return "application/pdf";
  if (ext === "jpg" || ext === "jpeg") return "image/jpeg";
  if (ext === "png") return "image/png";
  return null;
}
