import { AppError } from "@/lib/api/errors";
import { handle } from "@/lib/api/route-utils";
import { LEGAL_VERSIONS } from "@/lib/legal";
import { requireUser } from "@/lib/supabase/server";
import { getLegalStatus } from "@/services/legal-service";
import { listPlans, loadBundle } from "@/services/plan-repository";

const FILE_LINK_SECONDS = 60 * 60;

/**
 * Data download (access / portability). Returns everything held about the caller as JSON.
 * Uploaded files are included as private links that expire after one hour.
 */
export const GET = handle(async () => {
  const { supabase, user, bucket } = await requireUser();
  const [{ data: profile, error }, plans, legal] = await Promise.all([
    supabase.from("profiles").select("*").eq("id", user.id).maybeSingle(),
    listPlans(supabase, user.id),
    getLegalStatus(supabase, user.id),
  ]);
  if (error) throw new AppError("database_error", "We could not prepare your data.", 500, true);

  const bundles = [];
  for (const p of plans) {
    const bundle = await loadBundle(supabase, user.id, p.id);
    const documents = await Promise.all(
      bundle.documents.map(async (d) => {
        if (!d.file_path) return { ...d, download_url: null };
        const { data } = await supabase.storage.from(bucket).createSignedUrl(d.file_path, FILE_LINK_SECONDS);
        return { ...d, download_url: data?.signedUrl ?? null };
      }),
    );
    const { data: runs } = await supabase
      .from("extraction_runs")
      .select("document_id,model_identifier,provider,status,error_code,started_at,extracted_at")
      .eq("user_id", user.id)
      .in("document_id", bundle.documents.map((d) => d.id).concat("00000000-0000-0000-0000-000000000000"));
    bundles.push({ ...bundle, documents, processing_log: runs ?? [] });
  }

  const payload = {
    export_format: "aftercare-ai-data-export/1",
    generated_at: new Date().toISOString(),
    notice: `Document download links expire ${FILE_LINK_SECONDS / 60} minutes after this file was generated.`,
    account: { id: user.id, email: user.email ?? null, created_at: user.created_at, email_confirmed_at: user.email_confirmed_at ?? null },
    profile,
    agreements: { current_versions: LEGAL_VERSIONS, accepted: legal.accepted },
    marketing: { opt_in: legal.marketing_opt_in, opt_in_at: legal.marketing_opt_in_at },
    care_plans: bundles,
  };
  return new Response(JSON.stringify(payload, null, 2), {
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Content-Disposition": `attachment; filename="aftercare-my-data.json"`,
      "Cache-Control": "private, no-store",
    },
  });
});
