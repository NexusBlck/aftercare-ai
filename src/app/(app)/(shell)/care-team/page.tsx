"use client";

import { AlertTriangle, Building2, FileText, Loader2, MessageSquareText, Send } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { toast } from "sonner";
import { PageHeader } from "@/components/app/plan-gate";
import { ApprovedPlanView, type ApprovedPlan } from "@/components/care-team/approved-plan";
import { useApi } from "@/components/clinic/use-api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { usePlan } from "@/hooks/use-plan";
import { apiFetch, ClientError } from "@/lib/client/http";
import { DEFAULT_EMERGENCY_GUIDANCE, hasUrgentKeywords } from "@/lib/clinic/urgent";

interface CareTeam {
  clinics: Array<{
    patient_id: string;
    organization: { id: string; name: string; contact_phone: string | null; contact_email: string | null; communication_hours: string | null; emergency_instructions: string | null };
    plans: ApprovedPlan[];
    questions: Array<{ id: string; subject: string; status: string; updated_at: string }>;
    documents: Array<{ id: string; original_filename: string; document_type: string; created_at: string }>;
  }>;
}

export default function CareTeamPage() {
  const { mode } = usePlan();
  const { data, error, loading, reload } = useApi<CareTeam>(mode === "account" ? "/api/care-team" : null);

  if (mode !== "account") {
    return (
      <>
        <PageHeader title="Care team" description="Plans shared by your clinic appear here." />
        <p className="rounded-2xl border bg-card p-5 text-sm text-muted-foreground">The demo does not include a clinic. Create an account and use the invitation link from your clinic to see plans they approved.</p>
      </>
    );
  }

  return (
    <>
      <PageHeader title="Care team" description="Recovery plans your clinic approved for you, and a way to send them questions." />
      {error && (
        <p role="alert" className="rounded-2xl bg-danger-soft p-4 text-sm text-danger">
          {error.message}
        </p>
      )}
      {loading && !data && <Loader2 className="size-5 animate-spin text-muted-foreground" aria-label="Loading" />}
      {data && data.clinics.length === 0 && (
        <div className="rounded-2xl border bg-card p-6 text-center">
          <Building2 className="mx-auto size-8 text-primary" aria-hidden />
          <p className="mt-3 font-semibold">No clinic is linked to your account yet</p>
          <p className="mt-1 text-sm text-muted-foreground">If your clinic uses AFTERCARE AI, they can send you an invitation link. Open it while signed in to see the plan they approved.</p>
        </div>
      )}
      <div className="space-y-10">
        {data?.clinics.map((c) => (
          <section key={c.patient_id} aria-label={c.organization.name} className="space-y-5">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h2 className="flex items-center gap-2 text-xl font-extrabold">
                <Building2 className="size-5 text-primary" aria-hidden /> {c.organization.name}
              </h2>
              {c.organization.contact_phone && <a href={`tel:${c.organization.contact_phone}`} className="text-sm font-semibold text-teal underline">{c.organization.contact_phone}</a>}
            </div>
            {c.plans.length === 0 ? (
              <p className="rounded-2xl border bg-card p-5 text-sm text-muted-foreground">Your clinic has not shared an approved plan with you right now.</p>
            ) : (
              c.plans.map((p) => (
                <div key={p.id}>
                  <h3 className="mb-3 text-lg font-bold">{p.title}</h3>
                  <ApprovedPlanView plan={p} clinicName={c.organization.name} emergencyInstructions={c.organization.emergency_instructions} onChanged={reload} />
                </div>
              ))
            )}
            {c.documents.length > 0 && (
              <div className="rounded-2xl border bg-card p-5">
                <h3 className="flex items-center gap-2 font-bold">
                  <FileText className="size-5 text-primary" aria-hidden /> Documents shared by your clinic
                </h3>
                <ul className="mt-3 space-y-2 text-sm">
                  {c.documents.map((d) => (
                    <li key={d.id}>
                      <a href={`/api/care-team/documents/${d.id}`} target="_blank" rel="noopener noreferrer" className="font-medium text-teal underline">
                        {d.original_filename}
                      </a>
                    </li>
                  ))}
                </ul>
              </div>
            )}
            <QuestionsPanel clinic={c} onSent={reload} />
          </section>
        ))}
      </div>
    </>
  );
}

function QuestionsPanel({ clinic, onSent }: { clinic: CareTeam["clinics"][number]; onSent: () => void }) {
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [busy, setBusy] = useState(false);
  const [urgentShown, setUrgentShown] = useState(false);
  const typingUrgent = hasUrgentKeywords(`${subject} ${body}`);
  const emergency = clinic.organization.emergency_instructions || DEFAULT_EMERGENCY_GUIDANCE;

  return (
    <div className="rounded-2xl border bg-card p-5">
      <h3 className="flex items-center gap-2 font-bold">
        <MessageSquareText className="size-5 text-primary" aria-hidden /> Questions for your care team
      </h3>
      <p className="mt-1 text-sm text-muted-foreground">
        {clinic.organization.communication_hours ?? "Your clinic reads messages during working hours. Replies are not immediate."} This is not an emergency service.
      </p>
      <div role="note" className="mt-3 flex gap-2 rounded-lg bg-danger-soft px-3 py-2 text-sm font-medium text-danger">
        <AlertTriangle className="mt-0.5 size-4 shrink-0" aria-hidden /> {emergency}
      </div>
      {clinic.questions.length > 0 && (
        <ul className="mt-4 divide-y text-sm">
          {clinic.questions.map((q) => (
            <li key={q.id} className="flex items-center justify-between gap-2 py-2">
              <Link href={`/care-team/questions/${q.id}`} className="truncate font-medium hover:text-teal">
                {q.subject}
              </Link>
              <span className="shrink-0 text-xs text-muted-foreground">{q.status === "responded" ? "Reply received" : q.status === "closed" ? "Closed" : "Waiting for reply"}</span>
            </li>
          ))}
        </ul>
      )}
      <form
        className="mt-4 grid gap-3"
        onSubmit={async (e) => {
          e.preventDefault();
          setBusy(true);
          try {
            const res = await apiFetch<{ urgent: boolean }>("/api/care-team/questions", { method: "POST", body: JSON.stringify({ patient_id: clinic.patient_id, subject, body }) });
            setSubject("");
            setBody("");
            setUrgentShown(res.urgent);
            toast.success("Your question was sent to your care team.");
            onSent();
          } catch (err) {
            toast.error(err instanceof ClientError ? err.message : "We could not send your question.");
          } finally {
            setBusy(false);
          }
        }}
      >
        <label className="grid gap-1.5 text-sm font-semibold">
          Subject
          <Input value={subject} onChange={(e) => setSubject(e.target.value)} maxLength={140} />
        </label>
        <label className="grid gap-1.5 text-sm font-semibold">
          Your question
          <Textarea value={body} onChange={(e) => setBody(e.target.value)} rows={4} maxLength={4000} />
        </label>
        {(typingUrgent || urgentShown) && (
          <div role="alert" className="rounded-lg border border-danger/40 bg-danger-soft p-3 text-sm text-danger">
            <p className="font-bold">This may need urgent attention.</p>
            <p className="mt-1">{emergency} Your care team may not see this message quickly.</p>
          </div>
        )}
        <div>
          <Button type="submit" disabled={busy || subject.trim().length < 3 || !body.trim()}>
            {busy ? <Loader2 className="animate-spin" aria-hidden /> : <Send aria-hidden />} Send question
          </Button>
        </div>
      </form>
    </div>
  );
}
