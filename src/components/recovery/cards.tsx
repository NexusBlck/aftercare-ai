"use client";

import { AlertOctagon, CalendarClock, CalendarDays, CheckCircle2, Circle, GitCompareArrows, MessageCircleQuestion, Pill, Siren } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { PlainLanguageNote } from "@/components/shared/plain-language";
import { ReviewActions } from "@/components/shared/review-actions";
import { SourceButton } from "@/components/shared/source-button";
import { EditedBadge, Field, StatusBadge, UncertainBadge } from "@/components/shared/status";
import { usePlan } from "@/hooks/use-plan";
import { formatDateOnly, formatTimestamp } from "@/lib/domain/dates";
import { taskTitle } from "@/lib/domain/summary";
import { FLAG_CATEGORY_LABEL } from "@/lib/labels";
import { cn } from "@/lib/utils";
import type { FollowUp, Medication, RecoveryTask, ReviewFlag, WarningSign } from "@/schemas/domain";

function CardShell({ children, tone = "default", className }: { children: React.ReactNode; tone?: "default" | "danger" | "muted"; className?: string }) {
  return (
    <article
      className={cn(
        "rounded-xl border bg-card p-4 shadow-[0_1px_2px_rgba(15,23,42,0.04)] sm:p-5",
        tone === "danger" && "border-danger/25",
        tone === "muted" && "bg-muted/40",
        className,
      )}
    >
      {children}
    </article>
  );
}

function Badges({ item }: { item: { verification_status: Medication["verification_status"]; uncertain: boolean; uncertainty_note: string | null; patient_edited: boolean } }) {
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <StatusBadge status={item.verification_status} />
      {item.uncertain && <UncertainBadge note={item.uncertainty_note} />}
      {item.patient_edited && <EditedBadge />}
    </div>
  );
}

export function MedicationCard({ med, showReview = true }: { med: Medication; showReview?: boolean }) {
  const values = Object.fromEntries(
    ["name", "brand_name", "generic_name", "strength", "dose", "route", "frequency", "timing", "duration", "special_instructions"].map((k) => [
      k,
      med[k as keyof Medication] as string | null,
    ]),
  );
  return (
    <CardShell>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex min-w-0 items-start gap-3">
          <span className="mt-0.5 grid size-9 shrink-0 place-items-center rounded-lg bg-secondary text-primary">
            <Pill className="size-4.5" aria-hidden />
          </span>
          <div className="min-w-0">
            <h3 className="text-base font-bold break-words">
              {med.name} {med.strength && <span className="font-semibold text-muted-foreground">{med.strength}</span>}
            </h3>
            {med.brand_name && <p className="text-sm text-muted-foreground">Brand: {med.brand_name}</p>}
          </div>
        </div>
        <Badges item={med} />
      </div>
      <dl className="mt-4 grid grid-cols-2 gap-x-4 gap-y-3 sm:grid-cols-3">
        <Field label="Dose" value={med.dose} />
        <Field label="Route" value={med.route} />
        <Field label="Frequency" value={med.frequency} />
        <Field label="Timing" value={med.timing} />
        <Field label="Duration" value={med.duration} />
        <Field label="Special instructions" value={med.special_instructions} className="col-span-2 sm:col-span-1" />
      </dl>
      {med.verification_status === "conflicting" && (
        <p className="mt-3 rounded-md bg-danger-soft px-3 py-2 text-sm text-danger">
          Another document gives different instructions for this medicine. Do not change how you take it based on this app — ask your pharmacist or treating clinician which is correct.
        </p>
      )}
      <PlainLanguageNote value={med.plain_language} />
      <div className="mt-4 flex flex-wrap items-center justify-between gap-2 border-t pt-3">
        {showReview ? <ReviewActions kind="medication" id={med.id} status={med.verification_status} values={values} itemLabel={med.name} /> : <span />}
        <SourceButton documentId={med.document_id} page={med.source_page} excerpt={med.source_excerpt} />
      </div>
    </CardShell>
  );
}

export function TaskCard({
  task,
  showReview = true,
  showComplete = true,
  showPlain = true,
}: {
  task: RecoveryTask;
  showReview?: boolean;
  showComplete?: boolean;
  showPlain?: boolean;
}) {
  const { mutate } = usePlan();
  const [busy, setBusy] = useState(false);
  const toggle = async () => {
    setBusy(true);
    await mutate((b, bundle) => b.patchItem(bundle, "task", task.id, { action: "complete", completed: !task.completed }));
    setBusy(false);
  };
  return (
    <CardShell className={cn(task.completed && "bg-muted/30")}>
      <div className="flex items-start gap-3">
        {showComplete && (
          <button
            type="button"
            onClick={toggle}
            disabled={busy}
            role="checkbox"
            aria-checked={task.completed}
            aria-label={task.completed ? `Mark not done: ${task.instruction}` : `Mark done: ${task.instruction}`}
            className="mt-0.5 grid size-10 shrink-0 place-items-center rounded-full text-teal transition-colors hover:bg-teal-soft disabled:opacity-50 -m-2"
          >
            {task.completed ? <CheckCircle2 className="size-6" aria-hidden /> : <Circle className="size-6 text-muted-foreground" aria-hidden />}
          </button>
        )}
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">{taskTitle(task)}</p>
            <Badges item={task} />
          </div>
          <p className={cn("mt-1.5 text-[0.95rem] leading-relaxed font-medium break-words", task.completed && "text-muted-foreground line-through decoration-1")}>
            {task.instruction}
          </p>
          <div className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-sm text-muted-foreground">
            {task.schedule_description && <span>As documented: {task.schedule_description}</span>}
            {task.due_date && <span>Date: {formatDateOnly(task.due_date)}</span>}
            {task.completed && task.completed_at && <span className="text-teal">Done {formatTimestamp(task.completed_at)}</span>}
          </div>
          {showPlain && <PlainLanguageNote value={task.plain_language} />}
          <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
            {showReview ? (
              <ReviewActions
                kind="task"
                id={task.id}
                status={task.verification_status}
                values={{ instruction: task.instruction, schedule_description: task.schedule_description, due_date: task.due_date }}
                itemLabel="this instruction"
                compact
              />
            ) : (
              <span />
            )}
            <SourceButton documentId={task.document_id} page={task.source_page} excerpt={task.source_excerpt} />
          </div>
        </div>
      </div>
    </CardShell>
  );
}

export function FollowUpCard({ followUp: f, showReview = true }: { followUp: FollowUp; showReview?: boolean }) {
  const { mutate } = usePlan();
  const [rescheduling, setRescheduling] = useState(false);
  const values = {
    specialty: f.specialty,
    clinician: f.clinician,
    scheduled_date: f.scheduled_date,
    scheduled_time: f.scheduled_time,
    investigation: f.investigation,
    preparation_instructions: f.preparation_instructions,
  };
  const setStatus = (status: FollowUp["status"], success: string) =>
    mutate((b, bundle) => b.patchItem(bundle, "follow_up", f.id, { action: "follow_up_status", status, reschedule_date: null }), { success });

  return (
    <CardShell>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex min-w-0 items-start gap-3">
          <span className="grid size-12 shrink-0 place-items-center rounded-lg bg-primary text-center text-primary-foreground">
            {f.scheduled_date ? (
              <span className="leading-tight">
                <span className="block text-[0.65rem] font-semibold uppercase opacity-80">{formatDateOnly(f.scheduled_date).split(" ")[1]}</span>
                <span className="block text-lg font-bold">{formatDateOnly(f.scheduled_date).split(" ")[0]}</span>
              </span>
            ) : (
              <CalendarDays className="size-5" aria-hidden />
            )}
          </span>
          <div className="min-w-0">
            <h3 className="text-base font-bold">{f.specialty ?? "Follow-up appointment"}</h3>
            <p className={cn("text-sm", f.scheduled_date ? "text-muted-foreground" : "font-medium text-amber")}>
              {f.scheduled_date ? formatDateOnly(f.scheduled_date) : "No date in your documents"}
              {f.scheduled_time ? ` · ${f.scheduled_time}` : f.scheduled_date ? " · time not stated" : ""}
            </p>
          </div>
        </div>
        <Badges item={f} />
      </div>
      <dl className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-3">
        <Field label="Clinician" value={f.clinician} />
        <Field label="Purpose / investigation" value={f.investigation} />
        <Field label="Preparation" value={f.preparation_instructions} />
      </dl>
      {f.status !== "upcoming" && (
        <p className="mt-3 flex items-center gap-2 rounded-md bg-muted px-3 py-2 text-sm">
          <CalendarClock className="size-4 text-muted-foreground" aria-hidden />
          {f.status === "attended"
            ? "You marked this appointment as attended."
            : `You reported this was rescheduled${f.patient_reschedule_date ? ` to ${formatDateOnly(f.patient_reschedule_date)}` : ""}. The documented date is kept for reference.`}
          {f.patient_note && <span className="text-muted-foreground"> · {f.patient_note}</span>}
        </p>
      )}
      <PlainLanguageNote value={f.plain_language} />
      <div className="mt-4 flex flex-wrap items-center gap-2 border-t pt-3">
        {f.status !== "attended" && (
          <Button size="sm" variant="outline" onClick={() => setStatus("attended", "Marked as attended")}>
            Mark attended
          </Button>
        )}
        {f.status !== "rescheduled" && (
          <Button size="sm" variant="outline" onClick={() => setRescheduling(true)}>
            Rescheduled
          </Button>
        )}
        {f.status !== "upcoming" && (
          <Button size="sm" variant="ghost" onClick={() => setStatus("upcoming", "Marked as upcoming")}>
            Reset status
          </Button>
        )}
        <div className="ml-auto">
          <SourceButton documentId={f.document_id} page={f.source_page} excerpt={f.source_excerpt} />
        </div>
      </div>
      {showReview && (
        <div className="mt-3">
          <ReviewActions kind="follow_up" id={f.id} status={f.verification_status} values={values} itemLabel="this appointment" compact />
        </div>
      )}
      {rescheduling && <RescheduleDialog followUp={f} onClose={() => setRescheduling(false)} />}
    </CardShell>
  );
}

function RescheduleDialog({ followUp, onClose }: { followUp: FollowUp; onClose: () => void }) {
  const { mutate } = usePlan();
  const [date, setDate] = useState("");
  const [note, setNote] = useState("");
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="w-[calc(100vw-1.5rem)] sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Appointment rescheduled</DialogTitle>
          <DialogDescription>
            Record the new date your clinic gave you. The date in your documents is kept unchanged for reference.
          </DialogDescription>
        </DialogHeader>
        <form
          className="grid gap-4"
          onSubmit={async (e) => {
            e.preventDefault();
            const res = await mutate(
              (b, bundle) =>
                b.patchItem(bundle, "follow_up", followUp.id, {
                  action: "follow_up_status",
                  status: "rescheduled",
                  reschedule_date: date || null,
                  note: note.trim() || null,
                }),
              { success: "Reschedule recorded" },
            );
            if (res) onClose();
          }}
        >
          <div className="grid gap-1.5">
            <Label htmlFor="reschedule-date">New date (if you know it)</Label>
            <Input id="reschedule-date" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="reschedule-note">Note (optional)</Label>
            <Input id="reschedule-note" value={note} onChange={(e) => setNote(e.target.value)} placeholder="e.g. Clinic called to move it" />
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit">Save</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export function WarningSignCard({ sign, showReview = true }: { sign: WarningSign; showReview?: boolean }) {
  return (
    <CardShell tone="danger" className="bg-danger-soft/40">
      <div className="flex items-start gap-3">
        <Siren className="mt-0.5 size-5 shrink-0 text-danger" aria-hidden />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-start justify-between gap-2">
            <p className="font-semibold break-words text-foreground">{sign.sign}</p>
            <Badges item={sign} />
          </div>
          {sign.action && <p className="mt-1 text-sm text-danger">What your document says to do: {sign.action}</p>}
          <PlainLanguageNote value={sign.plain_language} />
          <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
            {showReview ? (
              <ReviewActions kind="warning_sign" id={sign.id} status={sign.verification_status} values={{ sign: sign.sign, action: sign.action }} itemLabel="this warning sign" compact />
            ) : (
              <span />
            )}
            <SourceButton documentId={sign.document_id} page={sign.source_page} excerpt={sign.source_excerpt} />
          </div>
        </div>
      </div>
    </CardShell>
  );
}

export function FlagCard({ flag }: { flag: ReviewFlag }) {
  const { mutate } = usePlan();
  const [open, setOpen] = useState(false);
  const [note, setNote] = useState(flag.patient_note ?? "");
  const conflict = flag.kind === "conflict";
  const discussed = flag.status === "discussed_with_care_team";

  return (
    <CardShell tone={conflict && !discussed ? "danger" : "default"} className={cn(discussed && "opacity-80")}>
      <div className="flex items-start gap-3">
        {conflict ? (
          <GitCompareArrows className="mt-0.5 size-5 shrink-0 text-danger" aria-hidden />
        ) : (
          <AlertOctagon className="mt-0.5 size-5 shrink-0 text-amber" aria-hidden />
        )}
        <div className="min-w-0 flex-1">
          <p className="text-xs font-semibold tracking-wide uppercase">
            <span className={conflict ? "text-danger" : "text-amber"}>{conflict ? "Conflict" : "Uncertain"}</span>
            <span className="text-muted-foreground"> · {FLAG_CATEGORY_LABEL[flag.category] ?? flag.category}</span>
            {flag.origin === "rule" && <span className="text-muted-foreground"> · Found by safety check</span>}
          </p>
          <p className="mt-1 text-sm leading-relaxed break-words">{flag.description}</p>
          {flag.excerpts.length > 0 && (
            <ul className="mt-2 space-y-1.5">
              {flag.excerpts.slice(0, 3).map((e, i) => (
                <li key={i} className="rounded-md border-l-2 border-border bg-muted/50 px-3 py-1.5 text-xs text-muted-foreground italic break-words">
                  “{e}”
                </li>
              ))}
            </ul>
          )}
          {discussed && (
            <p className="mt-2 text-sm text-teal">
              You marked this as discussed with your care team{flag.patient_note ? `: ${flag.patient_note}` : "."}
            </p>
          )}
          <div className="mt-3 flex flex-wrap gap-2">
            {discussed ? (
              <Button size="sm" variant="ghost" onClick={() => mutate((b, bundle) => b.patchItem(bundle, "flag", flag.id, { action: "flag_status", status: "open" }))}>
                Reopen
              </Button>
            ) : (
              <Button size="sm" variant="outline" onClick={() => setOpen(true)}>
                <MessageCircleQuestion aria-hidden />I discussed this with my care team
              </Button>
            )}
          </div>
        </div>
      </div>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="w-[calc(100vw-1.5rem)] sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Discussed with your care team</DialogTitle>
            <DialogDescription>
              Only mark this once a pharmacist, nurse or doctor has told you what to do. AFTERCARE AI will not choose between conflicting instructions for you.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-1.5">
            <Label htmlFor={`flag-note-${flag.id}`}>What did they tell you? (optional, for your records)</Label>
            <Textarea id={`flag-note-${flag.id}`} value={note} onChange={(e) => setNote(e.target.value)} rows={3} />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button
              onClick={async () => {
                const res = await mutate(
                  (b, bundle) => b.patchItem(bundle, "flag", flag.id, { action: "flag_status", status: "discussed_with_care_team", note: note.trim() || null }),
                  { success: "Marked as discussed. Related items are back in review." },
                );
                if (res) setOpen(false);
              }}
            >
              Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </CardShell>
  );
}
