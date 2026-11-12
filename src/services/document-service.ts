import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { AppError } from "@/lib/api/errors";
import { isUuid } from "@/lib/security/file-validation";
import { DocumentRecordSchema, type DocumentRecord } from "@/schemas/domain";

export interface OwnedDocument extends DocumentRecord {
  processing_started_at: string | null;
}

/** Loads a document only if it belongs to the caller (explicit user_id filter + RLS). */
export async function getOwnedDocument(supabase: SupabaseClient, userId: string, id: string): Promise<OwnedDocument> {
  if (!isUuid(id)) throw new AppError("invalid_id", "That document link is not valid.", 400);
  const { data, error } = await supabase.from("documents").select("*").eq("id", id).eq("user_id", userId).maybeSingle();
  if (error) throw new AppError("database_error", "We could not load this document.", 500, true);
  if (!data) throw new AppError("not_found", "This document was not found.", 404);
  const parsed = DocumentRecordSchema.safeParse(data);
  if (!parsed.success) throw new AppError("database_error", "We could not read this document's details.", 500);
  return { ...parsed.data, processing_started_at: (data.processing_started_at as string | null) ?? null };
}

export async function downloadOwnedFile(supabase: SupabaseClient, bucket: string, doc: OwnedDocument): Promise<Uint8Array> {
  if (!doc.file_path) throw new AppError("not_found", "This document has no stored file.", 404);
  const { data, error } = await supabase.storage.from(bucket).download(doc.file_path);
  if (error || !data) {
    throw new AppError("storage_error", "We could not read the stored file. It may still be uploading — try again in a moment.", 502, true);
  }
  return new Uint8Array(await data.arrayBuffer());
}

export async function removeStoredFile(supabase: SupabaseClient, bucket: string, path: string | null) {
  if (!path) return;
  const { error } = await supabase.storage.from(bucket).remove([path]);
  if (error) throw new AppError("storage_error", "We could not delete the stored file. Please try again.", 502, true);
}

export const STALE_PROCESSING_MS = 5 * 60 * 1000;

export function isActivelyProcessing(doc: OwnedDocument, now = Date.now()): boolean {
  return (
    doc.processing_status === "processing" &&
    doc.processing_started_at !== null &&
    now - new Date(doc.processing_started_at).getTime() < STALE_PROCESSING_MS
  );
}
