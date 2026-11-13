import { handle, ok } from "@/lib/api/route-utils";
import { mapDbError } from "@/lib/clinic/db-errors";
import { requireClinic, rpc } from "@/lib/clinic/server";

/**
 * Subscription and billing history (read-only). Plans are configured manually by the operator until a
 * payment provider that supports Pakistani businesses is chosen; no card data is ever collected here.
 */
export const GET = handle(async () => {
  const ctx = await requireClinic("billing.read");
  const [entitlements, subscription, events] = await Promise.all([
    rpc<Record<string, unknown>>(ctx, "organization_entitlements", { p_org: ctx.orgId }, "load the subscription"),
    ctx.supabase.from("subscriptions").select("plan, status, trial_ends_at, current_period_start, current_period_end, updated_at").eq("organization_id", ctx.orgId).single(),
    ctx.supabase.from("billing_events").select("id, kind, amount_minor, currency, reference, description, occurred_at").eq("organization_id", ctx.orgId).order("occurred_at", { ascending: false }).limit(50),
  ]);
  if (subscription.error) throw mapDbError(subscription.error, "load the subscription");
  return ok({ entitlements, subscription: subscription.data, events: events.data ?? [] });
});
