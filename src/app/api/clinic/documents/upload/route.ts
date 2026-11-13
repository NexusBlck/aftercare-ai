import { AppError } from "@/lib/api/errors";
import { enforceRateLimit } from "@/lib/api/auth-guards";
import { handle, ok, parseJson } from "@/lib/api/route-utils";
import { serverConfig } from "@/lib/config";
import { mapDbError } from "@/lib/clinic/db-errors";
import { requireClinic } from "@/lib/clinic/server";
import { checkFileClaims, expectedMimeFromName, safeDisplayName } from "@/lib/security/file-validation";
import { ClinicUploadSchema } from "@/schemas/clinic";
import { getEpisode } from "@/services/clinic-service";

const EXT = { "application/pdf": "pdf", "image/jpeg": "jpg", "image/png": "png" } as const;

/**
 * Step 1 of a clinic upload: validate the claim, register the document and return a signed upload URL
 * for a server-generated, randomized path inside the clinic's private folder. Bytes are verified in /finalize.
 */
export const POST = handle(async (request: Request) => {
  const ctx = await requireClinic("documents.upload");
  await enforceRateLimit(request, "clinic-upload", ctx.user.id, 60, 10 * 60_000);
  const body = await parseJson(request, ClinicUploadSchema);
  const claim = checkFileClaims(body.filename, body.size, serverConfig().maxUploadBytes);
  if (!claim.ok) throw new AppError(claim.code, claim.message, 400);
  const mime = expectedMimeFromName(body.filename);
  if (!mime) throw new AppError("unsupported_type", "Only PDF, JPG and PNG files are supported.", 400);

  const episode = await getEpisode(ctx, body.episode_id);
  const id = crypto.randomUUID();
  const path = `clinic/${ctx.orgId}/${episode.patient_id}/${id}.${EXT[mime]}`;
  const { data: doc, error } = await ctx.supabase
    .from("clinic_documents")
    .insert({
      id,
      organization_id: ctx.orgId,
      patient_id: episode.patient_id,
      episode_id: episode.id,
      file_path: path,
      original_filename: safeDisplayName(body.filename),
      mime_type: mime,
      file_size: body.size,
      document_type: body.document_type,
    })
    .select("id, episode_id, original_filename, mime_type, file_size, document_type, processing_status, created_at")
    .single();
  if (error || !doc) throw mapDbError(error, "register this upload");

  const { data: signed, error: signError } = await ctx.supabase.storage.from(ctx.bucket).createSignedUploadUrl(path);
  if (signError || !signed) {
    await ctx.supabase.from("clinic_documents").delete().eq("id", id).eq("organization_id", ctx.orgId);
    throw new AppError("storage_error", "Secure storage is unavailable right now. Please try again.", 502, true);
  }
  return ok({ document: doc, uploadUrl: signed.signedUrl, contentType: mime }, { status: 201 });
});
