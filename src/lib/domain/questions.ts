import type { PlanBundle } from "@/schemas/domain";
import { normalizeMedicationName, truncate } from "./text";

export interface DoctorQuestion {
  id: string;
  question: string;
  reason: string;
  relatedId: string | null;
}

/**
 * Builds neutral questions from gaps, uncertainty and conflicts. Deterministic by design: no
 * model call, so a question can never suggest a treatment change.
 */
export function buildDoctorQuestions(bundle: PlanBundle): DoctorQuestion[] {
  const out: DoctorQuestion[] = [];
  const push = (q: DoctorQuestion) => {
    if (!out.some((x) => x.question === q.question)) out.push(q);
  };

  // A gap is only a question if no other document states that field for the same medicine;
  // genuine disagreements are raised by the conflict rules instead.
  const statedElsewhere = (m: (typeof bundle.medications)[number], field: "duration" | "frequency" | "dose") =>
    bundle.medications.some(
      (o) => o.id !== m.id && normalizeMedicationName(o.name) === normalizeMedicationName(m.name) && o[field],
    );

  for (const m of bundle.medications) {
    if (!m.duration && !statedElsewhere(m, "duration")) {
      push({
        id: `med-duration-${m.id}`,
        question: `My documents do not say how long to take ${m.name}. Could you confirm the intended duration?`,
        reason: "Duration not stated",
        relatedId: m.id,
      });
    }
    if (!m.frequency && !statedElsewhere(m, "frequency")) {
      push({
        id: `med-frequency-${m.id}`,
        question: `How often should I take ${m.name}? My documents do not state the frequency.`,
        reason: "Frequency not stated",
        relatedId: m.id,
      });
    }
    if (!m.dose && !m.strength && !statedElsewhere(m, "dose")) {
      push({
        id: `med-dose-${m.id}`,
        question: `What dose of ${m.name} was prescribed? I could not find it in my documents.`,
        reason: "Dose not stated",
        relatedId: m.id,
      });
    }
  }

  for (const t of bundle.tasks) {
    if (t.category === "wound_care" && t.kind === "dressing" && !t.schedule_description) {
      push({
        id: `dressing-frequency-${t.id}`,
        question: "How often should my dressing be changed? My instructions do not give a schedule.",
        reason: "Dressing frequency not stated",
        relatedId: t.id,
      });
    }
  }

  for (const f of bundle.follow_ups) {
    if (!f.scheduled_date) {
      push({
        id: `fu-date-${f.id}`,
        question: `When is my ${f.specialty ?? "follow-up"} appointment${f.investigation ? ` for ${f.investigation}` : ""}? No date is written in my documents.`,
        reason: "Appointment date not stated",
        relatedId: f.id,
      });
    }
  }

  for (const flag of bundle.flags) {
    if (flag.status !== "open") continue;
    if (flag.kind === "conflict") {
      push({
        id: `conflict-${flag.id}`,
        question: `My documents appear to contain different instructions: ${truncate(flag.description, 220)} Which one should I follow?`,
        reason: "Conflicting information",
        relatedId: flag.id,
      });
    } else if (flag.category === "illegible" || flag.category === "ambiguous") {
      const excerpt = flag.excerpts[0];
      push({
        id: `unclear-${flag.id}`,
        question: excerpt
          ? `Part of my instructions was unclear: "${truncate(excerpt, 140)}". Could you explain what it means?`
          : `Could you clarify this part of my instructions? ${truncate(flag.description, 200)}`,
        reason: flag.category === "illegible" ? "Hard to read" : "Ambiguous wording",
        relatedId: flag.id,
      });
    }
  }

  const clarify = [
    ...bundle.medications.map((m) => ({ id: m.id, label: m.name, s: m.verification_status })),
    ...bundle.tasks.map((t) => ({ id: t.id, label: truncate(t.instruction, 120), s: t.verification_status })),
    ...bundle.follow_ups.map((f) => ({ id: f.id, label: `${f.specialty ?? "follow-up"} appointment`, s: f.verification_status })),
    ...bundle.warning_signs.map((w) => ({ id: w.id, label: truncate(w.sign, 120), s: w.verification_status })),
  ].filter((x) => x.s === "needs_clinician_clarification");
  for (const item of clarify) {
    push({
      id: `clarify-${item.id}`,
      question: `I marked this for clarification: "${item.label}". Could you go over it with me?`,
      reason: "You asked for clarification",
      relatedId: item.id,
    });
  }

  if (bundle.documents.some((d) => d.processing_status === "ready_for_review" || d.processing_status === "sample") && bundle.warning_signs.length === 0) {
    push({
      id: "warning-signs-missing",
      question: "Which symptoms should make me seek urgent care? My documents do not list warning signs.",
      reason: "No warning signs documented",
      relatedId: null,
    });
  }

  return out;
}
