"use client";

import { Check, CircleHelp, Pencil, RotateCcw } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { usePlan } from "@/hooks/use-plan";
import type { ItemKind } from "@/lib/domain/patch";
import { DATE_FIELDS, EDITABLE_FIELDS, type EditableKind, type VerificationStatus } from "@/schemas/domain";

const FIELD_LABEL: Record<string, string> = {
  name: "Medication name",
  brand_name: "Brand name",
  generic_name: "Generic name",
  strength: "Strength",
  dose: "Dose",
  route: "Route",
  frequency: "Frequency",
  timing: "Timing",
  duration: "Duration",
  special_instructions: "Special instructions",
  instruction: "Instruction",
  schedule_description: "Schedule / duration (as documented)",
  due_date: "Date (only if documented)",
  specialty: "Specialty / clinic",
  clinician: "Clinician",
  scheduled_date: "Appointment date",
  scheduled_time: "Appointment time",
  investigation: "Purpose or investigation",
  preparation_instructions: "Preparation",
  sign: "Warning sign",
  action: "What to do",
  diagnosis: "Diagnosis",
  procedure: "Procedure",
  admission_date: "Admission date",
  discharge_date: "Discharge date",
  facility: "Hospital / facility",
};

const LONG_FIELDS = new Set(["instruction", "special_instructions", "preparation_instructions", "sign", "action"]);

export function ReviewActions({
  kind,
  id,
  status,
  values,
  itemLabel,
  compact = false,
}: {
  kind: Exclude<ItemKind, "flag">;
  id: string;
  status: VerificationStatus;
  values: Record<string, string | null>;
  itemLabel: string;
  compact?: boolean;
}) {
  const { mutate } = usePlan();
  const [busy, setBusy] = useState(false);
  const [editing, setEditing] = useState(false);

  const setStatus = async (next: VerificationStatus, success: string) => {
    setBusy(true);
    await mutate((b, bundle) => b.patchItem(bundle, kind, id, { action: "set_status", status: next }), { success });
    setBusy(false);
  };

  return (
    <div className="flex flex-wrap items-center gap-2">
      {status !== "confirmed_by_patient" && (
        <Button
          size="sm"
          onClick={() => setStatus("confirmed_by_patient", "Marked as confirmed by you")}
          disabled={busy || status === "conflicting"}
          title={status === "conflicting" ? "Resolve the conflict with your care team first" : undefined}
          aria-label={`Confirm ${itemLabel} matches my document`}
          className="bg-teal text-white hover:bg-teal/90"
        >
          <Check aria-hidden />
          {compact ? "Confirm" : "Matches my document"}
        </Button>
      )}
      {status === "confirmed_by_patient" && (
        <Button size="sm" variant="outline" onClick={() => setStatus("needs_review", "Moved back to review")} disabled={busy}>
          <RotateCcw aria-hidden />
          Undo confirmation
        </Button>
      )}
      {status !== "needs_clinician_clarification" && (
        <Button
          size="sm"
          variant="outline"
          onClick={() => setStatus("needs_clinician_clarification", "Added to your questions for the care team")}
          disabled={busy}
          aria-label={`Ask clinician about ${itemLabel}`}
        >
          <CircleHelp aria-hidden />
          Ask clinician
        </Button>
      )}
      {kind in EDITABLE_FIELDS && (
        <Button size="sm" variant="ghost" onClick={() => setEditing(true)} disabled={busy} aria-label={`Correct ${itemLabel}`}>
          <Pencil aria-hidden />
          Correct
        </Button>
      )}
      {editing && (
        <EditDialog kind={kind as EditableKind} id={id} values={values} itemLabel={itemLabel} onClose={() => setEditing(false)} />
      )}
    </div>
  );
}

function EditDialog({
  kind,
  id,
  values,
  itemLabel,
  onClose,
}: {
  kind: EditableKind;
  id: string;
  values: Record<string, string | null>;
  itemLabel: string;
  onClose: () => void;
}) {
  const { mutate } = usePlan();
  const fields = (kind === "encounter" ? [id] : EDITABLE_FIELDS[kind]) as readonly string[];
  const [draft, setDraft] = useState<Record<string, string>>(() =>
    Object.fromEntries(fields.map((f) => [f, values[f] ?? ""])),
  );
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);

  const save = async () => {
    const changed = fields.filter((f) => (draft[f].trim() || null) !== (values[f] ?? null));
    if (changed.length === 0) return onClose();
    setSaving(true);
    const result = await mutate(async (b, bundle) => {
      let next = bundle;
      for (const field of changed) {
        next = await b.patchItem(next, kind, id, { action: "correct", field, value: draft[field].trim() || null, note: note.trim() || null });
      }
      return next;
    }, { success: "Correction saved. Review it once more, then confirm." });
    setSaving(false);
    if (result) onClose();
  };

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[92dvh] w-[calc(100vw-1.5rem)] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Correct {itemLabel}</DialogTitle>
          <DialogDescription>
            Change only what differs from your original document. Your correction is recorded with the original value kept for reference. Leave a field empty if the document does not state it.
          </DialogDescription>
        </DialogHeader>
        <form
          className="grid gap-4"
          onSubmit={(e) => {
            e.preventDefault();
            void save();
          }}
        >
          {fields.map((field) => {
            const inputId = `edit-${id}-${field}`;
            const type = DATE_FIELDS.has(field) ? "date" : field === "scheduled_time" ? "time" : "text";
            return (
              <div key={field} className="grid gap-1.5">
                <Label htmlFor={inputId}>{FIELD_LABEL[field] ?? field}</Label>
                {LONG_FIELDS.has(field) ? (
                  <Textarea id={inputId} value={draft[field]} onChange={(e) => setDraft({ ...draft, [field]: e.target.value })} rows={3} />
                ) : (
                  <Input id={inputId} type={type} value={draft[field]} onChange={(e) => setDraft({ ...draft, [field]: e.target.value })} />
                )}
              </div>
            );
          })}
          <div className="grid gap-1.5">
            <Label htmlFor={`edit-${id}-note`}>Why are you correcting this? (optional)</Label>
            <Input id={`edit-${id}-note`} value={note} onChange={(e) => setNote(e.target.value)} placeholder="e.g. The scan misread the dose" />
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" disabled={saving}>
              {saving ? "Saving…" : "Save correction"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
