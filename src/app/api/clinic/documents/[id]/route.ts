import { AppError } from "@/lib/api/errors";
import { handle, ok, parseJson } from "@/lib/api/route-utils";
import { mapDbError } from "@/lib/clinic/db-errors";
import { can } from "@/lib/clinic/permissions";
import { logClinicEvent, requireClinic } from "@/lib/clinic/server";
import { ClinicDocumentPatchSchema } from "@/schemas/clinic";
import { getClinicDocument } from "@/services/clinic-documents";

export const PATCH = handle(async (request: Request, ctx: RouteContext<"/api/clinic/documents/[id]">) => {
  const { id } = await ctx.params;
  const clinic = await requireClinic("documents.upload");
  const body = await parseJson(request, ClinicDocumentPatchSchema);
  if (body.shared_with_patient !== undefined && !can(clinic.member, "documents.share")) {
    throw new AppError("forbidden", "Only clinicians and administrators can share documents with patients.", 403);
  }
  const doc = await getClinicDocument(clinic, id);
  const { data, error } = await clinic.supabase.from("clinic_documents").update(body).eq("id", doc.id).eq("organization_id", clinic.orgId).select("id, document_type, shared_with_patient").single();
  if (error) throw mapDbError(error, "update the document");
  if (body.shared_with_patient !== undefined) {
    await logClinicEvent(clinic, "document.shared", "clinic_document", id, { shared: body.shared_with_patient });
  }
  return ok({ document: data });
});

/** Deletes a document and its stored file (owners/admins). Extracted plan content stays in plan versions for the audit trail. */
export const DELETE = handle(async (_req: Request, ctx: RouteContext<"/api/clinic/documents/[id]">) => {
  const { id } = await ctx.params;
  const clinic = await requireClinic("documents.delete");
  const doc = await getClinicDocument(clinic, id);
  const { error: storageError } = await clinic.supabase.storage.from(clinic.bucket).remove([doc.file_path]);
  if (storageError) throw new AppError("storage_error", "We could not delete the stored file. Please try again.", 502, true);
  const { error } = await clinic.supabase.from("clinic_documents").delete().eq("id", id).eq("organization_id", clinic.orgId);
  if (error) throw mapDbError(error, "delete the document");
  await logClinicEvent(clinic, "document.deleted", "clinic_document", id);
  return ok({ deleted: true });
});
