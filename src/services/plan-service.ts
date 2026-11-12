import "server-only";
import type { AuthedContext } from "@/lib/supabase/server";
import type { PlanBundle } from "@/schemas/domain";
import { loadBundle, persistDiff } from "./plan-repository";

/**
 * Load → apply a pure domain function → persist the diff. This is how every account-mode
 * mutation reuses exactly the same rules as demo mode.
 */
export async function mutatePlan(
  ctx: AuthedContext,
  planId: string,
  fn: (bundle: PlanBundle) => PlanBundle | Promise<PlanBundle>,
): Promise<PlanBundle> {
  const before = await loadBundle(ctx.supabase, ctx.user.id, planId);
  const after = await fn(before);
  await persistDiff(ctx.supabase, ctx.user.id, before, after);
  return after;
}
