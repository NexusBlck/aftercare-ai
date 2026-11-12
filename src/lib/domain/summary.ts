import type { FollowUp, PlanBundle, RecoveryTask, VerificationStatus } from "@/schemas/domain";
import { compareIsoDates, todayIso } from "./dates";

export interface PlanOverview {
  needsReview: number;
  needsClarification: number;
  openConflicts: number;
  openUncertainties: number;
  tasksPending: number;
  tasksCompleted: number;
  confirmedMedications: number;
  totalMedications: number;
  nextFollowUp: FollowUp | null;
  undatedFollowUps: number;
}

type Reviewable = { verification_status: VerificationStatus };

export function reviewableItems(bundle: PlanBundle): Reviewable[] {
  return [
    ...bundle.medications,
    ...bundle.tasks,
    ...bundle.follow_ups,
    ...bundle.warning_signs,
    ...Object.entries(bundle.plan.encounter_evidence)
      .filter(([key]) => bundle.plan[key as keyof typeof bundle.plan] !== null)
      .map(([, ev]) => ev),
  ];
}

export function effectiveFollowUpDate(f: FollowUp): string | null {
  return f.status === "rescheduled" && f.patient_reschedule_date ? f.patient_reschedule_date : f.scheduled_date;
}

export function planOverview(bundle: PlanBundle, today: string = todayIso()): PlanOverview {
  const items = reviewableItems(bundle);
  const upcoming = bundle.follow_ups
    .filter((f) => f.status !== "attended")
    .map((f) => ({ f, date: effectiveFollowUpDate(f) }))
    .filter((x): x is { f: FollowUp; date: string } => x.date !== null && compareIsoDates(x.date, today) >= 0)
    .sort((a, b) => compareIsoDates(a.date, b.date));

  return {
    needsReview: items.filter((i) => i.verification_status === "needs_review").length,
    needsClarification: items.filter((i) => i.verification_status === "needs_clinician_clarification").length,
    openConflicts: bundle.flags.filter((f) => f.kind === "conflict" && f.status === "open").length,
    openUncertainties: bundle.flags.filter((f) => f.kind === "uncertainty" && f.status === "open").length,
    tasksPending: bundle.tasks.filter((t) => !t.completed).length,
    tasksCompleted: bundle.tasks.filter((t) => t.completed).length,
    confirmedMedications: bundle.medications.filter((m) => m.verification_status === "confirmed_by_patient").length,
    totalMedications: bundle.medications.length,
    nextFollowUp: upcoming[0]?.f ?? null,
    undatedFollowUps: bundle.follow_ups.filter((f) => f.scheduled_date === null).length,
  };
}

/** Undated documented instructions apply every day; dated ones only on their documented date. */
export function todaysTasks(bundle: PlanBundle, today: string = todayIso()): RecoveryTask[] {
  return bundle.tasks.filter((t) => t.due_date === null || t.due_date === today);
}

export interface TimelineEvent {
  id: string;
  date: string;
  kind: "admission" | "discharge" | "follow_up" | "task" | "today";
  title: string;
  detail: string | null;
  documentId: string | null;
  patientReported: boolean;
}

/** Only documented or patient-entered dates appear. Nothing is computed from durations. */
export function buildTimeline(bundle: PlanBundle, today: string = todayIso()): TimelineEvent[] {
  const events: TimelineEvent[] = [];
  const { plan } = bundle;
  if (plan.admission_date) {
    events.push({
      id: "admission",
      date: plan.admission_date,
      kind: "admission",
      title: "Admitted",
      detail: plan.facility,
      documentId: plan.encounter_evidence.admission_date?.document_id ?? null,
      patientReported: plan.encounter_evidence.admission_date?.patient_edited ?? false,
    });
  }
  if (plan.discharge_date) {
    events.push({
      id: "discharge",
      date: plan.discharge_date,
      kind: "discharge",
      title: "Discharged",
      detail: plan.procedure,
      documentId: plan.encounter_evidence.discharge_date?.document_id ?? null,
      patientReported: plan.encounter_evidence.discharge_date?.patient_edited ?? false,
    });
  }
  for (const f of bundle.follow_ups) {
    if (f.scheduled_date) {
      events.push({
        id: f.id,
        date: f.scheduled_date,
        kind: "follow_up",
        title: `${f.specialty ?? "Follow-up"} appointment`,
        detail: [f.clinician, f.investigation].filter(Boolean).join(" · ") || null,
        documentId: f.document_id,
        patientReported: f.patient_edited,
      });
    }
    if (f.status === "rescheduled" && f.patient_reschedule_date) {
      events.push({
        id: `${f.id}-reschedule`,
        date: f.patient_reschedule_date,
        kind: "follow_up",
        title: `${f.specialty ?? "Follow-up"} — rescheduled (reported by you)`,
        detail: f.patient_note,
        documentId: null,
        patientReported: true,
      });
    }
  }
  for (const t of bundle.tasks) {
    if (t.due_date) {
      events.push({
        id: t.id,
        date: t.due_date,
        kind: "task",
        title: t.instruction,
        detail: null,
        documentId: t.document_id,
        patientReported: t.patient_edited,
      });
    }
  }
  events.push({ id: "today", date: today, kind: "today", title: "Today", detail: null, documentId: null, patientReported: false });
  return events.sort((a, b) => compareIsoDates(a.date, b.date) || (a.kind === "today" ? 1 : b.kind === "today" ? -1 : 0));
}

export const TASK_CATEGORY_LABEL: Record<RecoveryTask["category"], string> = {
  wound_care: "Wound care",
  activity: "Activity",
  diet: "Diet",
  other: "Other",
};

export const TASK_KIND_LABEL: Record<string, string> = {
  cleaning: "Cleaning",
  dressing: "Dressing",
  restriction: "Restriction",
  permitted: "Permitted",
  diet: "Diet",
  fluid: "Fluids",
  other: "Instruction",
};

export function taskTitle(task: RecoveryTask): string {
  return `${TASK_CATEGORY_LABEL[task.category]} · ${TASK_KIND_LABEL[task.kind] ?? "Instruction"}`;
}
