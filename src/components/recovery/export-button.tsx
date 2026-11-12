"use client";

import { FileDown, Loader2 } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { usePlan } from "@/hooks/use-plan";
import { ClientError } from "@/lib/client/http";

export function ExportButton({ variant = "outline" }: { variant?: "outline" | "default" }) {
  const { backend, bundle } = usePlan();
  const [busy, setBusy] = useState(false);
  if (!bundle) return null;

  const download = async () => {
    setBusy(true);
    try {
      const blob = await backend.exportPdf(bundle);
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `aftercare-summary-${new Date().toISOString().slice(0, 10)}.pdf`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 10_000);
      toast.success("Recovery summary downloaded");
    } catch (err) {
      toast.error(err instanceof ClientError ? err.message : "We could not create the PDF. Please try again.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Button variant={variant} onClick={download} disabled={busy} data-testid="export-pdf">
      {busy ? <Loader2 className="animate-spin" aria-hidden /> : <FileDown aria-hidden />}
      {busy ? "Preparing PDF…" : "Export PDF summary"}
    </Button>
  );
}
