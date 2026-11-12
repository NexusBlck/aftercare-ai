import { AppError } from "@/lib/api/errors";
import { ndjsonStream } from "@/lib/api/ndjson";
import { handle } from "@/lib/api/route-utils";
import { serverConfig } from "@/lib/config";
import { extractDocument, requireAi } from "@/lib/gemini/pipeline";
import { securityEvent } from "@/lib/security/audit-log";
import { checkFileContent } from "@/lib/security/file-validation";
import { clientKey, rateLimit } from "@/lib/security/rate-limit";

export const maxDuration = 300;

/**
 * Stateless extraction for DEMO mode: the file is processed in memory and never stored.
 * The browser applies the validated result to its local plan with the same domain functions.
 */
export const POST = handle(async (request: Request) => {
  requireAi();
  const limit = rateLimit(`extract:${clientKey(request)}`, 8, 10 * 60_000);
  if (!limit.ok) throw new AppError("rate_limited", `Too many documents processed. Try again in ${limit.retryAfterSec} seconds.`, 429, true);

  const maxBytes = serverConfig().maxUploadBytes;
  const declared = Number(request.headers.get("content-length") ?? 0);
  if (declared > maxBytes + 64 * 1024) throw new AppError("file_too_large", `Files must be ${Math.round(maxBytes / 1048576)} MB or smaller.`, 413);

  let file: File | null = null;
  try {
    const form = await request.formData();
    const value = form.get("file");
    file = value instanceof File ? value : null;
  } catch {
    throw new AppError("invalid_request", "The upload could not be read.", 400);
  }
  if (!file) throw new AppError("invalid_request", "No file was attached.", 400);
  const bytes = new Uint8Array(await file.arrayBuffer());
  const check = checkFileContent(bytes, maxBytes);
  if (!check.ok) {
    securityEvent("upload_rejected", request, { reason: check.code });
    throw new AppError(check.code, check.message, 400);
  }

  return ndjsonStream(async (emit) => {
    emit({ type: "stage", stage: "reading" });
    const result = await extractDocument(bytes, check.mime, (stage) => emit({ type: "stage", stage }));
    emit({ type: "extracted", result });
  });
});
