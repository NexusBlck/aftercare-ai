import type { NextRequest } from "next/server";
import { AppError } from "@/lib/api/errors";
import { handle, ok } from "@/lib/api/route-utils";
import { requireUser } from "@/lib/supabase/server";
import { getOwnedDocument } from "@/services/document-service";

/** Returns a 60-second signed URL for previewing a document the caller owns. */
export const GET = handle(async (_req: NextRequest, ctx: RouteContext<"/api/documents/[id]/file">) => {
  const { id } = await ctx.params;
  const { supabase, user, bucket } = await requireUser();
  const doc = await getOwnedDocument(supabase, user.id, id);
  if (!doc.file_path || doc.processing_status === "uploading") throw new AppError("not_found", "This file is not available yet.", 404);
  const { data, error } = await supabase.storage.from(bucket).createSignedUrl(doc.file_path, 60);
  if (error || !data) throw new AppError("storage_error", "We could not open this file right now.", 502, true);
  return ok({ url: data.signedUrl, mimeType: doc.mime_type, expiresInSeconds: 60 });
});
