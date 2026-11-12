import type { NextRequest } from "next/server";
import { AppError } from "@/lib/api/errors";
import { handle, ok } from "@/lib/api/route-utils";
import { serverConfig } from "@/lib/config";
import { securityEvent } from "@/lib/security/audit-log";
import { checkFileContent } from "@/lib/security/file-validation";
import { requireUser } from "@/lib/supabase/server";
import { downloadOwnedFile, getOwnedDocument, removeStoredFile } from "@/services/document-service";

/** Step 2 of an upload: verify the stored bytes. Files that are not genuine PDF/JPEG/PNG are deleted. */
export const POST = handle(async (req: NextRequest, ctx: RouteContext<"/api/documents/[id]/finalize">) => {
  const { id } = await ctx.params;
  const { supabase, user, bucket } = await requireUser();
  const doc = await getOwnedDocument(supabase, user.id, id);
  if (doc.processing_status !== "uploading") return ok({ document: doc });

  const bytes = await downloadOwnedFile(supabase, bucket, doc);
  const check = checkFileContent(bytes, serverConfig().maxUploadBytes);
  if (!check.ok || check.mime !== doc.mime_type) {
    securityEvent("upload_rejected", req, { reason: check.ok ? "type_mismatch" : check.code });
    await removeStoredFile(supabase, bucket, doc.file_path);
    await supabase.from("documents").delete().eq("id", id).eq("user_id", user.id);
    throw new AppError(
      check.ok ? "unsupported_type" : check.code,
      check.ok ? "The file contents do not match its file type, so it was removed." : `${check.message} The file was removed.`,
      400,
    );
  }
  const { data, error } = await supabase
    .from("documents")
    .update({ processing_status: "uploaded", file_size: bytes.length })
    .eq("id", id)
    .eq("user_id", user.id)
    .select("*")
    .single();
  if (error || !data) throw new AppError("database_error", "We could not save this upload.", 500, true);
  return ok({ document: data });
});
