"use client";

import { ArrowRight, CalendarDays, ClipboardCheck, FileDown, Hospital, ListChecks, Pill } from "lucide-react";
import Link from "next/link";
import { PageHeader, PlanGate } from "@/components/app/plan-gate";
import { ExportButton } from "@/components/recovery/export-button";
import { TaskCard } from "@/components/recovery/cards";
import { DoctorQuestionsPanel, Panel, TimelinePanel, WarningSignsPanel } from "@/components/recovery/panels";
import { StatusBadge } from "@/components/shared/status";
import { Button } from "@/components/ui/button";
import { usePlan } from "@/hooks/use-plan";
import { formatDateOnly, formatLongDate, todayIso } from "@/lib/domain/dates";
import { effectiveFollowUpDate, planOverview, todaysTasks } from "@/lib/domain/summary";

function greeting() {
  const h = new Date().getHours();
  return h < 12 ? "Good morning" : h < 18 ? "Good afternoon" : "Good evening";
}

export default function DashboardPage() {
  const { profile } = usePlan();
  return (
    <PlanGate>
      {(bundle) => {
        const today = todayIso();
        const o = planOverview(bundle, today);
        const tasks = todaysTasks(bundle, today);
        const done = tasks.filter((t) => t.completed).length;
        const hasDocs = bundle.documents.length > 0;
        const next = o.nextFollowUp;

        return (
          <>
            <PageHeader
              title={`${greeting()}${profile.display_name ? `, ${profile.display_name}` : ""}`}
              description={
                <>
                  {formatLongDate(today)} · <span className="font-medium text-foreground">{bundle.plan.title}</span>
                  {bundle.plan.is_sample && <span className="ml-2 rounded bg-amber-soft px-1.5 py-0.5 text-xs font-semibold text-amber">Sample data</span>}
                </>
              }
              actions={<ExportButton />}
            />

            {!hasDocs && (
              <div className="mb-6 flex flex-col gap-3 rounded-2xl border border-teal/30 bg-teal-soft/60 p-5 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <p className="font-semibold">Add your discharge documents to build your plan</p>
                  <p className="text-sm text-muted-foreground">Upload a discharge summary, prescription, wound-care sheet or follow-up letter.</p>
                </div>
                <Button asChild>
                  <Link href="/documents">
                    Upload documents <ArrowRight aria-hidden />
                  </Link>
                </Button>
              </div>
            )}

            {(o.needsReview > 0 || o.openConflicts > 0) && (
              <Link
                href="/review"
                className="mb-6 flex items-center gap-4 rounded-2xl border border-amber/30 bg-amber-soft p-4 transition-colors hover:bg-amber-soft/70 sm:p-5"
              >
                <ClipboardCheck className="size-6 shrink-0 text-amber" aria-hidden />
                <div className="min-w-0 flex-1">
                  <p className="font-semibold text-foreground">
                    {o.needsReview} item{o.needsReview === 1 ? "" : "s"} need{o.needsReview === 1 ? "s" : ""} your review
                    {o.openConflicts > 0 && ` · ${o.openConflicts} conflict${o.openConflicts === 1 ? "" : "s"} to discuss with your care team`}
                  </p>
                  <p className="text-sm text-muted-foreground">Check what was extracted against your documents before relying on it.</p>
                </div>
                <ArrowRight className="size-5 shrink-0 text-amber" aria-hidden />
              </Link>
            )}

            <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
              <Stat icon={<Hospital className="size-4" aria-hidden />} label="Discharged" value={bundle.plan.discharge_date ? formatDateOnly(bundle.plan.discharge_date) : "Not documented"} sub={bundle.plan.procedure ?? undefined} />
              <Stat
                icon={<CalendarDays className="size-4" aria-hidden />}
                label="Next appointment"
                value={next ? formatDateOnly(effectiveFollowUpDate(next)) : o.undatedFollowUps > 0 ? "Date not stated" : "None found"}
                sub={next ? (next.specialty ?? undefined) : undefined}
                href="/appointments"
              />
              <Stat icon={<ListChecks className="size-4" aria-hidden />} label="Today’s checklist" value={tasks.length ? `${done} of ${tasks.length} done` : "No tasks"} href="/recovery-plan" />
              <Stat icon={<Pill className="size-4" aria-hidden />} label="Medications confirmed" value={`${o.confirmedMedications} of ${o.totalMedications}`} href="/medications" />
            </div>

            <div className="mt-6 grid gap-6 xl:grid-cols-[minmax(0,1fr)_minmax(0,380px)]">
              <div className="space-y-6">
                <Panel
                  title="Today’s checklist"
                  icon={<ListChecks className="size-5 text-teal" aria-hidden />}
                  action={
                    <Button asChild size="sm" variant="ghost">
                      <Link href="/recovery-plan">Full plan</Link>
                    </Button>
                  }
                >
                  {tasks.length === 0 ? (
                    <p className="text-sm text-muted-foreground">No wound-care, activity or diet instructions have been found yet.</p>
                  ) : (
                    <div className="space-y-3">
                      {tasks.map((t) => (
                        <TaskCard key={t.id} task={t} showReview={false} showPlain={false} />
                      ))}
                    </div>
                  )}
                  <p className="mt-4 text-xs text-muted-foreground">
                    Ticking a task is for your own tracking. It does not mean your recovery is on track — follow your care team’s advice and watch for the warning signs.
                  </p>
                </Panel>

                <Panel
                  title="Medications"
                  icon={<Pill className="size-5 text-teal" aria-hidden />}
                  action={
                    <Button asChild size="sm" variant="ghost">
                      <Link href="/medications">Details</Link>
                    </Button>
                  }
                >
                  {bundle.medications.length === 0 ? (
                    <p className="text-sm text-muted-foreground">No medications found yet.</p>
                  ) : (
                    <ul className="divide-y">
                      {bundle.medications.map((m) => (
                        <li key={m.id} className="flex flex-wrap items-center justify-between gap-2 py-3 first:pt-0 last:pb-0">
                          <div className="min-w-0">
                            <p className="font-semibold">
                              {m.name} {m.strength && <span className="text-muted-foreground">{m.strength}</span>}
                            </p>
                            <p className="text-sm text-muted-foreground">
                              {[m.dose, m.frequency].filter(Boolean).join(" · ") || "Dose and frequency not stated"}
                            </p>
                          </div>
                          <StatusBadge status={m.verification_status} />
                        </li>
                      ))}
                    </ul>
                  )}
                  <p className="mt-4 text-xs text-muted-foreground">No dose times are created by AFTERCARE AI. Follow the schedule your prescriber or pharmacist gave you.</p>
                </Panel>

                <TimelinePanel bundle={bundle} />
              </div>

              <div className="space-y-6">
                <WarningSignsPanel bundle={bundle} compact />
                <DoctorQuestionsPanel bundle={bundle} />
                <Link href="/documents" className="flex items-center gap-3 rounded-2xl border bg-card p-5 text-sm transition-colors hover:bg-muted/50">
                  <FileDown className="size-5 text-teal" aria-hidden />
                  <span className="flex-1">
                    <span className="block font-semibold">{bundle.documents.length} document{bundle.documents.length === 1 ? "" : "s"}</span>
                    <span className="text-muted-foreground">View, add or remove your documents</span>
                  </span>
                  <ArrowRight className="size-4 text-muted-foreground" aria-hidden />
                </Link>
              </div>
            </div>
          </>
        );
      }}
    </PlanGate>
  );
}

function Stat({ icon, label, value, sub, href }: { icon: React.ReactNode; label: string; value: string; sub?: string; href?: string }) {
  const body = (
    <>
      <p className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
        {icon}
        {label}
      </p>
      <p className="mt-2 text-lg leading-tight font-bold break-words">{value}</p>
      {sub && <p className="mt-0.5 truncate text-xs text-muted-foreground">{sub}</p>}
    </>
  );
  const cls = "block rounded-2xl border bg-card p-4 min-w-0";
  return href ? (
    <Link href={href} className={`${cls} transition-colors hover:bg-muted/50`}>
      {body}
    </Link>
  ) : (
    <div className={cls}>{body}</div>
  );
}
