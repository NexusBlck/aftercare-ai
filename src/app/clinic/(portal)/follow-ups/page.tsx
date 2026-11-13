"use client";

import { CalendarClock } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { toast } from "sonner";
import { useClinic } from "@/components/clinic/clinic-context";
import { ClinicPageHeader, EmptyState, ErrorState, formatDate, LoadingRows, NativeSelect, Pill } from "@/components/clinic/ui";
import { send, useApi } from "@/components/clinic/use-api";
import { ClientError } from "@/lib/client/http";

interface FollowUps {
  items: Array<{
    plan_id: string;
    patient_id: string;
    patient_name: string;
    due: "overdue" | "upcoming" | "later" | "undated" | "done";
    patient_status: string;
    patient_note: string | null;
    staff_status: string;
    item: { id: string; specialty: string | null; clinician: string | null; scheduled_date: string | null; scheduled_time: string | null; investigation: string | null };
  }>;
}

const DUE: Record<string, { label: string; tone: "danger" | "amber" | "neutral" | "teal" }> = {
  overdue: { label: "Overdue", tone: "danger" },
  upcoming: { label: "Next 14 days", tone: "amber" },
  later: { label: "Later", tone: "neutral" },
  undated: { label: "No date documented", tone: "neutral" },
  done: { label: "Closed", tone: "teal" },
};

const PATIENT: Record<string, string> = {
  reported_attended: "Patient reports attended",
  reported_missed: "Patient reports missed",
  reported_rescheduled: "Patient reports rescheduled",
};

export default function FollowUpsPage() {
  const { can } = useClinic();
  const { data, error, loading, reload } = useApi<FollowUps>("/api/clinic/follow-ups");
  const [filter, setFilter] = useState("attention");
  const items = (data?.items ?? []).filter((f) => (filter === "attention" ? f.due === "overdue" || f.due === "upcoming" || f.due === "undated" : filter === "all" ? true : f.due === filter));

  const verify = async (f: FollowUps["items"][number], status: string) => {
    try {
      await send("/api/clinic/follow-ups", "POST", { plan_id: f.plan_id, item_id: f.item.id, status });
      toast.success("Follow-up updated.");
      await reload();
    } catch (err) {
      toast.error(err instanceof ClientError ? err.message : "We could not update the follow-up.");
    }
  };

  return (
    <>
      <ClinicPageHeader
        title="Follow-ups"
        description="Documented appointments from approved plans. Patient reports are shown separately from attendance verified by staff. AFTERCARE AI does not book appointments."
      />
      <div className="mb-4 max-w-xs">
        <NativeSelect value={filter} onChange={(e) => setFilter(e.target.value)} aria-label="Filter follow-ups">
          <option value="attention">Needs attention</option>
          <option value="overdue">Overdue</option>
          <option value="upcoming">Next 14 days</option>
          <option value="later">Later</option>
          <option value="done">Closed</option>
          <option value="all">All</option>
        </NativeSelect>
      </div>
      {error && <ErrorState error={error} onRetry={reload} />}
      {loading && !data && <LoadingRows />}
      {data && items.length === 0 && <EmptyState icon={<CalendarClock className="size-5" aria-hidden />} title="No follow-ups in this view" description="Follow-ups appear when an approved plan contains documented appointments." />}
      {items.length > 0 && (
        <ul className="divide-y rounded-2xl border bg-card">
          {items.map((f) => (
            <li key={`${f.plan_id}-${f.item.id}`} className="flex flex-col gap-3 px-5 py-4 lg:flex-row lg:items-center lg:justify-between">
              <div className="min-w-0">
                <Link href={`/clinic/patients/${f.patient_id}`} className="font-semibold hover:text-teal">
                  {f.patient_name}
                </Link>
                <p className="text-sm text-muted-foreground">
                  {[f.item.specialty, f.item.clinician, f.item.investigation].filter(Boolean).join(" · ") || "Follow-up"} · {formatDate(f.item.scheduled_date)}
                  {f.item.scheduled_time ? ` at ${f.item.scheduled_time}` : ""}
                </p>
                <div className="mt-1.5 flex flex-wrap gap-1.5">
                  <Pill tone={DUE[f.due].tone}>{DUE[f.due].label}</Pill>
                  {PATIENT[f.patient_status] && <Pill tone="navy">{PATIENT[f.patient_status]}</Pill>}
                  {f.patient_note && <span className="text-xs text-muted-foreground">“{f.patient_note}”</span>}
                </div>
              </div>
              {can("followups.verify") && (
                <label className="flex shrink-0 items-center gap-2 text-sm">
                  <span className="text-muted-foreground">Verified status</span>
                  <NativeSelect value={f.staff_status} onChange={(e) => void verify(f, e.target.value)} className="w-48">
                    <option value="unverified">Not verified</option>
                    <option value="verified_attended">Attended (verified)</option>
                    <option value="verified_missed">Missed (verified)</option>
                    <option value="cancelled">Cancelled</option>
                  </NativeSelect>
                </label>
              )}
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
