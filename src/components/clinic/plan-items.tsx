"use client";

import { AlertTriangle, FileText, Flag, Pencil, Plus, Trash2 } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { EDITABLE_FIELDS, type PlanBundle } from "@/schemas/domain";
import { Field, formatDate, NativeSelect, Pill } from "./ui";

export type ItemKind = "medication" | "task" | "follow_up" | "warning_sign";

export const FIELD_LABELS: Record<string, string> = {
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
  schedule_description: "Schedule / duration",
  due_date: "Due date",
  specialty: "Clinic / specialty",
  clinician: "Clinician",
  scheduled_date: "Date",
  scheduled_time: "Time",
  investigation: "Investigation",
  preparation_instructions: "Preparation",
  sign: "Warning sign",
  action: "What to do",
  diagnosis: "Diagnosis",
  procedure: "Procedure",
  admission_date: "Admission date",
  discharge_date: "Discharge date",
  facility: "Facility",
};

const DATE_FIELDS = new Set(["due_date", "scheduled_date", "admission_date", "discharge_date"]);
const LONG_FIELDS = new Set(["special_instructions", "instruction", "preparation_instructions", "sign", "action"]);
const REQUIRED: Record<ItemKind, string> = { medication: "name", task: "instruction", follow_up: "", warning_sign: "sign" };

type AnyItem = Record<string, unknown> & {
  id: string;
  document_id: string | null;
  source_page: number | null;
  source_excerpt: string | null;
  uncertain: boolean;
  uncertainty_note: string | null;
  verification_status: string;
};

export function ProvenanceNote({ item, bundle }: { item: AnyItem; bundle: PlanBundle }) {
  const doc = item.document_id ? bundle.documents.find((d) => d.id === item.document_id) : null;
  if (!item.document_id) return <p className="mt-2 text-xs text-muted-foreground">Entered by a clinician — no source document.</p>;
  return (
    <div className="mt-2 rounded-lg bg-secondary/60 px-3 py-2 text-xs">
      <p className="flex items-center gap-1 font-semibold text-muted-foreground">
        <FileText className="size-3.5" aria-hidden />
        Source: {doc?.original_filename ?? "document"}
        {item.source_page ? `, page ${item.source_page}` : ""}
        {item.document_id && (
          <a href={`/api/clinic/documents/${item.document_id}/file`} target="_blank" rel="noopener noreferrer" className="ml-1 text-teal underline">
            open
          </a>
        )}
      </p>
      {item.source_excerpt ? <blockquote className="mt-1 border-l-2 border-primary/30 pl-2 text-foreground/90 italic">“{item.source_excerpt}”</blockquote> : <p className="mt-1 text-amber">No supporting excerpt.</p>}
    </div>
  );
}

function itemTitle(kind: ItemKind, item: AnyItem): string {
  if (kind === "medication") return [item.name, item.strength].filter(Boolean).join(" ") as string;
  if (kind === "task") return item.instruction as string;
  if (kind === "follow_up") return ([item.specialty, item.clinician].filter(Boolean).join(" · ") as string) || (item.investigation as string) || "Follow-up";
  return item.sign as string;
}

function itemDetails(kind: ItemKind, item: AnyItem): Array<[string, string]> {
  const fields = (EDITABLE_FIELDS[kind] as readonly string[]).filter((f) => !["name", "strength", "instruction", "sign", "specialty", "clinician"].includes(f));
  return fields.map((f) => [FIELD_LABELS[f] ?? f, item[f] == null ? "" : DATE_FIELDS.has(f) ? formatDate(item[f] as string) : String(item[f])]);
}

export function ItemList({
  kind,
  title,
  items,
  bundle,
  editable,
  onEdit,
  onAdd,
  onRemove,
  onFlag,
  emptyText,
}: {
  kind: ItemKind;
  title: string;
  items: AnyItem[];
  bundle: PlanBundle;
  editable: boolean;
  onEdit: (item: AnyItem) => void;
  onAdd: () => void;
  onRemove: (item: AnyItem) => void;
  onFlag: (item: AnyItem) => void;
  emptyText: string;
}) {
  return (
    <section className="rounded-2xl border bg-card" aria-label={title}>
      <div className="flex items-center justify-between gap-3 border-b px-5 py-3.5">
        <h3 className="font-bold">
          {title} <span className="ml-1 text-sm font-medium text-muted-foreground">({items.length})</span>
        </h3>
        {editable && (
          <Button size="sm" variant="outline" onClick={onAdd}>
            <Plus aria-hidden /> Add
          </Button>
        )}
      </div>
      {items.length === 0 ? (
        <p className="px-5 py-4 text-sm text-muted-foreground">{emptyText}</p>
      ) : (
        <ul className="divide-y">
          {items.map((item) => {
            const details = itemDetails(kind, item);
            return (
              <li key={item.id} className="px-5 py-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <p className="font-semibold">{itemTitle(kind, item)}</p>
                    <dl className="mt-1 grid grid-cols-[auto_1fr] gap-x-3 gap-y-0.5 text-sm">
                      {details.map(([label, value]) => (
                        <div key={label} className="contents">
                          <dt className="text-muted-foreground">{label}</dt>
                          <dd className={value ? "" : "text-amber"}>{value || "Not documented"}</dd>
                        </div>
                      ))}
                    </dl>
                    <div className="mt-2 flex flex-wrap gap-1.5">
                      {item.verification_status === "conflicting" && <Pill tone="danger">Conflicts with another document</Pill>}
                      {item.uncertain && (
                        <Pill tone="amber">
                          <AlertTriangle className="size-3" aria-hidden /> {item.uncertainty_note ?? "Uncertain"}
                        </Pill>
                      )}
                    </div>
                    <ProvenanceNote item={item} bundle={bundle} />
                  </div>
                  {editable && (
                    <div className="flex shrink-0 gap-1">
                      <Button size="icon" variant="ghost" aria-label="Correct this item" onClick={() => onEdit(item)}>
                        <Pencil aria-hidden />
                      </Button>
                      <Button size="icon" variant="ghost" aria-label="Flag for clarification" onClick={() => onFlag(item)}>
                        <Flag aria-hidden />
                      </Button>
                      <Button size="icon" variant="ghost" aria-label="Remove this item" onClick={() => onRemove(item)}>
                        <Trash2 aria-hidden />
                      </Button>
                    </div>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}

/** Edit or add an item. Only documented values belong here; empty means "not documented". */
export function ItemDialog({
  kind,
  item,
  onClose,
  onSave,
}: {
  kind: ItemKind | "encounter";
  item: Record<string, unknown> | null;
  onClose: () => void;
  onSave: (values: Record<string, string | null>, note: string | null) => Promise<void>;
}) {
  const fields = EDITABLE_FIELDS[kind] as readonly string[];
  const [values, setValues] = useState<Record<string, string>>(() => Object.fromEntries(fields.map((f) => [f, (item?.[f] as string | null) ?? ""])));
  const [category, setCategory] = useState("wound_care");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const isNew = !item;
  const required = kind === "encounter" ? "" : REQUIRED[kind];

  const save = async () => {
    setBusy(true);
    setError(null);
    try {
      const out: Record<string, string | null> = {};
      for (const f of fields) {
        const v = values[f].trim() === "" ? null : values[f].trim();
        if (isNew ? v !== null : v !== ((item?.[f] as string | null) ?? null)) out[f] = v;
      }
      if (isNew && kind === "task") out.category = category;
      await onSave(out, note.trim() || null);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "We could not save the change.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[90dvh] w-[calc(100vw-1.5rem)] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{isNew ? "Add item" : "Correct item"}</DialogTitle>
          <DialogDescription>Enter values exactly as documented. Leave a field empty when the document does not state it — never estimate a dose, frequency, duration or date.</DialogDescription>
        </DialogHeader>
        <div className="grid gap-3">
          {isNew && kind === "task" && (
            <Field label="Category" htmlFor="item-category">
              <NativeSelect id="item-category" value={category} onChange={(e) => setCategory(e.target.value)}>
                <option value="wound_care">Wound care</option>
                <option value="activity">Activity</option>
                <option value="diet">Diet</option>
                <option value="other">Other</option>
              </NativeSelect>
            </Field>
          )}
          {fields.map((f) => (
            <Field key={f} label={FIELD_LABELS[f] ?? f} htmlFor={`item-${f}`} required={f === required}>
              {LONG_FIELDS.has(f) ? (
                <Textarea id={`item-${f}`} value={values[f]} onChange={(e) => setValues({ ...values, [f]: e.target.value })} maxLength={2000} rows={2} />
              ) : (
                <Input
                  id={`item-${f}`}
                  type={DATE_FIELDS.has(f) ? "date" : f === "scheduled_time" ? "time" : "text"}
                  value={values[f]}
                  onChange={(e) => setValues({ ...values, [f]: e.target.value })}
                  maxLength={300}
                />
              )}
            </Field>
          ))}
          {!isNew && (
            <Field label="Reason for the correction" htmlFor="item-note" hint="Recorded in the version history, e.g. “matches page 2 of the discharge summary”.">
              <Input id="item-note" value={note} onChange={(e) => setNote(e.target.value)} maxLength={500} />
            </Field>
          )}
          {error && <p role="alert" className="text-sm text-danger">{error}</p>}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={save} disabled={busy}>
            {isNew ? "Add" : "Save correction"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
