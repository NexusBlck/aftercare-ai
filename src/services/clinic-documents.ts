import "server-only";
import { AppError } from "@/lib/api/errors";
import { must, requireId, type ClinicContext } from "@/lib/clinic/server";

export interface ClinicDocument {
  id: string;
  organization_id: string;
  patient_id: string;
  episode_id: string;
  file_path: string;
  original_filename: string;
  mime_type: "application/pdf" | "image/jpeg" | "image/png";
  file_size: number;
  document_type: string;
  processing_status: "uploading" | "uploaded" | "processing" | "processed" | "failed";
  processing_error: string | null;
  processing_started_at: string | null;
  shared_with_patient: boolean;
  created_at: string;
  updated_at: string;
}

export async function getClinicDocument(ctx: ClinicContext, id: string): Promise<ClinicDocument> {
  requireId(id, "document");
  return must(
    await ctx.supabase.from("clinic_documents").select("*").eq("id", id).eq("organization_id", ctx.orgId).maybeSingle(),
    "document",
  ) as ClinicDocument;
}

export async function downloadClinicFile(ctx: ClinicContext, doc: ClinicDocument): Promise<Uint8Array> {
  const { data, error } = await ctx.supabase.storage.from(ctx.bucket).download(doc.file_path);
  if (error || !data) {
    throw new AppError("storage_error", "We could not read the stored file. It may still be uploading — try again in a moment.", 502, true);
  }
  return new Uint8Array(await data.arrayBuffer());
}
