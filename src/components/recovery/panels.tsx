"use client";

import { CalendarCheck2, Copy, MessageCircleQuestion, Phone, Siren } from "lucide-react";
import Link from "next/link";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { formatDateOnly } from "@/lib/domain/dates";
import { buildDoctorQuestions } from "@/lib/domain/questions";
import { buildTimeline } from "@/lib/domain/summary";
import { cn } from "@/lib/utils";
import type { PlanBundle } from "@/schemas/domain";

export function Panel({ title, icon, children, action, className }: { title: string; icon?: React.ReactNode; children: React.ReactNode; action?: React.ReactNode; className?: string }) {
  return (
    <section className={cn("rounded-2xl border bg-card p-5 sm:p-6", className)} aria-label={title}>
      <div className="mb-4 flex items-center justify-between gap-3">
        <h2 className="flex items-center gap-2 text-lg font-bold">
          {icon}
          {title}
        </h2>
        {action}
      </div>
      {children}
    </section>
  );
}

export function WarningSignsPanel({ bundle, compact = false }: { bundle: PlanBundle; compact?: boolean }) {
  const signs = bundle.warning_signs;
  return (
    <section className="rounded-2xl border border-danger/25 bg-danger-soft/50 p-5 sm:p-6" aria-labelledby="warning-signs-title">
      <h2 id="warning-signs-title" className="flex items-center gap-2 text-lg font-bold text-danger">
        <Siren className="size-5" aria-hidden />
        Warning signs in your documents
      </h2>
      {signs.length === 0 ? (
        <p className="mt-3 text-sm text-foreground">
          Your documents do not list warning signs. Ask your care team which symptoms need urgent attention.
        </p>
      ) : (
        <ul className="mt-3 space-y-2">
          {signs.slice(0, compact ? 6 : undefined).map((s) => (
            <li key={s.id} className="flex gap-2 text-sm">
              <span className="mt-1.5 size-1.5 shrink-0 rounded-full bg-danger" aria-hidden />
              <span>
                <span className="font-semibold">{s.sign}</span>
                {s.action && <span className="text-muted-foreground"> — {s.action}</span>}
              </span>
            </li>
          ))}
        </ul>
      )}
      <p className="mt-4 flex items-start gap-2 rounded-lg bg-card/80 p-3 text-sm font-medium">
        <Phone className="mt-0.5 size-4 shrink-0 text-danger" aria-hidden />
        In an emergency, call your local emergency number. AFTERCARE AI cannot monitor you or respond to emergencies.
      </p>
    </section>
  );
}

export function DoctorQuestionsPanel({ bundle }: { bundle: PlanBundle }) {
  const questions = buildDoctorQuestions(bundle);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(questions.map((q, i) => `${i + 1}. ${q.question}`).join("\n"));
      toast.success("Questions copied");
    } catch {
      toast.error("Copy is not available in this browser.");
    }
  };
  return (
    <Panel
      title="Questions for your care team"
      icon={<MessageCircleQuestion className="size-5 text-teal" aria-hidden />}
      action={
        questions.length > 0 ? (
          <Button size="sm" variant="ghost" onClick={copy}>
            <Copy aria-hidden /> Copy
          </Button>
        ) : undefined
      }
    >
      {questions.length === 0 ? (
        <p className="text-sm text-muted-foreground">No open questions from your documents right now.</p>
      ) : (
        <ol className="space-y-3">
          {questions.map((q, i) => (
            <li key={q.id} className="flex gap-3 text-sm">
              <span className="grid size-6 shrink-0 place-items-center rounded-full bg-secondary text-xs font-bold">{i + 1}</span>
              <span>
                <span className="leading-relaxed">{q.question}</span>
                <span className="mt-0.5 block text-xs text-muted-foreground">{q.reason}</span>
              </span>
            </li>
          ))}
        </ol>
      )}
      <p className="mt-4 text-xs text-muted-foreground">Generated from gaps and conflicts in your documents. They never suggest changing your treatment.</p>
    </Panel>
  );
}

export function TimelinePanel({ bundle }: { bundle: PlanBundle }) {
  const events = buildTimeline(bundle);
  const undated = bundle.follow_ups.filter((f) => !f.scheduled_date);
  return (
    <Panel title="Recovery timeline" icon={<CalendarCheck2 className="size-5 text-teal" aria-hidden />}>
      <ol className="relative ml-2 border-l-2 border-border">
        {events.map((e) => (
          <li key={e.id} className="relative pb-5 pl-6 last:pb-0">
            <span
              className={cn(
                "absolute top-1 -left-[9px] size-4 rounded-full border-2 border-card",
                e.kind === "today" ? "bg-teal ring-4 ring-teal-soft" : e.kind === "follow_up" ? "bg-primary" : "bg-muted-foreground/50",
              )}
              aria-hidden
            />
            <p className="text-xs font-semibold text-muted-foreground">{formatDateOnly(e.date)}</p>
            <p className={cn("text-sm font-semibold", e.kind === "today" && "text-teal")}>{e.title}</p>
            {e.detail && <p className="text-sm text-muted-foreground">{e.detail}</p>}
            {e.patientReported && <p className="text-xs text-muted-foreground">Entered or edited by you</p>}
          </li>
        ))}
      </ol>
      {undated.length > 0 && (
        <p className="mt-4 rounded-lg bg-amber-soft px-3 py-2 text-sm text-amber">
          {undated.length} appointment{undated.length > 1 ? "s have" : " has"} no documented date and {undated.length > 1 ? "are" : "is"} not placed on the timeline.{" "}
          <Link href="/appointments" className="font-semibold underline underline-offset-2">
            View
          </Link>
        </p>
      )}
      <p className="mt-4 text-xs text-muted-foreground">Only dates written in your documents (or entered by you) are shown. No recovery schedule is predicted.</p>
    </Panel>
  );
}
