import type { NextRequest } from "next/server";
import { AppError } from "@/lib/api/errors";
import { handle } from "@/lib/api/route-utils";
import { buildSummaryPdf } from "@/lib/pdf/build-summary";
import { requireUser } from "@/lib/supabase/server";
import { loadBundle } from "@/services/plan-repository";

/** Downloads the recovery summary PDF for a plan the caller owns. */
export const GET = handle(async (_req: NextRequest, ctx: RouteContext<"/api/export/[id]">) => {
  const { id } = await ctx.params;
  const { supabase, user } = await requireUser();
  const bundle = await loadBundle(supabase, user.id, id);
  let bytes: Uint8Array;
  try {
    bytes = await buildSummaryPdf(bundle);
  } catch {
    throw new AppError("pdf_failed", "We could not create the PDF. Please try again.", 500, true);
  }
  return new Response(Buffer.from(bytes), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="aftercare-summary.pdf"`,
      "Cache-Control": "private, no-store",
    },
  });
});
