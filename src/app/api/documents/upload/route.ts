import { AppError } from "@/lib/api/errors";
import { handle, ok, parseJson } from "@/lib/api/route-utils";
import { serverConfig } from "@/lib/config";
import { buildStoragePath, checkFileClaims, expectedMimeFromName, safeDisplayName } from "@/lib/security/file-validation";
import { clientKey, rateLimit } from "@/lib/security/rate-limit";
import { requireUser } from "@/lib/supabase/server";
import { UploadRequestSchema } from "@/schemas/domain";

/**
 * Step 1 of an upload: validate the claim, create the document row and return a signed upload URL.
 * The storage path is built only from server-generated UUIDs; the original filename is display-only.
 * The bytes are verified in /finalize before the document can be processed.
 */
export const POST = handle(async (request: Request) => {
  const { supabase, user, bucket } = await requireUser();
  const limit = await rateLimit(`upload:${user.id}:${clientKey(request)}`, 30, 10 * 60_000);
  if (!limit.ok) throw new AppError("rate_limited", `Too many uploads. Try again in ${limit.retryAfterSec} seconds.`, 429, true);

  const body = await parseJson(request, UploadRequestSchema);
  const claim = checkFileClaims(body.filename, body.size, serverConfig().maxUploadBytes);
  if (!claim.ok) throw new AppError(claim.code, claim.message, 400);
  const mime = expectedMimeFromName(body.filename);
  if (!mime) throw new AppError("unsupported_type", "Only PDF, JPG and PNG files are supported.", 400);

  // Verifies plan ownership (RLS + explicit filter).
  const { data: plan } = await supabase.from("care_plans").select("id").eq("id", body.care_plan_id).eq("user_id", user.id).maybeSingle();
  if (!plan) throw new AppError("not_found", "This care plan was not found.", 404);

  const id = crypto.randomUUID();
  const path = buildStoragePath(user.id, body.care_plan_id, id, mime);
  const { data: doc, error } = await supabase
    .from("documents")
    .insert({
      id,
      care_plan_id: body.care_plan_id,
      user_id: user.id,
      file_path: path,
      original_filename: safeDisplayName(body.filename),
      mime_type: mime,
      file_size: body.size,
      processing_status: "uploading",
    })
    .select("*")
    .single();
  if (error || !doc) throw new AppError("database_error", "We could not register this upload.", 500, true);

  const { data: signed, error: signError } = await supabase.storage.from(bucket).createSignedUploadUrl(path);
  if (signError || !signed) {
    await supabase.from("documents").delete().eq("id", id).eq("user_id", user.id);
    throw new AppError("storage_error", "Secure storage is unavailable right now. Please try again.", 502, true);
  }
  return ok({ document: doc, uploadUrl: signed.signedUrl, contentType: mime }, { status: 201 });
});
