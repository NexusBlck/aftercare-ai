import { handle } from "@/lib/api/route-utils";
import { logClinicEvent, requireClinic } from "@/lib/clinic/server";
import { downloadClinicFile, getClinicDocument } from "@/services/clinic-documents";

/** Streams a clinic document to authorized staff. There are no public URLs; every view is audited. */
export const GET = handle(async (_req: Request, ctx: RouteContext<"/api/clinic/documents/[id]/file">) => {
  const { id } = await ctx.params;
  const clinic = await requireClinic("patients.read");
  const doc = await getClinicDocument(clinic, id);
  const bytes = await downloadClinicFile(clinic, doc);
  await logClinicEvent(clinic, "document.viewed", "clinic_document", id);
  return new Response(Buffer.from(bytes), {
    headers: {
      "Content-Type": doc.mime_type,
      "Content-Disposition": `inline; filename="document.${doc.mime_type === "application/pdf" ? "pdf" : doc.mime_type === "image/png" ? "png" : "jpg"}"`,
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
});
