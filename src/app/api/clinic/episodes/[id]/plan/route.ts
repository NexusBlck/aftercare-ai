import { handle, ok } from "@/lib/api/route-utils";
import { requireClinic, rpc } from "@/lib/clinic/server";
import { defaultContext } from "@/lib/domain/context";
import { createEmptyBundle } from "@/lib/domain/plan";
import { getEpisode, getVersion, saveVersionBundle } from "@/services/clinic-service";

/** Starts an empty plan for an episode, for clinicians who enter instructions manually (e.g. when AI is unavailable). */
export const POST = handle(async (_req: Request, ctx: RouteContext<"/api/clinic/episodes/[id]/plan">) => {
  const { id } = await ctx.params;
  const clinic = await requireClinic("plans.edit");
  const episode = await getEpisode(clinic, id);
  const domainCtx = defaultContext();
  const title = `${episode.title} — recovery plan`.slice(0, 120);
  const created = await rpc<Array<{ plan_id: string; version_id: string }>>(
    clinic,
    "create_recovery_plan",
    { p_episode: episode.id, p_title: title, p_bundle: createEmptyBundle(crypto.randomUUID(), title, domainCtx) },
    "create the recovery plan",
  );
  const { plan_id, version_id } = created[0];
  // Align the bundle's plan id with the database id.
  const version = await getVersion(clinic, version_id);
  await saveVersionBundle(clinic, version, { ...version.bundle, plan: { ...version.bundle.plan, id: plan_id } });
  return ok({ plan_id, version_id }, { status: 201 });
});
