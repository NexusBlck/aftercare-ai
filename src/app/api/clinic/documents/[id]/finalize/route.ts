import type { NextRequest } from "next/server";
import { AppError } from "@/lib/api/errors";
import { handle, ok } from "@/lib/api/route-utils";
import { serverConfig } from "@/lib/config";
import { mapDbError } from "@/lib/clinic/db-errors";
import { logClinicEvent, requireClinic } from "@/lib/clinic/server";
import { securityEvent } from "@/lib/security/audit-log";
import { checkFileContent } from "@/lib/security/file-validation";
import { scanUpload } from "@/lib/security/malware-scan";
import { downloadClinicFile, getClinicDocument } from "@/services/clinic-documents";

/**
 * Step 2: verify the stored bytes (magic numbers, size) and run the built-in malware check. Anything
 * that is not a genuine, safe PDF/JPEG/PNG of the declared type and size is deleted.
 */
export const POST = handle(async (req: NextRequest, ctx: RouteContext<"/api/clinic/documents/[id]/finalize">) => {
  const { id } = await ctx.params;
  const clinic = await requireClinic("documents.upload");
  const doc = await getClinicDocument(clinic, id);
  if (doc.processing_status !== "uploading") return ok({ document: doc });

  const bytes = await downloadClinicFile(clinic, doc);
  const check = checkFileContent(bytes, serverConfig().maxUploadBytes);
  const scan = check.ok && check.mime === doc.mime_type ? await scanUpload(bytes, check.mime) : null;
  if (!check.ok || check.mime !== doc.mime_type || bytes.length !== doc.file_size || (scan && !scan.ok)) {
    const reason = !check.ok ? check.code : check.mime !== doc.mime_type ? "type_mismatch" : scan && !scan.ok ? scan.reason : "size_mismatch";
    securityEvent("upload_rejected", req, { reason });
    // Storage deletion is limited to owners/admins by policy; the row removal below hides the object
    // from everyone and the orphan is cleaned up by retention.
    await clinic.supabase.storage.from(clinic.bucket).remove([doc.file_path]);
    await clinic.supabase.from("clinic_documents").update({ processing_status: "failed", processing_error: "Rejected: not a valid file of the declared type." }).eq("id", id).eq("organization_id", clinic.orgId);
    if (scan && !scan.ok) throw new AppError("unsafe_file", `${scan.message} The file was rejected.`, 400);
    throw new AppError(
      check.ok ? "unsupported_type" : check.code,
      check.ok ? "The file contents do not match its file type or size, so it was rejected." : `${check.message} The file was rejected.`,
      400,
    );
  }
  const { data, error } = await clinic.supabase
    .from("clinic_documents")
    .update({ processing_status: "uploaded" })
    .eq("id", id)
    .eq("organization_id", clinic.orgId)
    .select("id, episode_id, original_filename, mime_type, file_size, document_type, processing_status, created_at")
    .single();
  if (error) throw mapDbError(error, "save this upload");
  await logClinicEvent(clinic, "document.uploaded", "clinic_document", id, { document_type: doc.document_type });
  return ok({ document: data });
});
