"use client";

import { ClinicPageHeader, ErrorState, formatDate, LoadingRows, Pill, Section } from "@/components/clinic/ui";
import { useApi } from "@/components/clinic/use-api";
import { Progress } from "@/components/ui/progress";

interface Billing {
  entitlements: { plan: string; status: string; active: boolean; trial_ends_at: string | null; limits: Record<string, number | boolean | null>; usage: Record<string, number> };
  subscription: { plan: string; status: string; trial_ends_at: string | null; current_period_start: string | null; current_period_end: string | null };
  events: Array<{ id: string; kind: string; amount_minor: number; currency: string; reference: string | null; description: string | null; occurred_at: string }>;
}

const PLAN_NAMES: Record<string, string> = { starter: "Starter", professional: "Professional", enterprise: "Enterprise" };
const USAGE: Array<[string, string]> = [
  ["active_patients", "Active patients"],
  ["staff", "Staff accounts (incl. pending invitations)"],
  ["episodes_per_month", "Care episodes this month"],
  ["storage_mb", "Document storage (MB)"],
];
const FEATURES: Array<[string, string]> = [
  ["advanced_analytics", "Advanced analytics"],
  ["custom_branding", "Custom branding"],
  ["integrations", "Integrations"],
];

export default function BillingPage() {
  const { data, error, loading, reload } = useApi<Billing>("/api/clinic/billing");
  return (
    <>
      <ClinicPageHeader
        title="Subscription"
        description="Plans are configured by the AFTERCARE AI team during the pilot. Online payment is not enabled yet, and card details are never collected in this app."
      />
      {error && <ErrorState error={error} onRetry={reload} />}
      {loading && !data && <LoadingRows />}
      {data && (
        <div className="grid gap-6 lg:grid-cols-2">
          <Section title="Current plan">
            <p className="font-heading text-2xl font-extrabold">{PLAN_NAMES[data.subscription.plan] ?? data.subscription.plan}</p>
            <div className="mt-2 flex flex-wrap gap-2">
              <Pill tone={data.entitlements.active ? "teal" : "danger"}>{data.subscription.status.replace("_", " ")}</Pill>
              {data.subscription.trial_ends_at && <Pill>Trial ends {formatDate(data.subscription.trial_ends_at)}</Pill>}
            </div>
            {data.subscription.current_period_end && <p className="mt-3 text-sm text-muted-foreground">Current period ends {formatDate(data.subscription.current_period_end)}</p>}
            <ul className="mt-4 space-y-1 text-sm">
              {FEATURES.map(([k, label]) => (
                <li key={k}>
                  {data.entitlements.limits[k] ? "✓" : "—"} {label}
                </li>
              ))}
            </ul>
            <p className="mt-4 text-sm text-muted-foreground">To change plan, contact the AFTERCARE AI team.</p>
          </Section>
          <Section title="Usage">
            <ul className="space-y-4">
              {USAGE.map(([k, label]) => {
                const used = data.entitlements.usage[k] ?? 0;
                const limit = data.entitlements.limits[k];
                const pct = typeof limit === "number" && limit > 0 ? Math.min(100, Math.round((used / limit) * 100)) : 0;
                return (
                  <li key={k}>
                    <div className="flex justify-between text-sm">
                      <span>{label}</span>
                      <span className="font-semibold tabular-nums">
                        {used} / {typeof limit === "number" ? limit : "Unlimited"}
                      </span>
                    </div>
                    {typeof limit === "number" && <Progress value={pct} className="mt-1.5" aria-label={`${label} usage`} />}
                  </li>
                );
              })}
            </ul>
          </Section>
          <Section title="Billing history" className="lg:col-span-2">
            {data.events.length === 0 ? (
              <p className="text-sm text-muted-foreground">No billing records yet.</p>
            ) : (
              <ul className="divide-y text-sm">
                {data.events.map((e) => (
                  <li key={e.id} className="flex justify-between gap-3 py-2">
                    <span>
                      {formatDate(e.occurred_at)} · {e.kind} {e.reference ? `· ${e.reference}` : ""}
                    </span>
                    <span className="font-semibold tabular-nums">
                      {(e.amount_minor / 100).toLocaleString("en-PK", { minimumFractionDigits: 2 })} {e.currency}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </Section>
        </div>
      )}
    </>
  );
}
