"use client";

import { Download, Loader2 } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { LegalLinks } from "@/components/legal/site-footer";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
import { usePlan } from "@/hooks/use-plan";
import { formatTimestamp } from "@/lib/domain/dates";
import { ClientError } from "@/lib/client/http";
import type { LegalStatus } from "@/schemas/legal";

const DOC_LABEL: Record<string, string> = {
  terms: "Terms of service",
  privacy: "Privacy policy",
  health_data: "Health-data consent",
};

/** Data download, marketing preference (unsubscribe) and a record of the user's agreements. */
export function DataAndAgreements() {
  const { backend, mode } = usePlan();
  const [status, setStatus] = useState<LegalStatus | null>(null);
  const [downloading, setDownloading] = useState(false);

  useEffect(() => {
    backend.legalStatus().then(setStatus, () => setStatus(null));
  }, [backend]);

  const download = async () => {
    setDownloading(true);
    try {
      const blob = await backend.exportData();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `aftercare-my-data-${new Date().toISOString().slice(0, 10)}.json`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 10_000);
      toast.success("Your data was downloaded");
    } catch (err) {
      toast.error(err instanceof ClientError ? err.message : "We could not prepare your data. Please try again.");
    } finally {
      setDownloading(false);
    }
  };

  const toggleMarketing = async (optIn: boolean) => {
    try {
      setStatus(await backend.setMarketing(optIn));
      toast.success(optIn ? "Subscribed to product updates" : "Unsubscribed from product updates");
    } catch (err) {
      toast.error(err instanceof ClientError ? err.message : "We could not save your preference.");
    }
  };

  return (
    <section className="rounded-2xl border bg-card p-5 sm:p-6 lg:col-span-2" aria-labelledby="data-agreements-title">
      <h2 id="data-agreements-title" className="text-lg font-bold">
        Your data and agreements
      </h2>
      <div className="mt-4 grid gap-6 md:grid-cols-2">
        <div>
          <h3 className="text-sm font-semibold">Download my data</h3>
          <p className="mt-1 text-sm text-muted-foreground">
            A machine-readable copy (JSON) of everything we hold about you
            {mode === "account" ? ": profile, agreements, plans, extracted information, corrections and links to your files." : " in this browser."}
          </p>
          <Button variant="outline" className="mt-3" onClick={download} disabled={downloading} data-testid="download-my-data">
            {downloading ? <Loader2 className="animate-spin" aria-hidden /> : <Download aria-hidden />}
            Download my data
          </Button>

          {mode === "account" && (
            <div className="mt-6">
              <h3 className="text-sm font-semibold">Product update emails</h3>
              <label className="mt-2 flex items-center gap-3 text-sm">
                <Switch
                  checked={status?.marketing_opt_in ?? false}
                  onCheckedChange={toggleMarketing}
                  disabled={!status}
                  aria-label="Receive product update emails"
                />
                {status?.marketing_opt_in ? "Subscribed. Switch off to unsubscribe." : "Not subscribed"}
              </label>
              <p className="mt-1 text-xs text-muted-foreground">
                Optional and separate from the terms. Account emails such as email confirmation are always sent.
              </p>
            </div>
          )}
        </div>
        <div>
          <h3 className="text-sm font-semibold">Agreements you accepted</h3>
          {!status ? (
            <p className="mt-1 text-sm text-muted-foreground">Loading…</p>
          ) : status.accepted.length === 0 ? (
            <p className="mt-1 text-sm text-muted-foreground">No agreements recorded.</p>
          ) : (
            <ul className="mt-2 space-y-1.5 text-sm" data-testid="agreements-list">
              {status.accepted.map((a) => (
                <li key={`${a.document}-${a.version}`} className="flex flex-wrap justify-between gap-x-3">
                  <span>
                    {DOC_LABEL[a.document] ?? a.document} <span className="text-muted-foreground">v{a.version}</span>
                  </span>
                  <span className="text-muted-foreground">
                    {formatTimestamp(a.accepted_at)} · {a.source === "signup" ? "at sign-up" : "in app"}
                  </span>
                </li>
              ))}
            </ul>
          )}
          <LegalLinks className="mt-4 text-muted-foreground" />
        </div>
      </div>
    </section>
  );
}
