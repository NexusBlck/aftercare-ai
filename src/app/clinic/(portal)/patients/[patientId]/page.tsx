"use client";

import { Archive, ArchiveRestore, Copy, ExternalLink, FilePlus2, Link2, Loader2, Plus, Sparkles, Trash2 } from "lucide-react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";
import { useClinic } from "@/components/clinic/clinic-context";
import { DocumentUploader } from "@/components/clinic/document-uploader";
import { ClinicPageHeader, EmptyState, ErrorState, Field, formatDate, LoadingRows, Pill, Section, VersionStatus } from "@/components/clinic/ui";
import { send, useApi } from "@/components/clinic/use-api";
import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { deliverySentence, type InvitationResult } from "@/lib/clinic/invitation-copy";
import { DOCUMENT_TYPE_LABELS, PROCESSING_LABELS } from "@/lib/clinic/labels";
import { ClientError } from "@/lib/client/http";

interface PatientDetail {
  patient: {
    id: string;
    full_name: string;
    date_of_birth: string;
    mrn: string | null;
    email: string | null;
    phone: string | null;
    preferred_language: "en" | "ur";
    emergency_contact_name: string | null;
    emergency_contact_phone: string | null;
    consent_status: string;
    status: "active" | "archived";
    linked_at: string | null;
    created_at: string;
  };
  episodes: Array<{ id: string; title: string; department: string | null; admission_date: string | null; discharge_date: string | null; status: string; created_at: string }>;
  documents: Array<{
    id: string;
    episode_id: string;
    original_filename: string;
    document_type: string;
    processing_status: string;
    processing_error: string | null;
    shared_with_patient: boolean;
    created_at: string;
  }>;
  plans: Array<{ id: string; episode_id: string; title: string; approved_version_id: string | null; versions: Array<{ id: string; version: number; status: string; updated_at: string }> }>;
  invitations: Array<{ id: string; expires_at: string; redeemed_at: string | null; revoked_at: string | null; failed_attempts: number; created_at: string }>;
  questions: Array<{ id: string; subject: string; status: string; urgent_keywords: boolean; updated_at: string }>;
  progress: Array<{ version_id: string; item_kind: string; item_id: string; action: string; created_at: string }>;
  followUps: Array<{ plan_id: string; due: string; patient_status: string; staff_status: string; item: { id: string; specialty: string | null; clinician: string | null; scheduled_date: string | null } }>;
}

const CONSENT_LABELS: Record<string, string> = { not_recorded: "Not recorded", verbal: "Verbal", written: "Written", declined: "Declined" };

function invitationState(inv: PatientDetail["invitations"][number]) {
  if (inv.redeemed_at) return { label: "Accepted", tone: "teal" as const };
  if (inv.revoked_at) return { label: inv.failed_attempts >= 5 ? "Locked" : "Withdrawn", tone: "neutral" as const };
  if (new Date(inv.expires_at) < new Date()) return { label: "Expired", tone: "neutral" as const };
  return { label: "Pending", tone: "amber" as const };
}

export default function PatientDetailPage() {
  const { patientId } = useParams<{ patientId: string }>();
  const { can, active } = useClinic();
  const { data, error, loading, reload } = useApi<PatientDetail>(`/api/clinic/patients/${patientId}`);
  const [episodeOpen, setEpisodeOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [archiveOpen, setArchiveOpen] = useState(false);
  const [invite, setInvite] = useState<InvitationResult | null>(null);
  const [emailInvite, setEmailInvite] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);

  const run = async (key: string, fn: () => Promise<unknown>, success?: string) => {
    setBusy(key);
    try {
      await fn();
      if (success) toast.success(success);
      await reload();
    } catch (err) {
      toast.error(err instanceof ClientError ? err.message : "Something went wrong. Please try again.");
    } finally {
      setBusy(null);
    }
  };

  if (error) return <ErrorState error={error} onRetry={reload} />;
  if (loading && !data) return <LoadingRows rows={6} />;
  if (!data) return null;
  const { patient } = data;
  const archived = patient.status === "archived";
  const approvedPlan = data.plans.some((p) => p.approved_version_id);
  const pendingInvite = data.invitations.find((i) => invitationState(i).label === "Pending");

  return (
    <>
      <ClinicPageHeader
        eyebrow={<Link href="/clinic/patients" className="hover:underline">Patients</Link>}
        title={patient.full_name}
        description={
          <span className="flex flex-wrap items-center gap-2">
            <span>Born {formatDate(patient.date_of_birth)}</span>
            {patient.mrn && <span>· Ref {patient.mrn}</span>}
            {archived && <Pill>Archived</Pill>}
            {patient.linked_at ? <Pill tone="teal">Patient app linked {formatDate(patient.linked_at)}</Pill> : <Pill>Patient app not linked</Pill>}
          </span>
        }
        actions={
          <>
            {can("patients.write") && !archived && (
              <Button variant="outline" onClick={() => setEditOpen(true)}>
                Edit details
              </Button>
            )}
            {can("patients.archive") && (
              <Button variant="outline" onClick={() => setArchiveOpen(true)}>
                {archived ? <ArchiveRestore aria-hidden /> : <Archive aria-hidden />} {archived ? "Restore" : "Archive"}
              </Button>
            )}
          </>
        }
      />

      <div className="grid gap-6 xl:grid-cols-[1fr_22rem]">
        <div className="space-y-6">
          <Section
            title="Care episodes"
            description="Each discharge or procedure has its own documents and recovery plan."
            action={
              can("patients.write") &&
              !archived && (
                <Button size="sm" variant="outline" onClick={() => setEpisodeOpen(true)}>
                  <Plus aria-hidden /> New episode
                </Button>
              )
            }
          >
            {data.episodes.length === 0 ? (
              <EmptyState title="No care episodes yet" description="Add an episode (for example the procedure and discharge date) to upload documents for it." />
            ) : (
              <div className="space-y-5">
                {data.episodes.map((ep) => {
                  const docs = data.documents.filter((d) => d.episode_id === ep.id);
                  const plan = data.plans.find((p) => p.episode_id === ep.id);
                  const latest = plan?.versions.slice().sort((a, b) => b.version - a.version)[0];
                  return (
                    <article key={ep.id} className="rounded-xl border p-4">
                      <div className="flex flex-wrap items-start justify-between gap-3">
                        <div>
                          <h3 className="font-bold">{ep.title}</h3>
                          <p className="text-sm text-muted-foreground">
                            {ep.department ? `${ep.department} · ` : ""}
                            {ep.discharge_date ? `Discharged ${formatDate(ep.discharge_date)}` : "Discharge date not recorded"}
                          </p>
                        </div>
                        {plan ? (
                          <Button asChild size="sm">
                            <Link href={`/clinic/plans/${plan.id}`}>
                              Open plan {latest && <span className="ml-1"><VersionStatus status={plan.approved_version_id && latest.status === "approved" ? "approved" : latest.status} /></span>}
                            </Link>
                          </Button>
                        ) : (
                          can("plans.edit") &&
                          !archived && (
                            <Button
                              size="sm"
                              variant="outline"
                              disabled={busy === `plan-${ep.id}`}
                              onClick={() => run(`plan-${ep.id}`, () => send(`/api/clinic/episodes/${ep.id}/plan`, "POST"), "Empty plan created. Add the documented instructions.")}
                            >
                              <FilePlus2 aria-hidden /> Start plan manually
                            </Button>
                          )
                        )}
                      </div>

                      <ul className="mt-4 divide-y rounded-lg border">
                        {docs.length === 0 && <li className="px-3 py-3 text-sm text-muted-foreground">No documents uploaded for this episode.</li>}
                        {docs.map((d) => {
                          const status = PROCESSING_LABELS[d.processing_status] ?? { label: d.processing_status, tone: "neutral" as const };
                          return (
                            <li key={d.id} className="flex flex-col gap-2 px-3 py-3 sm:flex-row sm:items-center sm:justify-between">
                              <div className="min-w-0">
                                <a href={`/api/clinic/documents/${d.id}/file`} target="_blank" rel="noopener noreferrer" className="inline-flex max-w-full items-center gap-1 truncate font-medium hover:text-teal">
                                  <span className="truncate">{d.original_filename}</span> <ExternalLink className="size-3.5 shrink-0" aria-hidden />
                                </a>
                                <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                                  <span>{DOCUMENT_TYPE_LABELS[d.document_type] ?? d.document_type}</span>
                                  <Pill tone={status.tone}>{status.label}</Pill>
                                  {d.processing_error && <span className="text-danger">{d.processing_error}</span>}
                                </div>
                              </div>
                              <div className="flex shrink-0 flex-wrap items-center gap-2">
                                {can("documents.share") && d.processing_status === "processed" && (
                                  <label className="flex items-center gap-2 text-xs font-medium">
                                    <Switch
                                      checked={d.shared_with_patient}
                                      onCheckedChange={(v) => run(`share-${d.id}`, () => send(`/api/clinic/documents/${d.id}`, "PATCH", { shared_with_patient: v }), v ? "Shared with the patient." : "No longer shared.")}
                                      aria-label={`Share ${d.original_filename} with the patient`}
                                    />
                                    Share with patient
                                  </label>
                                )}
                                {["uploaded", "failed", "processed"].includes(d.processing_status) && !archived && (
                                  <Button
                                    size="sm"
                                    variant="outline"
                                    disabled={busy === `process-${d.id}`}
                                    onClick={() =>
                                      run(
                                        `process-${d.id}`,
                                        async () => {
                                          const res = await send<{ embedded_instructions_detected: boolean }>(`/api/clinic/documents/${d.id}/process`, "POST");
                                          if (res.embedded_instructions_detected) toast.warning("The document contained text that tried to instruct the AI. It was ignored and flagged for review.");
                                        },
                                        "Extraction finished. Review the draft plan.",
                                      )
                                    }
                                  >
                                    {busy === `process-${d.id}` ? <Loader2 className="animate-spin" aria-hidden /> : <Sparkles aria-hidden />}
                                    {d.processing_status === "processed" ? "Re-extract" : "Extract with AI"}
                                  </Button>
                                )}
                                {can("documents.delete") && (
                                  <Button size="icon" variant="ghost" aria-label={`Delete ${d.original_filename}`} onClick={() => run(`del-${d.id}`, () => send(`/api/clinic/documents/${d.id}`, "DELETE"), "Document deleted.")}>
                                    <Trash2 aria-hidden />
                                  </Button>
                                )}
                              </div>
                            </li>
                          );
                        })}
                      </ul>
                      {can("documents.upload") && !archived && (
                        <div className="mt-3">
                          <DocumentUploader episodeId={ep.id} onUploaded={reload} disabled={!active.entitlements.active} />
                        </div>
                      )}
                    </article>
                  );
                })}
              </div>
            )}
          </Section>

          <Section title="Follow-ups" description="From approved plans. Patient reports and staff verification are shown separately.">
            {data.followUps.length === 0 ? (
              <p className="text-sm text-muted-foreground">No documented follow-ups in an approved plan.</p>
            ) : (
              <ul className="divide-y">
                {data.followUps.map((f) => (
                  <li key={`${f.plan_id}-${f.item.id}`} className="flex flex-wrap items-center justify-between gap-2 py-2.5 text-sm">
                    <span>
                      <span className="font-semibold">{f.item.specialty ?? f.item.clinician ?? "Follow-up"}</span> · {formatDate(f.item.scheduled_date)}
                    </span>
                    <span className="flex gap-2">
                      {f.patient_status !== "none" && <Pill tone="navy">Patient: {f.patient_status.replace("reported_", "").replace("_", " ")}</Pill>}
                      <Pill tone={f.due === "overdue" ? "danger" : f.due === "done" ? "teal" : "neutral"}>{f.staff_status === "unverified" ? f.due : f.staff_status.replace("verified_", "verified ")}</Pill>
                    </span>
                  </li>
                ))}
              </ul>
            )}
            <Link href="/clinic/follow-ups" className="mt-3 inline-block text-sm font-semibold text-teal hover:underline">
              Manage follow-ups
            </Link>
          </Section>
        </div>

        <div className="space-y-6">
          <Section title="Patient app access">
            {patient.linked_at ? (
              <p className="text-sm">
                The patient linked their account on {formatDate(patient.linked_at)} and can see approved plans only.
              </p>
            ) : (
              <>
                <p className="text-sm text-muted-foreground">
                  {approvedPlan ? "Invite the patient to view their approved plan in the AFTERCARE AI app." : "An invitation can be created once a recovery plan has been approved."}
                </p>
                {can("invitations.manage") && !archived && patient.email && approvedPlan && (
                  <label className="mt-3 flex items-start gap-2 text-sm">
                    <Checkbox checked={emailInvite} onCheckedChange={(v) => setEmailInvite(v === true)} className="mt-0.5" />
                    <span>
                      Email the link to <span className="font-medium break-all">{patient.email}</span>
                    </span>
                  </label>
                )}
                {can("invitations.manage") && !archived && (
                  <Button
                    className="mt-3 w-full"
                    disabled={!approvedPlan || busy === "invite" || !active.entitlements.active}
                    onClick={() =>
                      run("invite", async () => {
                        const res = await send<InvitationResult>(`/api/clinic/patients/${patient.id}/invitations`, "POST", {
                          send_email: emailInvite && !!patient.email,
                        });
                        setInvite(res);
                      })
                    }
                  >
                    <Link2 aria-hidden /> {pendingInvite ? "Create a new invitation" : "Create invitation"}
                  </Button>
                )}
              </>
            )}
            {data.invitations.length > 0 && (
              <ul className="mt-4 divide-y border-t text-sm">
                {data.invitations.slice(0, 5).map((inv) => {
                  const s = invitationState(inv);
                  return (
                    <li key={inv.id} className="flex items-center justify-between gap-2 py-2">
                      <span className="text-muted-foreground">
                        {formatDate(inv.created_at)} · expires {formatDate(inv.expires_at)}
                      </span>
                      <span className="flex items-center gap-1">
                        <Pill tone={s.tone}>{s.label}</Pill>
                        {s.label === "Pending" && can("invitations.manage") && (
                          <Button size="sm" variant="ghost" onClick={() => run(`revoke-${inv.id}`, () => send(`/api/clinic/invitations/${inv.id}`, "DELETE"), "Invitation withdrawn.")}>
                            Withdraw
                          </Button>
                        )}
                      </span>
                    </li>
                  );
                })}
              </ul>
            )}
          </Section>

          <Section title="Details">
            <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 text-sm">
              <dt className="text-muted-foreground">Email</dt>
              <dd className="truncate">{patient.email ?? "—"}</dd>
              <dt className="text-muted-foreground">Phone</dt>
              <dd>{patient.phone ?? "—"}</dd>
              <dt className="text-muted-foreground">Language</dt>
              <dd>{patient.preferred_language === "ur" ? "Urdu" : "English"}</dd>
              <dt className="text-muted-foreground">Emergency contact</dt>
              <dd>{patient.emergency_contact_name ? `${patient.emergency_contact_name}${patient.emergency_contact_phone ? ` · ${patient.emergency_contact_phone}` : ""}` : "—"}</dd>
              <dt className="text-muted-foreground">Consent</dt>
              <dd>{CONSENT_LABELS[patient.consent_status] ?? patient.consent_status}</dd>
              <dt className="text-muted-foreground">Registered</dt>
              <dd>{formatDate(patient.created_at)}</dd>
            </dl>
          </Section>

          <Section title="Engagement" description="What the patient has acknowledged or completed in the app.">
            {data.progress.length === 0 ? (
              <p className="text-sm text-muted-foreground">No activity recorded yet.</p>
            ) : (
              <p className="text-sm">
                <span className="font-semibold">{data.progress.filter((p) => p.action === "completed").length}</span> tasks marked done ·{" "}
                <span className="font-semibold">{data.progress.filter((p) => p.action === "acknowledged").length}</span> instructions acknowledged · last activity{" "}
                {formatDate(data.progress[0].created_at, true)}
              </p>
            )}
          </Section>

          <Section title="Questions from the patient">
            {data.questions.length === 0 ? (
              <p className="text-sm text-muted-foreground">No questions yet.</p>
            ) : (
              <ul className="divide-y text-sm">
                {data.questions.map((q) => (
                  <li key={q.id} className="flex items-center justify-between gap-2 py-2">
                    <Link href={`/clinic/questions/${q.id}`} className="truncate font-medium hover:text-teal">
                      {q.subject}
                    </Link>
                    <span className="flex gap-1">
                      {q.urgent_keywords && <Pill tone="danger">Possible urgent</Pill>}
                      <Pill>{q.status.replace("_", " ")}</Pill>
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </Section>
        </div>
      </div>

      <EpisodeDialog open={episodeOpen} onOpenChange={setEpisodeOpen} patientId={patient.id} onCreated={reload} />
      {editOpen && <EditPatientDialog patient={patient} onClose={() => setEditOpen(false)} onSaved={reload} />}
      <ConfirmDialog
        open={archiveOpen}
        onOpenChange={setArchiveOpen}
        title={archived ? "Restore this patient?" : "Archive this patient?"}
        description={
          archived
            ? "The patient becomes active again and counts towards your plan's active-patient limit."
            : "Archived patients are hidden from the active list and lose access to the patient app. Records are kept for the retention period."
        }
        confirmLabel={archived ? "Restore" : "Archive"}
        destructive={!archived}
        onConfirm={() => run("archive", () => send(`/api/clinic/patients/${patient.id}`, "PATCH", { status: archived ? "active" : "archived" }), archived ? "Patient restored." : "Patient archived.")}
      />
      <Dialog open={!!invite} onOpenChange={(o) => !o && setInvite(null)}>
        <DialogContent className="w-[calc(100vw-1.5rem)] sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{invite?.delivery === "email" ? "Invitation sent" : "Invitation link created"}</DialogTitle>
            <DialogDescription>
              {invite && deliverySentence(invite, patient.email)} Use a channel your clinic trusts. The link works once, expires on {formatDate(invite?.expires_at, true)}, and the
              patient must confirm their date of birth. It is shown only now.
            </DialogDescription>
          </DialogHeader>
          <div className="flex gap-2">
            <Input readOnly value={invite?.link ?? ""} aria-label="Invitation link" onFocus={(e) => e.currentTarget.select()} />
            <Button
              variant="outline"
              onClick={async () => {
                await navigator.clipboard.writeText(invite?.link ?? "");
                toast.success("Link copied.");
              }}
            >
              <Copy aria-hidden /> Copy
            </Button>
          </div>
          <DialogFooter>
            <Button onClick={() => setInvite(null)}>Done</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

function EpisodeDialog({ open, onOpenChange, patientId, onCreated }: { open: boolean; onOpenChange: (o: boolean) => void; patientId: string; onCreated: () => void }) {
  const [form, setForm] = useState({ title: "", department: "", admission_date: "", discharge_date: "" });
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const submit = async () => {
    setBusy(true);
    setError(null);
    try {
      await send(`/api/clinic/patients/${patientId}/episodes`, "POST", {
        title: form.title,
        department: form.department,
        admission_date: form.admission_date || null,
        discharge_date: form.discharge_date || null,
      });
      toast.success("Care episode added.");
      setForm({ title: "", department: "", admission_date: "", discharge_date: "" });
      onOpenChange(false);
      onCreated();
    } catch (err) {
      setError(err instanceof ClientError ? err.message : "We could not add the episode.");
    } finally {
      setBusy(false);
    }
  };
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-[calc(100vw-1.5rem)] sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>New care episode</DialogTitle>
          <DialogDescription>For example a procedure, admission or discharge you are preparing instructions for.</DialogDescription>
        </DialogHeader>
        <div className="grid gap-4">
          <Field label="Procedure or reason for care" htmlFor="ep-title" required>
            <Input id="ep-title" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} maxLength={160} />
          </Field>
          <Field label="Department" htmlFor="ep-dept">
            <Input id="ep-dept" value={form.department} onChange={(e) => setForm({ ...form, department: e.target.value })} maxLength={80} />
          </Field>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Admission date" htmlFor="ep-adm">
              <Input id="ep-adm" type="date" value={form.admission_date} onChange={(e) => setForm({ ...form, admission_date: e.target.value })} />
            </Field>
            <Field label="Discharge date" htmlFor="ep-dis">
              <Input id="ep-dis" type="date" value={form.discharge_date} onChange={(e) => setForm({ ...form, discharge_date: e.target.value })} />
            </Field>
          </div>
          {error && <p role="alert" className="text-sm text-danger">{error}</p>}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={submit} disabled={busy || form.title.trim().length < 2}>
            {busy && <Loader2 className="animate-spin" aria-hidden />} Add episode
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function EditPatientDialog({ patient, onClose, onSaved }: { patient: PatientDetail["patient"]; onClose: () => void; onSaved: () => void }) {
  const [form, setForm] = useState({
    full_name: patient.full_name,
    mrn: patient.mrn ?? "",
    email: patient.email ?? "",
    phone: patient.phone ?? "",
    emergency_contact_name: patient.emergency_contact_name ?? "",
    emergency_contact_phone: patient.emergency_contact_phone ?? "",
    consent_status: patient.consent_status,
    preferred_language: patient.preferred_language,
  });
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const save = async () => {
    setBusy(true);
    setError(null);
    try {
      await send(`/api/clinic/patients/${patient.id}`, "PATCH", form);
      toast.success("Patient details saved.");
      onClose();
      onSaved();
    } catch (err) {
      setError(err instanceof ClientError ? err.message : "We could not save the details.");
    } finally {
      setBusy(false);
    }
  };
  const input = (key: keyof typeof form, label: string, type = "text") => (
    <Field label={label} htmlFor={`edit-${key}`}>
      <Input id={`edit-${key}`} type={type} value={form[key]} onChange={(e) => setForm({ ...form, [key]: e.target.value })} />
    </Field>
  );
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[90dvh] w-[calc(100vw-1.5rem)] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Edit patient details</DialogTitle>
          <DialogDescription>Date of birth cannot be changed here because it is used for identity verification.</DialogDescription>
        </DialogHeader>
        <div className="grid gap-4">
          {input("full_name", "Full name")}
          {input("mrn", "Clinic reference (MRN)")}
          {input("email", "Email", "email")}
          {input("phone", "Phone", "tel")}
          {input("emergency_contact_name", "Emergency contact name")}
          {input("emergency_contact_phone", "Emergency contact phone", "tel")}
          <Field label="Consent" htmlFor="edit-consent">
            <select id="edit-consent" className="h-10 rounded-lg border border-input bg-card px-3 text-sm" value={form.consent_status} onChange={(e) => setForm({ ...form, consent_status: e.target.value })}>
              {Object.entries(CONSENT_LABELS).map(([k, v]) => (
                <option key={k} value={k}>
                  {v}
                </option>
              ))}
            </select>
          </Field>
          {error && <p role="alert" className="text-sm text-danger">{error}</p>}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={save} disabled={busy}>
            {busy && <Loader2 className="animate-spin" aria-hidden />} Save
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
