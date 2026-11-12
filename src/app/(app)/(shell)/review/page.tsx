"use client";

import { Info } from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";
import { PageHeader, PlanGate } from "@/components/app/plan-gate";
import { FlagCard, FollowUpCard, MedicationCard, TaskCard, WarningSignCard } from "@/components/recovery/cards";
import { ReviewActions } from "@/components/shared/review-actions";
import { SourceButton } from "@/components/shared/source-button";
import { EditedBadge, StatusBadge, UncertainBadge } from "@/components/shared/status";
import { Progress } from "@/components/ui/progress";
import { Switch } from "@/components/ui/switch";
import { usePlan } from "@/hooks/use-plan";
import { formatDateOnly } from "@/lib/domain/dates";
import { reviewableItems } from "@/lib/domain/summary";
import type { PlanBundle, VerificationStatus } from "@/schemas/domain";
import { ENCOUNTER_KEYS, type EncounterKey } from "@/schemas/extraction";

const ENCOUNTER_LABEL: Record<EncounterKey, string> = {
  diagnosis: "Diagnosis",
  procedure: "Procedure",
  admission_date: "Admission date",
  discharge_date: "Discharge date",
  facility: "Hospital / facility",
  clinician: "Treating clinician",
};

function Section({ id, title, count, children, hint }: { id: string; title: string; count: number; children: React.ReactNode; hint?: string }) {
  return (
    <section id={id} className="scroll-mt-24" aria-labelledby={`${id}-title`}>
      <h2 id={`${id}-title`} className="mb-1 text-xl font-bold">
        {title} <span className="text-base font-normal text-muted-foreground">({count})</span>
      </h2>
      {hint && <p className="mb-3 text-sm text-muted-foreground">{hint}</p>}
      <div className="mt-3 space-y-3">{count === 0 ? <p className="rounded-xl border border-dashed p-4 text-sm text-muted-foreground">Nothing found in your documents.</p> : children}</div>
    </section>
  );
}

function EncounterPanel({ bundle, onlyPending }: { bundle: PlanBundle; onlyPending: boolean }) {
  const rows = ENCOUNTER_KEYS.map((key) => ({ key, value: bundle.plan[key], ev: bundle.plan.encounter_evidence[key] })).filter(
    (r) => !onlyPending || !r.ev || r.ev.verification_status !== "confirmed_by_patient",
  );
  return (
    <div className="divide-y rounded-xl border bg-card">
      {rows.map(({ key, value, ev }) => (
        <div key={key} className="flex flex-col gap-3 p-4 sm:flex-row sm:items-start sm:justify-between">
          <div className="min-w-0">
            <p className="text-xs font-medium tracking-wide text-muted-foreground uppercase">{ENCOUNTER_LABEL[key]}</p>
            <p className={value ? "mt-0.5 font-semibold break-words" : "mt-0.5 text-sm text-muted-foreground italic"}>
              {value ? (key.endsWith("_date") ? formatDateOnly(value) : value) : "Not stated in your documents"}
            </p>
            {value && ev && (
              <div className="mt-2 flex flex-wrap gap-1.5">
                <StatusBadge status={ev.verification_status} />
                {ev.uncertain && <UncertainBadge note={null} />}
                {ev.patient_edited && <EditedBadge />}
              </div>
            )}
          </div>
          {value && ev && (
            <div className="flex flex-wrap items-center gap-2 sm:justify-end">
              <ReviewActions kind="encounter" id={key} status={ev.verification_status} values={{ [key]: value }} itemLabel={ENCOUNTER_LABEL[key].toLowerCase()} compact />
              <SourceButton documentId={ev.document_id} page={ev.source_page} excerpt={ev.source_excerpt} />
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

/** Content renders after client data loads, so honour #section links once it exists. */
function useScrollToHash(ready: boolean) {
  useEffect(() => {
    if (!ready || !window.location.hash) return;
    document.getElementById(decodeURIComponent(window.location.hash.slice(1)))?.scrollIntoView();
  }, [ready]);
}

export default function ReviewPage() {
  const [onlyPending, setOnlyPending] = useState(false);
  const { bundle } = usePlan();
  useScrollToHash(bundle !== null);
  return (
    <PlanGate>
      {(bundle) => {
        const items = reviewableItems(bundle);
        // Conflicting items are not "reviewed" — they still need the care team.
        const reviewed = items.filter((i) => i.verification_status === "confirmed_by_patient" || i.verification_status === "needs_clinician_clarification").length;
        const pending = (s: VerificationStatus) => !onlyPending || s !== "confirmed_by_patient";
        const meds = bundle.medications.filter((m) => pending(m.verification_status));
        const tasks = (c: string) => bundle.tasks.filter((t) => t.category === c && pending(t.verification_status));
        const followUps = bundle.follow_ups.filter((f) => pending(f.verification_status));
        const signs = bundle.warning_signs.filter((w) => pending(w.verification_status));
        const flags = [...bundle.flags].sort((a, b) => (a.status === b.status ? (a.kind === "conflict" ? -1 : 1) : a.status === "open" ? -1 : 1));
        const openFlags = bundle.flags.filter((f) => f.status === "open").length;

        const nav = [
          ["encounter", "Hospital stay"],
          ["flags", `Uncertain & conflicting (${openFlags})`],
          ["medications", "Medications"],
          ["wound", "Wound care"],
          ["activity", "Activity"],
          ["diet", "Diet"],
          ["follow-ups", "Follow-up"],
          ["warnings", "Warning signs"],
        ];

        return (
          <>
            <PageHeader
              title="Review extracted information"
              description="These items were extracted from your documents by AI, which can make mistakes. Compare each one with your original document, then confirm it, correct it, or mark it for your clinician. Confirming means it matches your document. It is not a medical check."
            />

            <div className="mb-6 rounded-2xl border bg-card p-5">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <p className="text-sm font-medium">
                  {reviewed} of {items.length} items reviewed
                </p>
                <label className="flex items-center gap-2 text-sm">
                  <Switch checked={onlyPending} onCheckedChange={setOnlyPending} aria-label="Hide confirmed items" />
                  Hide confirmed items
                </label>
              </div>
              <Progress value={items.length ? (reviewed / items.length) * 100 : 0} className="mt-3 h-2" aria-label="Review progress" />
              {bundle.plan.is_sample && (
                <p className="mt-3 flex items-start gap-2 text-sm text-amber">
                  <Info className="mt-0.5 size-4 shrink-0" aria-hidden />
                  This is precomputed sample data from synthetic documents, not a live AI extraction.
                </p>
              )}
              {bundle.documents.length === 0 && (
                <p className="mt-3 text-sm text-muted-foreground">
                  Nothing to review yet.{" "}
                  <Link href="/documents" className="font-medium text-foreground underline underline-offset-2">
                    Upload a document
                  </Link>
                  .
                </p>
              )}
            </div>

            <nav aria-label="Review sections" className="-mx-4 mb-8 flex gap-2 overflow-x-auto px-4 pb-1 sm:mx-0 sm:flex-wrap sm:px-0">
              {nav.map(([id, label]) => (
                <a key={id} href={`#${id}`} className="shrink-0 rounded-lg border bg-card px-3 py-2 text-sm font-medium whitespace-nowrap hover:bg-muted">
                  {label}
                </a>
              ))}
            </nav>

            <div className="space-y-12">
              <section id="encounter" className="scroll-mt-24" aria-labelledby="encounter-title">
                <h2 id="encounter-title" className="mb-3 text-xl font-bold">
                  Hospital stay
                </h2>
                <EncounterPanel bundle={bundle} onlyPending={onlyPending} />
              </section>

              <Section id="flags" title="Uncertain & conflicting information" count={flags.length} hint="These are never resolved automatically. Discuss open items with your care team.">
                {flags.map((f) => (
                  <FlagCard key={f.id} flag={f} />
                ))}
              </Section>

              <Section id="medications" title="Medications" count={meds.length} hint="Medication details must be reviewed before your medication list is treated as confirmed.">
                {meds.map((m) => (
                  <MedicationCard key={m.id} med={m} />
                ))}
              </Section>

              <Section id="wound" title="Wound care" count={tasks("wound_care").length}>
                {tasks("wound_care").map((t) => (
                  <TaskCard key={t.id} task={t} showComplete={false} />
                ))}
              </Section>

              <Section id="activity" title="Activity" count={tasks("activity").length}>
                {tasks("activity").map((t) => (
                  <TaskCard key={t.id} task={t} showComplete={false} />
                ))}
              </Section>

              <Section id="diet" title="Diet" count={tasks("diet").length + tasks("other").length}>
                {[...tasks("diet"), ...tasks("other")].map((t) => (
                  <TaskCard key={t.id} task={t} showComplete={false} />
                ))}
              </Section>

              <Section id="follow-ups" title="Follow-up appointments" count={followUps.length}>
                {followUps.map((f) => (
                  <FollowUpCard key={f.id} followUp={f} />
                ))}
              </Section>

              <Section id="warnings" title="Warning signs" count={signs.length} hint="Only warning signs written in your documents are listed here.">
                {signs.map((w) => (
                  <WarningSignCard key={w.id} sign={w} />
                ))}
              </Section>
            </div>
          </>
        );
      }}
    </PlanGate>
  );
}
