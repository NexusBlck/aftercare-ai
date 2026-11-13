"use client";

import { ChevronLeft, ChevronRight } from "lucide-react";
import { useState } from "react";
import { ClinicPageHeader, EmptyState, ErrorState, formatDate, LoadingRows } from "@/components/clinic/ui";
import { useApi } from "@/components/clinic/use-api";
import { Button } from "@/components/ui/button";
import { actionLabel } from "@/lib/clinic/labels";

interface Audit {
  items: Array<{ id: number; action: string; resource_type: string; resource_id: string | null; metadata: Record<string, unknown>; created_at: string; actor: string }>;
  total: number;
  page: number;
  pageSize: number;
}

export default function AuditPage() {
  const [page, setPage] = useState(1);
  const { data, error, loading, reload } = useApi<Audit>(`/api/clinic/audit?page=${page}`);
  const pages = data ? Math.max(1, Math.ceil(data.total / data.pageSize)) : 1;
  return (
    <>
      <ClinicPageHeader title="Audit log" description="A permanent record of important actions in this clinic. Entries cannot be edited or deleted and contain no medical content." />
      {error && <ErrorState error={error} onRetry={reload} />}
      {loading && !data && <LoadingRows rows={8} />}
      {data && data.items.length === 0 && <EmptyState title="No entries yet" />}
      {data && data.items.length > 0 && (
        <div className="overflow-x-auto rounded-2xl border bg-card">
          <table className="w-full min-w-[40rem] text-left text-sm">
            <caption className="sr-only">Audit log</caption>
            <thead className="border-b bg-secondary/50 text-xs tracking-wide text-muted-foreground uppercase">
              <tr>
                <th scope="col" className="px-4 py-3">When</th>
                <th scope="col" className="px-4 py-3">Who</th>
                <th scope="col" className="px-4 py-3">What</th>
                <th scope="col" className="px-4 py-3">Details</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {data.items.map((e) => (
                <tr key={e.id}>
                  <td className="px-4 py-2.5 whitespace-nowrap text-muted-foreground">{formatDate(e.created_at, true)}</td>
                  <td className="px-4 py-2.5">{e.actor}</td>
                  <td className="px-4 py-2.5 font-medium">{actionLabel(e.action)}</td>
                  <td className="px-4 py-2.5 text-xs text-muted-foreground">
                    {Object.entries(e.metadata)
                      .map(([k, v]) => `${k.replace(/_/g, " ")}: ${String(v)}`)
                      .join(" · ")}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="flex items-center justify-end gap-2 border-t px-4 py-3 text-sm">
            <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage((p) => p - 1)} aria-label="Previous page">
              <ChevronLeft aria-hidden />
            </Button>
            <span aria-live="polite">
              Page {page} of {pages}
            </span>
            <Button variant="outline" size="sm" disabled={page >= pages} onClick={() => setPage((p) => p + 1)} aria-label="Next page">
              <ChevronRight aria-hidden />
            </Button>
          </div>
        </div>
      )}
    </>
  );
}
