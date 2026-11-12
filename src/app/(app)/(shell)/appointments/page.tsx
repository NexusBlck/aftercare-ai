"use client";

import { PageHeader, PlanGate } from "@/components/app/plan-gate";
import { FollowUpCard } from "@/components/recovery/cards";
import { compareIsoDates, todayIso } from "@/lib/domain/dates";
import { effectiveFollowUpDate } from "@/lib/domain/summary";

export default function AppointmentsPage() {
  return (
    <PlanGate>
      {(bundle) => {
        const today = todayIso();
        const withDate = bundle.follow_ups.map((f) => ({ f, date: effectiveFollowUpDate(f) }));
        const upcoming = withDate
          .filter(({ f, date }) => f.status !== "attended" && date !== null && compareIsoDates(date, today) >= 0)
          .sort((a, b) => compareIsoDates(a.date as string, b.date as string));
        const undated = withDate.filter(({ f, date }) => date === null && f.status !== "attended");
        const past = withDate.filter(({ f, date }) => f.status === "attended" || (date !== null && compareIsoDates(date, today) < 0));
        const groups = [
          ["Upcoming", upcoming, "Appointments with a documented date that is today or later."],
          ["Date not documented", undated, "Your documents mention these but give no date. Contact the clinic to confirm."],
          ["Past or attended", past, ""],
        ] as const;
        return (
          <>
            <PageHeader
              title="Follow-up appointments"
              description="Appointments and investigations from your documents. Marking one as attended or rescheduled is your own record — the documented details are never changed."
            />
            {bundle.follow_ups.length === 0 && (
              <p className="rounded-xl border border-dashed p-6 text-center text-sm text-muted-foreground">No follow-up appointments found in your documents yet.</p>
            )}
            <div className="space-y-10">
              {groups.map(([title, list, hint]) =>
                list.length === 0 ? null : (
                  <section key={title} aria-label={title}>
                    <h2 className="text-xl font-bold">{title}</h2>
                    {hint && <p className="mb-3 text-sm text-muted-foreground">{hint}</p>}
                    <div className="mt-3 grid gap-4 xl:grid-cols-2">
                      {list.map(({ f }) => (
                        <FollowUpCard key={f.id} followUp={f} />
                      ))}
                    </div>
                  </section>
                ),
              )}
            </div>
          </>
        );
      }}
    </PlanGate>
  );
}
