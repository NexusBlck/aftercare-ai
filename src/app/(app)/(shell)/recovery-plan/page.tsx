"use client";

import { PageHeader, PlanGate } from "@/components/app/plan-gate";
import { ExportButton } from "@/components/recovery/export-button";
import { TaskCard } from "@/components/recovery/cards";
import { DoctorQuestionsPanel, TimelinePanel, WarningSignsPanel } from "@/components/recovery/panels";
import { Field } from "@/components/shared/status";
import { formatDateOnly } from "@/lib/domain/dates";
import { effectiveFollowUpDate, planOverview, TASK_CATEGORY_LABEL } from "@/lib/domain/summary";
import type { TaskCategory } from "@/schemas/domain";

const CATEGORY_HINT: Record<TaskCategory, string> = {
  wound_care: "Exactly as documented. AFTERCARE AI does not add cleaning methods or dressing schedules.",
  activity: "Restrictions and permitted activities from your documents.",
  diet: "Food and fluid instructions from your documents.",
  other: "Other documented instructions.",
};

export default function RecoveryPlanPage() {
  return (
    <PlanGate>
      {(bundle) => {
        const o = planOverview(bundle);
        const categories = (Object.keys(TASK_CATEGORY_LABEL) as TaskCategory[]).filter((c) => bundle.tasks.some((t) => t.category === c));
        return (
          <>
            <PageHeader
              title="Recovery plan"
              description="Your documented instructions, organized. Tick tasks to keep track — ticking does not mean you are recovering normally."
              actions={<ExportButton />}
            />

            <section className="mb-8 rounded-2xl border bg-card p-5 sm:p-6" aria-label="Plan overview">
              <h2 className="text-lg font-bold">{bundle.plan.title}</h2>
              <dl className="mt-4 grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-6">
                <Field label="Procedure" value={bundle.plan.procedure} />
                <Field label="Diagnosis" value={bundle.plan.diagnosis} />
                <Field label="Discharge date" value={bundle.plan.discharge_date ? formatDateOnly(bundle.plan.discharge_date) : null} />
                <Field label="Plan status" value={bundle.plan.is_sample ? "Sample" : bundle.plan.status === "active" ? "Active" : "Draft — add documents"} />
                <Field label="Pending tasks" value={String(o.tasksPending)} />
                <Field
                  label="Upcoming follow-up"
                  value={
                    o.nextFollowUp
                      ? `${formatDateOnly(effectiveFollowUpDate(o.nextFollowUp))}${o.nextFollowUp.specialty ? ` · ${o.nextFollowUp.specialty}` : ""}`
                      : null
                  }
                />
              </dl>
            </section>

            <div className="grid gap-8 xl:grid-cols-[minmax(0,1fr)_minmax(0,360px)]">
              <div className="space-y-10">
                {categories.length === 0 && (
                  <p className="rounded-xl border border-dashed p-6 text-sm text-muted-foreground">
                    No recovery instructions yet. Upload and process your documents to build your plan.
                  </p>
                )}
                {categories.map((c) => {
                  const tasks = bundle.tasks.filter((t) => t.category === c);
                  return (
                    <section key={c} aria-labelledby={`cat-${c}`}>
                      <h2 id={`cat-${c}`} className="text-xl font-bold">
                        {TASK_CATEGORY_LABEL[c]}{" "}
                        <span className="text-base font-normal text-muted-foreground">
                          ({tasks.filter((t) => t.completed).length}/{tasks.length} done)
                        </span>
                      </h2>
                      <p className="mb-3 text-sm text-muted-foreground">{CATEGORY_HINT[c]}</p>
                      <div className="space-y-3">
                        {tasks.map((t) => (
                          <TaskCard key={t.id} task={t} />
                        ))}
                      </div>
                    </section>
                  );
                })}
              </div>
              <div className="space-y-6">
                <WarningSignsPanel bundle={bundle} />
                <TimelinePanel bundle={bundle} />
                <DoctorQuestionsPanel bundle={bundle} />
              </div>
            </div>
          </>
        );
      }}
    </PlanGate>
  );
}
