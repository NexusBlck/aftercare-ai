"use client";

import { AlertOctagon, BadgeCheck, CalendarDays, CheckCircle2, ListChecks, Pill as PillIcon } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { Checkbox } from "@/components/ui/checkbox";
import { ClientError, apiFetch } from "@/lib/client/http";
import { DEFAULT_EMERGENCY_GUIDANCE } from "@/lib/clinic/urgent";
import type { PlanBundle } from "@/schemas/domain";
import { cn } from "@/lib/utils";

export interface ApprovedPlan {
  id: string;
  title: string;
  version_id: string;
  version: number | null;
  bundle: PlanBundle | null;
  approved_by: string | null;
  approved_at: string | null;
  episode: { title: string; discharge_date: string | null; department: string | null } | null;
  progress: Array<{ item_kind: string; item_id: string; action: string }>;
  follow_ups: Array<{ follow_up_item_id: string; patient_status: string; staff_status: string }>;
}

function fmt(date: string | null | undefined) {
  if (!date) return null;
  const d = date.length === 10 ? new Date(`${date}T00:00:00`) : new Date(date);
  return d.toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" });
}

function Block({ icon, title, children }: { icon: React.ReactNode; title: string; children: React.ReactNode }) {
  return (
    <section className="rounded-2xl border bg-card p-5" aria-label={title}>
      <h3 className="flex items-center gap-2 text-base font-bold">
        {icon}
        {title}
      </h3>
      <div className="mt-3">{children}</div>
    </section>
  );
}

/**
 * Read-only view of a clinician-approved plan, in the documented wording. Patients can acknowledge
 * instructions, mark tasks done and report attendance; they cannot change the instructions.
 */
export function ApprovedPlanView({ plan, clinicName, emergencyInstructions, onChanged }: { plan: ApprovedPlan; clinicName: string; emergencyInstructions: string | null; onChanged: () => void }) {
  const [busy, setBusy] = useState<string | null>(null);
  const b = plan.bundle;
  if (!b) return null;
  const done = (kind: string, id: string, action: string) => plan.progress.some((p) => p.item_kind === kind && p.item_id === id && p.action === action);

  const toggle = async (kind: "task" | "medication" | "warning_signs" | "plan", id: string, action: "completed" | "acknowledged", value: boolean) => {
    setBusy(`${kind}:${id}:${action}`);
    try {
      await apiFetch("/api/care-team/progress", { method: "POST", body: JSON.stringify({ version_id: plan.version_id, item_kind: kind, item_id: id, action, done: value }) });
      onChanged();
    } catch (err) {
      toast.error(err instanceof ClientError ? err.message : "We could not save that.");
    } finally {
      setBusy(null);
    }
  };

  const report = async (itemId: string, status: string) => {
    try {
      await apiFetch("/api/care-team/follow-ups", { method: "POST", body: JSON.stringify({ plan_id: plan.id, item_id: itemId, status }) });
      toast.success("Thanks — your care team can see your update.");
      onChanged();
    } catch (err) {
      toast.error(err instanceof ClientError ? err.message : "We could not save that.");
    }
  };

  return (
    <div className="space-y-5">
      <div className="flex gap-3 rounded-2xl border border-teal/25 bg-teal-soft p-4 text-sm">
        <BadgeCheck className="mt-0.5 size-5 shrink-0 text-teal" aria-hidden />
        <p>
          <span className="font-semibold">Approved by {plan.approved_by ?? "your clinician"}</span> at {clinicName}
          {plan.approved_at ? ` on ${fmt(plan.approved_at)}` : ""}. These are the instructions your care team documented
          {plan.episode?.title ? ` for ${plan.episode.title}` : ""}. If anything is unclear, ask your care team — do not change your treatment yourself.
        </p>
      </div>

      {b.warning_signs.length > 0 && (
        <section className="rounded-2xl border border-danger/30 bg-danger-soft p-5" aria-label="Warning signs">
          <h3 className="flex items-center gap-2 font-bold text-danger">
            <AlertOctagon className="size-5" aria-hidden /> Warning signs your care team told you to watch for
          </h3>
          <ul className="mt-3 space-y-2 text-sm">
            {b.warning_signs.map((w) => (
              <li key={w.id}>
                <span className="font-semibold">{w.sign}</span>
                {w.action && <span className="block text-foreground/80">{w.action}</span>}
              </li>
            ))}
          </ul>
          <p className="mt-4 text-sm font-semibold text-danger">{emergencyInstructions || DEFAULT_EMERGENCY_GUIDANCE}</p>
          <label className="mt-3 flex items-center gap-2 text-sm">
            <Checkbox
              checked={done("warning_signs", "all", "acknowledged")}
              disabled={busy !== null}
              onCheckedChange={(v) => void toggle("warning_signs", "all", "acknowledged", v === true)}
            />
            I have read these warning signs
          </label>
        </section>
      )}

      <Block icon={<PillIcon className="size-5 text-primary" aria-hidden />} title="Medications">
        {b.medications.length === 0 ? (
          <p className="text-sm text-muted-foreground">No medications in this plan.</p>
        ) : (
          <ul className="divide-y">
            {b.medications.map((m) => (
              <li key={m.id} className="py-3">
                <p className="font-semibold">
                  {m.name} {m.strength}
                </p>
                <p className="text-sm text-foreground/80">{[m.dose, m.route, m.frequency, m.timing, m.duration].filter(Boolean).join(" · ") || "Ask your care team how to take this."}</p>
                {m.special_instructions && <p className="mt-0.5 text-sm text-muted-foreground">{m.special_instructions}</p>}
                <label className="mt-2 flex items-center gap-2 text-xs">
                  <Checkbox checked={done("medication", m.id, "acknowledged")} disabled={busy !== null} onCheckedChange={(v) => void toggle("medication", m.id, "acknowledged", v === true)} />
                  I understand how to take this
                </label>
              </li>
            ))}
          </ul>
        )}
      </Block>

      <Block icon={<ListChecks className="size-5 text-primary" aria-hidden />} title="Care instructions">
        {b.tasks.length === 0 ? (
          <p className="text-sm text-muted-foreground">No care instructions in this plan.</p>
        ) : (
          <ul className="space-y-3">
            {b.tasks.map((t) => {
              const completed = done("task", t.id, "completed");
              return (
                <li key={t.id} className="flex items-start gap-3">
                  <Checkbox
                    id={`task-${t.id}`}
                    checked={completed}
                    disabled={busy !== null}
                    onCheckedChange={(v) => void toggle("task", t.id, "completed", v === true)}
                    className="mt-0.5"
                    aria-label={`Mark done: ${t.instruction}`}
                  />
                  <label htmlFor={`task-${t.id}`} className={cn("text-sm", completed && "text-muted-foreground line-through")}>
                    {t.instruction}
                    {t.schedule_description && <span className="block text-xs text-muted-foreground no-underline">{t.schedule_description}</span>}
                  </label>
                </li>
              );
            })}
          </ul>
        )}
      </Block>

      <Block icon={<CalendarDays className="size-5 text-primary" aria-hidden />} title="Follow-up appointments">
        {b.follow_ups.length === 0 ? (
          <p className="text-sm text-muted-foreground">No follow-ups in this plan.</p>
        ) : (
          <ul className="divide-y">
            {b.follow_ups.map((f) => {
              const t = plan.follow_ups.find((x) => x.follow_up_item_id === f.id);
              return (
                <li key={f.id} className="flex flex-col gap-2 py-3 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <p className="font-semibold">{[f.specialty, f.clinician].filter(Boolean).join(" · ") || f.investigation || "Follow-up"}</p>
                    <p className="text-sm text-foreground/80">
                      {fmt(f.scheduled_date) ?? "Date not documented — ask your clinic"}
                      {f.scheduled_time ? ` at ${f.scheduled_time}` : ""}
                    </p>
                    {f.preparation_instructions && <p className="text-sm text-muted-foreground">{f.preparation_instructions}</p>}
                    {t?.staff_status === "verified_attended" && (
                      <p className="mt-1 flex items-center gap-1 text-xs font-semibold text-teal">
                        <CheckCircle2 className="size-3.5" aria-hidden /> Your clinic recorded this visit
                      </p>
                    )}
                  </div>
                  <label className="flex shrink-0 items-center gap-2 text-sm">
                    <span className="text-muted-foreground">Your update</span>
                    <select
                      value={t?.patient_status ?? "none"}
                      onChange={(e) => void report(f.id, e.target.value)}
                      className="h-9 rounded-lg border border-input bg-card px-2 text-sm"
                    >
                      <option value="none">No update</option>
                      <option value="reported_attended">I went</option>
                      <option value="reported_missed">I missed it</option>
                      <option value="reported_rescheduled">It was rescheduled</option>
                    </select>
                  </label>
                </li>
              );
            })}
          </ul>
        )}
      </Block>
    </div>
  );
}
