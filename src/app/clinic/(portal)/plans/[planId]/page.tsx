"use client";

import { AlertTriangle, CheckCircle2, ExternalLink, GitBranch, Loader2, RotateCcw, Send, ShieldAlert, Undo2, XCircle } from "lucide-react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";
import { useClinic } from "@/components/clinic/clinic-context";
import { FIELD_LABELS, ItemDialog, ItemList, type ItemKind } from "@/components/clinic/plan-items";
import { ClinicPageHeader, ErrorState, Field, formatDate, LoadingRows, Pill, Section, VersionStatus } from "@/components/clinic/ui";
import { send, useApi } from "@/components/clinic/use-api";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { DOCUMENT_TYPE_LABELS, PROCESSING_LABELS } from "@/lib/clinic/labels";
import { ClientError } from "@/lib/client/http";
import { EDITABLE_FIELDS, type PlanBundle } from "@/schemas/domain";

interface Version {
  id: string;
  version: number;
  status: string;
  bundle: PlanBundle;
  updated_at: string;
  submitted_at: string | null;
  decided_at: string | null;
}

interface PlanDetail {
  plan: { id: string; title: string; approved_version_id: string | null; patient_id: string };
  patient: { id: string; full_name: string; date_of_birth: string; mrn: string | null; linked_at: string | null };
  episode: { id: string; title: string; discharge_date: string | null };
  documents: Array<{ id: string; original_filename: string; document_type: string; processing_status: string; processing_error: string | null }>;
  versions: Array<{ id: string; version: number; status: string; created_at: string; created_by_name: string | null; submitted_by_name: string | null; submitted_at: string | null; decided_at: string | null }>;
  approvals: Array<{ id: string; version: number; decision: string; clinician_name: string | null; comments: string | null; decided_at: string }>;
  current: Version | null;
  approved: Version | null;
  readiness: Array<{ code: string; message: string }>;
}

type Edit =
  | { op: "correct"; kind: ItemKind | "encounter"; id: string; field: string; value: string | null; note?: string | null }
  | { op: "add"; kind: ItemKind; fields: Record<string, string | null> }
  | { op: "remove"; kind: ItemKind; id: string; note?: string | null }
  | { op: "flag_item"; kind: ItemKind; id: string; note: string }
  | { op: "resolve_flag"; id: string; note: string };

export default function PlanWorkspacePage() {
  const { planId } = useParams<{ planId: string }>();
  const { can } = useClinic();
  const { data, error, loading, reload } = useApi<PlanDetail>(`/api/clinic/plans/${planId}`);
  const [dialog, setDialog] = useState<null | { kind: ItemKind | "encounter"; item: Record<string, unknown> | null }>(null);
  const [noteDialog, setNoteDialog] = useState<null | { title: string; label: string; action: (note: string) => Promise<void> }>(null);
  const [decision, setDecision] = useState<null | "approved" | "rejected" | "changes_requested">(null);
  const [busy, setBusy] = useState<string | null>(null);

  if (error) return <ErrorState error={error} onRetry={reload} />;
  if (loading && !data) return <LoadingRows rows={8} />;
  if (!data) return null;

  const current = data.current;
  const bundle = current?.bundle;
  const editable = !!current && ["draft", "changes_requested"].includes(current.status) && can("plans.edit");
  const pending = current?.status === "pending_review";
  const hasOpenVersion = !!current && ["draft", "pending_review", "changes_requested"].includes(current.status);

  /** Applies edits one at a time; each response carries the new concurrency token. */
  const applyEdits = async (edits: Edit[]) => {
    if (!current) return;
    let expected = current.updated_at;
    for (const edit of edits) {
      const res = await send<{ version: { updated_at: string } }>(`/api/clinic/versions/${current.id}`, "PATCH", { expected_updated_at: expected, edit });
      expected = res.version.updated_at;
    }
    await reload();
  };

  const action = async (key: string, fn: () => Promise<unknown>, success: string) => {
    setBusy(key);
    try {
      await fn();
      toast.success(success);
      await reload();
    } catch (err) {
      toast.error(err instanceof ClientError ? err.message : "Something went wrong. Please try again.");
    } finally {
      setBusy(null);
    }
  };

  const openFlags = bundle?.flags.filter((f) => f.status === "open") ?? [];

  return (
    <>
      <ClinicPageHeader
        eyebrow={
          <span>
            <Link href="/clinic/patients" className="hover:underline">Patients</Link> /{" "}
            <Link href={`/clinic/patients/${data.patient.id}`} className="hover:underline">{data.patient.full_name}</Link>
          </span>
        }
        title={bundle?.plan.title ?? data.plan.title}
        description={
          <span className="flex flex-wrap items-center gap-2">
            <span>{data.episode.title}</span>
            {current && (
              <>
                <span>· Version {current.version}</span>
                <VersionStatus status={current.status} />
              </>
            )}
            {data.plan.approved_version_id ? <Pill tone="teal">Patient sees an approved version</Pill> : <Pill>Not visible to the patient</Pill>}
          </span>
        }
        actions={
          <>
            {editable && can("plans.submit") && (
              <Button disabled={busy === "submit" || data.readiness.length > 0} onClick={() => action("submit", () => send(`/api/clinic/versions/${current!.id}/submit`, "POST"), "Submitted for clinical review.")}>
                <Send aria-hidden /> Submit for review
              </Button>
            )}
            {pending && can("plans.decide") && (
              <>
                <Button onClick={() => setDecision("approved")} disabled={data.readiness.length > 0}>
                  <CheckCircle2 aria-hidden /> Approve
                </Button>
                <Button variant="outline" onClick={() => setDecision("changes_requested")}>
                  <Undo2 aria-hidden /> Request changes
                </Button>
                <Button variant="outline" onClick={() => setDecision("rejected")} className="text-danger">
                  <XCircle aria-hidden /> Reject
                </Button>
              </>
            )}
            {!hasOpenVersion && can("plans.edit") && (
              <Button variant="outline" disabled={busy === "revise"} onClick={() => action("revise", () => send(`/api/clinic/plans/${data.plan.id}/revise`, "POST"), "New draft revision started. The approved version stays active until the revision is approved.")}>
                <GitBranch aria-hidden /> Start a revision
              </Button>
            )}
            {data.plan.approved_version_id && can("plans.decide") && (
              <Button
                variant="ghost"
                className="text-danger"
                onClick={() =>
                  setNoteDialog({
                    title: "Withdraw approval",
                    label: "Reason (recorded in the audit trail)",
                    action: async (note) => {
                      await send(`/api/clinic/plans/${data.plan.id}/revoke-approval`, "POST", { reason: note });
                      toast.success("Approval withdrawn. The patient no longer sees this plan.");
                    },
                  })
                }
              >
                <RotateCcw aria-hidden /> Withdraw approval
              </Button>
            )}
          </>
        }
      />

      {!bundle ? (
        <Section title="No plan content yet">
          <p className="text-sm text-muted-foreground">Upload and extract a document from the patient&apos;s record, or add instructions manually.</p>
        </Section>
      ) : (
        <div className="grid gap-6 xl:grid-cols-[1fr_20rem]">
          <div className="space-y-6">
            <div role="note" className="flex gap-3 rounded-2xl border border-primary/15 bg-secondary/60 p-4 text-sm">
              <ShieldAlert className="mt-0.5 size-5 shrink-0 text-primary" aria-hidden />
              <p>
                AI-extracted content is a draft. Compare every item with its source before approval. AFTERCARE AI never fills in missing doses, frequencies, durations or dates — items marked
                <span className="font-semibold text-amber"> Not documented</span> stay empty unless you enter the documented value.
              </p>
            </div>

            {data.readiness.length > 0 && (
              <div role="alert" className="rounded-2xl border border-amber/30 bg-amber-soft p-4 text-sm text-amber">
                <p className="flex items-center gap-2 font-semibold">
                  <AlertTriangle className="size-4" aria-hidden /> Not ready for approval
                </p>
                <ul className="mt-1 list-disc pl-6">
                  {data.readiness.map((r) => (
                    <li key={r.code}>{r.message}</li>
                  ))}
                </ul>
              </div>
            )}

            {openFlags.length > 0 && (
              <Section title={`Flags needing a clinician (${openFlags.length})`} description="Uncertainties and conflicts found during extraction or raised by staff. Resolve each with a note.">
                <ul className="space-y-3">
                  {openFlags.map((f) => (
                    <li key={f.id} className={`rounded-xl border p-3 ${f.kind === "conflict" ? "border-danger/30 bg-danger-soft/50" : "border-amber/30 bg-amber-soft/50"}`}>
                      <div className="flex flex-wrap items-start justify-between gap-2">
                        <div className="min-w-0">
                          <Pill tone={f.kind === "conflict" ? "danger" : "amber"}>{f.kind === "conflict" ? "Conflict" : "Uncertainty"}</Pill>
                          <p className="mt-1.5 text-sm">{f.description}</p>
                          {f.excerpts.map((e, i) => (
                            <blockquote key={i} className="mt-1 border-l-2 border-primary/30 pl-2 text-xs text-muted-foreground italic">
                              “{e}”
                            </blockquote>
                          ))}
                        </div>
                        {editable && (
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() =>
                              setNoteDialog({
                                title: "Resolve flag",
                                label: "How was this resolved? (e.g. confirmed with the prescriber; corrected the dose to match page 2)",
                                action: (note) => applyEdits([{ op: "resolve_flag", id: f.id, note }]),
                              })
                            }
                          >
                            Resolve
                          </Button>
                        )}
                      </div>
                    </li>
                  ))}
                </ul>
              </Section>
            )}

            <Section title="Care episode details" action={editable && <Button size="sm" variant="outline" onClick={() => setDialog({ kind: "encounter", item: bundle.plan as unknown as Record<string, unknown> })}>Correct</Button>}>
              <dl className="grid gap-x-6 gap-y-2 text-sm sm:grid-cols-2">
                {(EDITABLE_FIELDS.encounter as readonly string[]).map((f) => {
                  const v = (bundle.plan as unknown as Record<string, string | null>)[f];
                  return (
                    <div key={f}>
                      <dt className="text-muted-foreground">{FIELD_LABELS[f] ?? f}</dt>
                      <dd className={v ? "font-medium" : "text-amber"}>{v ?? "Not documented"}</dd>
                    </div>
                  );
                })}
              </dl>
            </Section>

            {(
              [
                ["medication", "Medications", bundle.medications, "No medications documented."],
                ["task", "Care instructions (wound care, activity, diet)", bundle.tasks, "No care instructions documented."],
                ["follow_up", "Follow-up appointments", bundle.follow_ups, "No follow-ups documented."],
                ["warning_sign", "Warning signs documented by the care team", bundle.warning_signs, "No warning signs documented."],
              ] as const
            ).map(([kind, title, items, empty]) => (
              <ItemList
                key={kind}
                kind={kind}
                title={title}
                items={items as never}
                bundle={bundle}
                editable={editable}
                emptyText={empty}
                onAdd={() => setDialog({ kind, item: null })}
                onEdit={(item) => setDialog({ kind, item })}
                onRemove={(item) =>
                  setNoteDialog({ title: "Remove item", label: "Reason for removing (recorded in the history)", action: (note) => applyEdits([{ op: "remove", kind, id: item.id, note }]) })
                }
                onFlag={(item) =>
                  setNoteDialog({ title: "Flag for clarification", label: "What needs clarifying?", action: (note) => applyEdits([{ op: "flag_item", kind, id: item.id, note }]) })
                }
              />
            ))}

            {bundle.corrections.length > 0 && (
              <Section title="Change history (this version)">
                <ul className="divide-y text-sm">
                  {bundle.corrections
                    .slice()
                    .reverse()
                    .slice(0, 30)
                    .map((c) => (
                      <li key={c.id} className="py-2">
                        <span className="font-medium">{c.source === "clinician" ? "Clinician" : "Patient"}</span> · {c.field === "*" ? (c.new_value === "added" ? `added a ${c.entity_type.replace("_", " ")}` : `removed a ${c.entity_type.replace("_", " ")}`) : `${FIELD_LABELS[c.field] ?? c.field}: “${c.previous_value ?? "—"}” → “${c.new_value ?? "—"}”`}
                        {c.note && <span className="text-muted-foreground"> — {c.note}</span>}
                        <span className="block text-xs text-muted-foreground">{formatDate(c.created_at, true)}</span>
                      </li>
                    ))}
                </ul>
              </Section>
            )}
          </div>

          <div className="space-y-6">
            <Section title="Source documents">
              {data.documents.length === 0 ? (
                <p className="text-sm text-muted-foreground">No documents uploaded for this episode.</p>
              ) : (
                <ul className="space-y-2 text-sm">
                  {data.documents.map((d) => (
                    <li key={d.id} className="rounded-lg border p-2.5">
                      <a href={`/api/clinic/documents/${d.id}/file`} target="_blank" rel="noopener noreferrer" className="inline-flex max-w-full items-center gap-1 font-medium hover:text-teal">
                        <span className="truncate">{d.original_filename}</span> <ExternalLink className="size-3.5 shrink-0" aria-hidden />
                      </a>
                      <div className="mt-1 flex flex-wrap gap-1.5 text-xs text-muted-foreground">
                        {DOCUMENT_TYPE_LABELS[d.document_type] ?? d.document_type}
                        <Pill tone={PROCESSING_LABELS[d.processing_status]?.tone ?? "neutral"}>{PROCESSING_LABELS[d.processing_status]?.label ?? d.processing_status}</Pill>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
              <Link href={`/clinic/patients/${data.patient.id}`} className="mt-3 inline-block text-sm font-semibold text-teal hover:underline">
                Upload or extract documents
              </Link>
            </Section>

            <Section title="Versions">
              <ol className="space-y-3 text-sm">
                {data.versions.map((v) => (
                  <li key={v.id} className="flex items-start justify-between gap-2">
                    <span>
                      <span className="font-semibold">Version {v.version}</span>
                      <span className="block text-xs text-muted-foreground">
                        Started {formatDate(v.created_at)} by {v.created_by_name ?? "—"}
                        {v.submitted_at && ` · submitted by ${v.submitted_by_name ?? "—"}`}
                      </span>
                    </span>
                    <VersionStatus status={v.status} />
                  </li>
                ))}
              </ol>
            </Section>

            <Section title="Clinical decisions">
              {data.approvals.length === 0 ? (
                <p className="text-sm text-muted-foreground">No decisions yet.</p>
              ) : (
                <ol className="space-y-3 text-sm">
                  {data.approvals.map((a) => (
                    <li key={a.id}>
                      <span className="font-semibold">{a.decision === "approved" ? "Approved" : a.decision === "rejected" ? "Rejected" : "Changes requested"}</span> · v{a.version}
                      <span className="block text-xs text-muted-foreground">
                        {a.clinician_name ?? "Clinician"} · {formatDate(a.decided_at, true)}
                      </span>
                      {a.comments && <p className="mt-0.5 text-xs">{a.comments}</p>}
                    </li>
                  ))}
                </ol>
              )}
            </Section>
          </div>
        </div>
      )}

      {dialog && (
        <ItemDialog
          kind={dialog.kind}
          item={dialog.item}
          onClose={() => setDialog(null)}
          onSave={async (values, note) => {
            try {
              if (!dialog.item) {
                await applyEdits([{ op: "add", kind: dialog.kind as ItemKind, fields: values }]);
                toast.success("Item added.");
              } else {
                const id = dialog.kind === "encounter" ? "" : (dialog.item.id as string);
                const edits: Edit[] = Object.entries(values).map(([field, value]) => ({ op: "correct", kind: dialog.kind, id: dialog.kind === "encounter" ? field : id, field, value, note }));
                if (edits.length) {
                  await applyEdits(edits);
                  toast.success("Correction saved.");
                }
              }
            } catch (err) {
              throw new Error(err instanceof ClientError ? err.message : "We could not save the change.");
            }
          }}
        />
      )}
      {noteDialog && <NoteDialog {...noteDialog} onClose={() => setNoteDialog(null)} onDone={reload} />}
      {decision && current && <DecisionDialog decision={decision} versionId={current.id} onClose={() => setDecision(null)} onDone={reload} />}
    </>
  );
}

function NoteDialog({ title, label, action, onClose, onDone }: { title: string; label: string; action: (note: string) => Promise<void>; onClose: () => void; onDone: () => void }) {
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="w-[calc(100vw-1.5rem)] sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>This is recorded with your name and the time.</DialogDescription>
        </DialogHeader>
        <Field label={label} htmlFor="note-input" required>
          <Input id="note-input" value={note} onChange={(e) => setNote(e.target.value)} maxLength={500} autoFocus />
        </Field>
        {error && <p role="alert" className="text-sm text-danger">{error}</p>}
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button
            disabled={busy || note.trim().length < 3}
            onClick={async () => {
              setBusy(true);
              setError(null);
              try {
                await action(note.trim());
                onClose();
                onDone();
              } catch (err) {
                setError(err instanceof ClientError ? err.message : "We could not save this. Please try again.");
              } finally {
                setBusy(false);
              }
            }}
          >
            {busy && <Loader2 className="animate-spin" aria-hidden />} Save
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function DecisionDialog({ decision, versionId, onClose, onDone }: { decision: "approved" | "rejected" | "changes_requested"; versionId: string; onClose: () => void; onDone: () => void }) {
  const [comments, setComments] = useState("");
  const [attest, setAttest] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const approving = decision === "approved";
  const title = approving ? "Approve this recovery plan" : decision === "rejected" ? "Reject this version" : "Request changes";
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="w-[calc(100vw-1.5rem)] sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>
            {approving
              ? "Once approved, this version is shown to the patient as approved by you, with your name and the date. It cannot be edited afterwards; changes need a new version and a new approval."
              : "The version returns to the team with your comment. The patient does not see it."}
          </DialogDescription>
        </DialogHeader>
        <Field label={approving ? "Comment (optional)" : "Comment"} htmlFor="decision-comment" required={!approving}>
          <Textarea id="decision-comment" value={comments} onChange={(e) => setComments(e.target.value)} maxLength={2000} rows={3} />
        </Field>
        {approving && (
          <label className="flex items-start gap-3 rounded-lg border p-3 text-sm">
            <Checkbox checked={attest} onCheckedChange={(v) => setAttest(v === true)} className="mt-0.5" aria-describedby="attest-text" />
            <span id="attest-text">
              I have compared this plan with the source documents and confirm it accurately reflects the documented instructions for this patient.
            </span>
          </label>
        )}
        {error && <p role="alert" className="text-sm text-danger">{error}</p>}
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button
            disabled={busy || (approving ? !attest : comments.trim().length === 0)}
            className={decision === "rejected" ? "bg-danger text-white hover:bg-danger/90" : undefined}
            onClick={async () => {
              setBusy(true);
              setError(null);
              try {
                await send(`/api/clinic/versions/${versionId}/decision`, "POST", { decision, comments: comments.trim() || undefined, attest: approving ? true : undefined });
                toast.success(approving ? "Plan approved. The patient can now see it once they link their account." : "Decision recorded.");
                onClose();
                onDone();
              } catch (err) {
                setError(err instanceof ClientError ? err.message : "We could not record the decision.");
              } finally {
                setBusy(false);
              }
            }}
          >
            {busy && <Loader2 className="animate-spin" aria-hidden />} {approving ? "Approve plan" : decision === "rejected" ? "Reject" : "Request changes"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
