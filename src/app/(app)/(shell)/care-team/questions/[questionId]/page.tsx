"use client";

import { AlertTriangle, Loader2, Send } from "lucide-react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";
import { PageHeader } from "@/components/app/plan-gate";
import { useApi } from "@/components/clinic/use-api";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { apiFetch, ClientError } from "@/lib/client/http";
import { DEFAULT_EMERGENCY_GUIDANCE } from "@/lib/clinic/urgent";
import { cn } from "@/lib/utils";

interface Thread {
  question: { id: string; subject: string; status: string };
  messages: Array<{ id: string; author_kind: "patient" | "staff"; author_name: string | null; body: string; created_at: string }>;
}

export default function PatientQuestionPage() {
  const { questionId } = useParams<{ questionId: string }>();
  const { data, error, reload } = useApi<Thread>(`/api/care-team/questions/${questionId}`);
  const [body, setBody] = useState("");
  const [busy, setBusy] = useState(false);
  const [urgent, setUrgent] = useState(false);

  return (
    <>
      <PageHeader title={data?.question.subject ?? "Question"} description={<Link href="/care-team" className="underline">Back to care team</Link>} />
      {error && <p role="alert" className="rounded-2xl bg-danger-soft p-4 text-sm text-danger">{error.message}</p>}
      {!data && !error && <Loader2 className="size-5 animate-spin text-muted-foreground" aria-label="Loading" />}
      {data && (
        <div className="max-w-2xl space-y-4">
          <ol className="space-y-3">
            {data.messages.map((m) => (
              <li key={m.id} className={cn("max-w-[90%] rounded-2xl px-4 py-3 text-sm", m.author_kind === "patient" ? "ml-auto bg-primary text-primary-foreground" : "bg-card border")}>
                <p className="text-xs font-semibold opacity-80">
                  {m.author_kind === "patient" ? "You" : (m.author_name ?? "Care team")} · {new Date(m.created_at).toLocaleString("en-GB")}
                </p>
                <p className="mt-1 whitespace-pre-wrap">{m.body}</p>
              </li>
            ))}
          </ol>
          {urgent && (
            <div role="alert" className="flex gap-2 rounded-lg border border-danger/40 bg-danger-soft p-3 text-sm text-danger">
              <AlertTriangle className="mt-0.5 size-4 shrink-0" aria-hidden /> {DEFAULT_EMERGENCY_GUIDANCE}
            </div>
          )}
          {data.question.status !== "closed" ? (
            <form
              className="grid gap-2"
              onSubmit={async (e) => {
                e.preventDefault();
                setBusy(true);
                try {
                  const res = await apiFetch<{ urgent: boolean }>(`/api/care-team/questions/${questionId}`, { method: "POST", body: JSON.stringify({ body }) });
                  setBody("");
                  setUrgent(res.urgent);
                  await reload();
                } catch (err) {
                  toast.error(err instanceof ClientError ? err.message : "We could not send your message.");
                } finally {
                  setBusy(false);
                }
              }}
            >
              <label htmlFor="patient-reply" className="text-sm font-semibold">
                Add a message
              </label>
              <Textarea id="patient-reply" value={body} onChange={(e) => setBody(e.target.value)} rows={3} maxLength={4000} />
              <div>
                <Button type="submit" disabled={busy || !body.trim()}>
                  {busy ? <Loader2 className="animate-spin" aria-hidden /> : <Send aria-hidden />} Send
                </Button>
              </div>
            </form>
          ) : (
            <p className="text-sm text-muted-foreground">This conversation was closed by your care team.</p>
          )}
        </div>
      )}
    </>
  );
}
