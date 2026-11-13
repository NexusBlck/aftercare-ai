"use client";

import { Copy, Loader2, UserPlus } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { useClinic } from "@/components/clinic/clinic-context";
import { ClinicPageHeader, ErrorState, Field, formatDate, LoadingRows, NativeSelect, Pill, Section } from "@/components/clinic/ui";
import { send, useApi } from "@/components/clinic/use-api";
import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { ROLE_LABELS, type ClinicRole } from "@/lib/clinic/permissions";
import { ClientError } from "@/lib/client/http";

interface Staff {
  members: Array<{ id: string; user_id: string; role: ClinicRole; clinical_reviewer: boolean; status: "active" | "revoked"; display_name: string | null; email: string | null; created_at: string }>;
  invitations: Array<{ id: string; email: string; role: ClinicRole; expires_at: string; created_at: string }>;
  me: string;
  assignable: ClinicRole[];
}

export default function StaffPage() {
  const { can } = useClinic();
  const { data, error, loading, reload } = useApi<Staff>("/api/clinic/staff");
  const [inviteOpen, setInviteOpen] = useState(false);
  const [link, setLink] = useState<string | null>(null);
  const [revoke, setRevoke] = useState<Staff["members"][number] | null>(null);
  const manage = can("staff.manage");

  const patch = async (id: string, body: Record<string, unknown>, success: string) => {
    try {
      await send(`/api/clinic/staff/members/${id}`, "PATCH", body);
      toast.success(success);
      await reload();
    } catch (err) {
      toast.error(err instanceof ClientError ? err.message : "We could not update the staff member.");
    }
  };

  return (
    <>
      <ClinicPageHeader
        title="Staff"
        description="People who can access this clinic's records. Access ends immediately when revoked."
        actions={
          manage && (
            <Button onClick={() => setInviteOpen(true)}>
              <UserPlus aria-hidden /> Invite staff
            </Button>
          )
        }
      />
      {error && <ErrorState error={error} onRetry={reload} />}
      {loading && !data && <LoadingRows />}
      {data && (
        <div className="space-y-6">
          <Section title={`Members (${data.members.filter((m) => m.status === "active").length} active)`}>
            <ul className="divide-y">
              {data.members.map((m) => {
                const editable = manage && m.id !== data.me && m.role !== "owner" && data.assignable.includes(m.role);
                return (
                  <li key={m.id} className="flex flex-col gap-3 py-3 sm:flex-row sm:items-center sm:justify-between">
                    <div className="min-w-0">
                      <p className="font-semibold">
                        {m.display_name ?? m.email ?? "Staff member"} {m.id === data.me && <span className="text-sm font-normal text-muted-foreground">(you)</span>}
                      </p>
                      <p className="truncate text-sm text-muted-foreground">
                        {m.email} · joined {formatDate(m.created_at)}
                      </p>
                      <div className="mt-1 flex flex-wrap gap-1.5">
                        <Pill tone="navy">{ROLE_LABELS[m.role]}</Pill>
                        {m.clinical_reviewer && <Pill tone="teal">Can approve plans</Pill>}
                        {m.status === "revoked" && <Pill tone="danger">Access revoked</Pill>}
                      </div>
                    </div>
                    {editable && (
                      <div className="flex shrink-0 flex-wrap items-center gap-2">
                        {m.status === "active" ? (
                          <>
                            <NativeSelect value={m.role} onChange={(e) => void patch(m.id, { role: e.target.value }, "Role updated.")} className="w-40" aria-label={`Role for ${m.display_name ?? m.email}`}>
                              {data.assignable.map((r) => (
                                <option key={r} value={r}>
                                  {ROLE_LABELS[r]}
                                </option>
                              ))}
                            </NativeSelect>
                            {m.role === "admin" && (
                              <label className="flex items-center gap-1.5 text-xs">
                                <Checkbox checked={m.clinical_reviewer} onCheckedChange={(v) => void patch(m.id, { clinical_reviewer: v === true }, "Updated.")} />
                                Clinical reviewer
                              </label>
                            )}
                            <Button variant="outline" size="sm" className="text-danger" onClick={() => setRevoke(m)}>
                              Revoke access
                            </Button>
                          </>
                        ) : (
                          <Button variant="outline" size="sm" onClick={() => void patch(m.id, { status: "active" }, "Access reinstated.")}>
                            Reinstate
                          </Button>
                        )}
                      </div>
                    )}
                  </li>
                );
              })}
            </ul>
          </Section>
          {manage && (
            <Section title="Pending invitations">
              {data.invitations.length === 0 ? (
                <p className="text-sm text-muted-foreground">No pending invitations.</p>
              ) : (
                <ul className="divide-y">
                  {data.invitations.map((i) => (
                    <li key={i.id} className="flex flex-wrap items-center justify-between gap-2 py-2.5 text-sm">
                      <span>
                        <span className="font-semibold">{i.email}</span> · {ROLE_LABELS[i.role]} · expires {formatDate(i.expires_at, true)}
                      </span>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={async () => {
                          await send(`/api/clinic/staff/invitations/${i.id}`, "DELETE").catch(() => toast.error("Could not withdraw the invitation."));
                          await reload();
                        }}
                      >
                        Withdraw
                      </Button>
                    </li>
                  ))}
                </ul>
              )}
            </Section>
          )}
        </div>
      )}
      {inviteOpen && data && (
        <InviteDialog
          assignable={data.assignable}
          onClose={() => setInviteOpen(false)}
          onCreated={(l) => {
            setInviteOpen(false);
            setLink(l);
            void reload();
          }}
        />
      )}
      <Dialog open={!!link} onOpenChange={(o) => !o && setLink(null)}>
        <DialogContent className="w-[calc(100vw-1.5rem)] sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Invitation link created</DialogTitle>
            <DialogDescription>
              No email has been sent. Share this link privately with the invited person. They must sign in with the invited email address. It works once, expires in 7 days and is shown only now.
            </DialogDescription>
          </DialogHeader>
          <div className="flex gap-2">
            <Input readOnly value={link ?? ""} aria-label="Invitation link" onFocus={(e) => e.currentTarget.select()} />
            <Button variant="outline" onClick={async () => { await navigator.clipboard.writeText(link ?? ""); toast.success("Link copied."); }}>
              <Copy aria-hidden /> Copy
            </Button>
          </div>
          <DialogFooter>
            <Button onClick={() => setLink(null)}>Done</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <ConfirmDialog
        open={!!revoke}
        onOpenChange={(o) => !o && setRevoke(null)}
        title="Revoke access?"
        description={`${revoke?.display_name ?? revoke?.email ?? "This person"} will immediately lose access to all of this clinic's records. You can reinstate them later.`}
        confirmLabel="Revoke access"
        destructive
        onConfirm={() => revoke && void patch(revoke.id, { status: "revoked" }, "Access revoked.")}
      />
    </>
  );
}

function InviteDialog({ assignable, onClose, onCreated }: { assignable: ClinicRole[]; onClose: () => void; onCreated: (link: string) => void }) {
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<ClinicRole>(assignable.includes("nurse") ? "nurse" : assignable[0]);
  const [reviewer, setReviewer] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="w-[calc(100vw-1.5rem)] sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Invite a staff member</DialogTitle>
          <DialogDescription>Clinicians can approve recovery plans. Nurses and staff register patients, upload documents and monitor follow-ups.</DialogDescription>
        </DialogHeader>
        <div className="grid gap-4">
          <Field label="Work email" htmlFor="inv-email" required>
            <Input id="inv-email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} maxLength={254} autoFocus />
          </Field>
          <Field label="Role" htmlFor="inv-role">
            <NativeSelect id="inv-role" value={role} onChange={(e) => setRole(e.target.value as ClinicRole)}>
              {assignable.map((r) => (
                <option key={r} value={r}>
                  {ROLE_LABELS[r]}
                </option>
              ))}
            </NativeSelect>
          </Field>
          {role === "admin" && (
            <label className="flex items-start gap-2 text-sm">
              <Checkbox checked={reviewer} onCheckedChange={(v) => setReviewer(v === true)} className="mt-0.5" />
              This administrator is a licensed clinician who may approve recovery plans
            </label>
          )}
          {error && <p role="alert" className="text-sm text-danger">{error}</p>}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button
            disabled={busy || !email.includes("@")}
            onClick={async () => {
              setBusy(true);
              setError(null);
              try {
                const res = await send<{ link: string }>("/api/clinic/staff", "POST", { email, role, clinical_reviewer: reviewer });
                onCreated(res.link);
              } catch (err) {
                setError(err instanceof ClientError ? err.message : "We could not create the invitation.");
              } finally {
                setBusy(false);
              }
            }}
          >
            {busy && <Loader2 className="animate-spin" aria-hidden />} Create invitation
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
