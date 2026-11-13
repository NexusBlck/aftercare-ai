"use client";

import { ArrowRight, ClipboardCheck } from "lucide-react";
import Link from "next/link";
import { ClinicPageHeader, EmptyState, ErrorState, formatDate, LoadingRows, Pill, Section, VersionStatus } from "@/components/clinic/ui";
import { useApi } from "@/components/clinic/use-api";

interface Queue {
  items: Array<{
    id: string;
    version: number;
    status: string;
    submitted_at: string | null;
    submitted_by_name: string | null;
    updated_at: string;
    open_flags: number;
    plan: { id: string; title: string; approved_version_id: string | null; patient: { id: string; full_name: string; mrn: string | null } | null } | null;
  }>;
}

function Row({ v }: { v: Queue["items"][number] }) {
  return (
    <li>
      <Link href={`/clinic/plans/${v.plan?.id}`} className="flex flex-col gap-2 py-3.5 hover:text-teal sm:flex-row sm:items-center sm:justify-between">
        <span className="min-w-0">
          <span className="block font-semibold">{v.plan?.patient?.full_name ?? "Patient"}</span>
          <span className="block truncate text-sm text-muted-foreground">
            {v.plan?.title} · v{v.version}
            {v.plan?.approved_version_id ? " · revision of an approved plan" : ""}
            {v.submitted_at ? ` · submitted ${formatDate(v.submitted_at, true)}${v.submitted_by_name ? ` by ${v.submitted_by_name}` : ""}` : ` · last edited ${formatDate(v.updated_at, true)}`}
          </span>
        </span>
        <span className="flex shrink-0 items-center gap-2">
          {v.open_flags > 0 && <Pill tone="amber">{v.open_flags} open {v.open_flags === 1 ? "flag" : "flags"}</Pill>}
          <VersionStatus status={v.status} />
          <ArrowRight className="size-4" aria-hidden />
        </span>
      </Link>
    </li>
  );
}

export default function ReviewQueuePage() {
  const { data, error, loading, reload } = useApi<Queue>("/api/clinic/review");
  const pending = data?.items.filter((i) => i.status === "pending_review") ?? [];
  const preparing = data?.items.filter((i) => i.status !== "pending_review") ?? [];
  return (
    <>
      <ClinicPageHeader title="Clinical review" description="Recovery plans waiting for a clinician's decision, oldest first, and drafts still being prepared." />
      {error && <ErrorState error={error} onRetry={reload} />}
      {loading && !data && <LoadingRows />}
      {data && (
        <div className="space-y-6">
          <Section title={`Awaiting a decision (${pending.length})`}>
            {pending.length === 0 ? (
              <EmptyState icon={<ClipboardCheck className="size-5" aria-hidden />} title="Nothing to review" description="When staff submit a plan for review it appears here." />
            ) : (
              <ul className="divide-y">{pending.map((v) => <Row key={v.id} v={v} />)}</ul>
            )}
          </Section>
          <Section title={`In preparation (${preparing.length})`} description="Drafts and versions returned with requested changes.">
            {preparing.length === 0 ? <p className="text-sm text-muted-foreground">No drafts in progress.</p> : <ul className="divide-y">{preparing.map((v) => <Row key={v.id} v={v} />)}</ul>}
          </Section>
        </div>
      )}
    </>
  );
}
