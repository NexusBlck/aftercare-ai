"use client";

import { AlertTriangle, Loader2, Send } from "lucide-react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";
import { ClinicPageHeader, ErrorState, formatDate, LoadingRows, NativeSelect, Pill, Section } from "@/components/clinic/ui";
import { send, useApi } from "@/components/clinic/use-api";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { ClientError } from "@/lib/client/http";
import { cn } from "@/lib/utils";

interface Thread {
  question: { id: string; subject: string; status: string; urgent_keywords: boolean; assigned_to: string | null; created_at: string; patient: { id: string; full_name: string; mrn: string | null } | null };
  messages: Array<{ id: string; author_kind: "patient" | "staff"; author_name: string | null; body: string; created_at: string }>;
  staff: Array<{ user_id: string; name: string }>;
}

export default function QuestionThreadPage() {
  const { questionId } = useParams<{ questionId: string }>();
  const { data, error, loading, reload } = useApi<Thread>(`/api/clinic/questions/${questionId}`);
  const [reply, setReply] = useState("");
  const [busy, setBusy] = useState(false);

  const update = async (body: Record<string, unknown>) => {
    try {
      await send(`/api/clinic/questions/${questionId}`, "PATCH", body);
      await reload();
    } catch (err) {
      toast.error(err instanceof ClientError ? err.message : "We could not update the question.");
    }
  };

  if (error) return <ErrorState error={error} onRetry={reload} />;
  if (loading && !data) return <LoadingRows />;
  if (!data) return null;
  const { question } = data;
  const closed = question.status === "closed";

  return (
    <>
      <ClinicPageHeader
        eyebrow={<Link href="/clinic/questions" className="hover:underline">Questions</Link>}
        title={question.subject}
        description={
          <span>
            From{" "}
            <Link href={`/clinic/patients/${question.patient?.id}`} className="font-semibold underline">
              {question.patient?.full_name}
            </Link>{" "}
            · {formatDate(question.created_at, true)}
          </span>
        }
      />
      {question.urgent_keywords && (
        <div role="alert" className="mb-6 flex gap-3 rounded-2xl border border-danger/30 bg-danger-soft p-4 text-sm text-danger">
          <AlertTriangle className="mt-0.5 size-5 shrink-0" aria-hidden />
          <p>
            The patient&apos;s message matched words that can describe urgent symptoms. This is a keyword screen, not a triage decision. The patient was shown emergency guidance when they sent it.
            Follow your clinic&apos;s escalation procedure.
          </p>
        </div>
      )}
      <div className="grid gap-6 lg:grid-cols-[1fr_18rem]">
        <Section title="Conversation">
          <ol className="space-y-4">
            {data.messages.map((m) => (
              <li key={m.id} className={cn("max-w-[90%] rounded-2xl px-4 py-3 text-sm", m.author_kind === "staff" ? "ml-auto bg-primary text-primary-foreground" : "bg-secondary")}>
                <p className="text-xs font-semibold opacity-80">
                  {m.author_kind === "staff" ? (m.author_name ?? "Care team") : "Patient"} · {formatDate(m.created_at, true)}
                </p>
                <p className="mt-1 whitespace-pre-wrap">{m.body}</p>
              </li>
            ))}
          </ol>
          {!closed && (
            <form
              className="mt-6 grid gap-2"
              onSubmit={async (e) => {
                e.preventDefault();
                setBusy(true);
                try {
                  await send(`/api/clinic/questions/${questionId}`, "POST", { body: reply });
                  setReply("");
                  toast.success("Reply sent. The patient sees it in the app.");
                  await reload();
                } catch (err) {
                  toast.error(err instanceof ClientError ? err.message : "We could not send the reply.");
                } finally {
                  setBusy(false);
                }
              }}
            >
              <label htmlFor="reply" className="text-sm font-semibold">
                Reply to the patient
              </label>
              <Textarea id="reply" value={reply} onChange={(e) => setReply(e.target.value)} rows={4} maxLength={4000} placeholder="Refer to the documented instructions. Do not change treatment through this channel." />
              <div>
                <Button type="submit" disabled={busy || !reply.trim()}>
                  {busy ? <Loader2 className="animate-spin" aria-hidden /> : <Send aria-hidden />} Send reply
                </Button>
              </div>
            </form>
          )}
        </Section>
        <Section title="Status">
          <div className="grid gap-4 text-sm">
            <div>
              <Pill tone={question.status === "new" ? "amber" : question.status === "responded" ? "teal" : "neutral"}>{question.status.replace("_", " ")}</Pill>
            </div>
            <label className="grid gap-1.5 font-semibold">
              Status
              <NativeSelect value={question.status} onChange={(e) => void update({ status: e.target.value })}>
                <option value="new">New</option>
                <option value="assigned">Assigned</option>
                <option value="in_progress">In progress</option>
                <option value="responded">Responded</option>
                <option value="closed">Closed</option>
              </NativeSelect>
            </label>
            <label className="grid gap-1.5 font-semibold">
              Assigned to
              <NativeSelect value={question.assigned_to ?? ""} onChange={(e) => e.target.value && void update({ assigned_to: e.target.value })}>
                <option value="">Unassigned</option>
                {data.staff.map((s) => (
                  <option key={s.user_id} value={s.user_id}>
                    {s.name}
                  </option>
                ))}
              </NativeSelect>
            </label>
          </div>
        </Section>
      </div>
    </>
  );
}
