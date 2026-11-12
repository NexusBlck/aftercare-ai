import { handle } from "@/lib/api/route-utils";
import { AppError } from "@/lib/api/errors";
import { must, requireId } from "@/lib/clinic/server";
import { requireUser } from "@/lib/supabase/server";

/** A document the clinic explicitly shared with this patient. RLS hides everything else (also in storage). */
export const GET = handle(async (_req: Request, ctx: RouteContext<"/api/care-team/documents/[id]">) => {
  const { id } = await ctx.params;
  const { supabase, bucket } = await requireUser();
  const doc = must(
    await supabase.from("clinic_documents").select("file_path, mime_type").eq("id", requireId(id, "document")).eq("shared_with_patient", true).maybeSingle(),
    "document",
  ) as { file_path: string; mime_type: string };
  const { data, error } = await supabase.storage.from(bucket).download(doc.file_path);
  if (error || !data) throw new AppError("storage_error", "We could not open this document. Please try again.", 502, true);
  return new Response(data, {
    headers: { "Content-Type": doc.mime_type, "Content-Disposition": "inline", "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff" },
  });
});
