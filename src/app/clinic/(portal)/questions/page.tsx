"use client";

import { MessageSquareText } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { ClinicPageHeader, EmptyState, ErrorState, formatDate, LoadingRows, NativeSelect, Pill } from "@/components/clinic/ui";
import { useApi } from "@/components/clinic/use-api";

interface Questions {
  items: Array<{ id: string; subject: string; status: string; urgent_keywords: boolean; updated_at: string; assigned_to_name: string | null; patient: { id: string; full_name: string } | null }>;
}

export default function QuestionsPage() {
  const [status, setStatus] = useState("open");
  const { data, error, loading, reload } = useApi<Questions>(`/api/clinic/questions?status=${status}`);
  return (
    <>
      <ClinicPageHeader
        title="Patient questions"
        description="Messages from linked patients. This is not an emergency service; patients are told to call emergency services for urgent symptoms."
      />
      <div className="mb-4 max-w-xs">
        <NativeSelect value={status} onChange={(e) => setStatus(e.target.value)} aria-label="Filter questions">
          <option value="open">Open</option>
          <option value="responded">Responded</option>
          <option value="closed">Closed</option>
          <option value="all">All</option>
        </NativeSelect>
      </div>
      {error && <ErrorState error={error} onRetry={reload} />}
      {loading && !data && <LoadingRows />}
      {data && data.items.length === 0 && <EmptyState icon={<MessageSquareText className="size-5" aria-hidden />} title="No questions in this view" />}
      {data && data.items.length > 0 && (
        <ul className="divide-y rounded-2xl border bg-card">
          {data.items.map((q) => (
            <li key={q.id}>
              <Link href={`/clinic/questions/${q.id}`} className="flex flex-col gap-2 px-5 py-4 hover:bg-secondary/30 sm:flex-row sm:items-center sm:justify-between">
                <span className="min-w-0">
                  <span className="block truncate font-semibold">{q.subject}</span>
                  <span className="block text-sm text-muted-foreground">
                    {q.patient?.full_name ?? "Patient"} · updated {formatDate(q.updated_at, true)}
                    {q.assigned_to_name ? ` · assigned to ${q.assigned_to_name}` : ""}
                  </span>
                </span>
                <span className="flex shrink-0 gap-1.5">
                  {q.urgent_keywords && <Pill tone="danger">Possible urgent symptoms</Pill>}
                  <Pill tone={q.status === "new" ? "amber" : q.status === "responded" ? "teal" : "neutral"}>{q.status.replace("_", " ")}</Pill>
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
