"use client";

import { AlertCircle, CheckCircle2, Circle, Eye, FileImage, FileText, Loader2, Play, RotateCw, Trash2 } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";
import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { DocumentPreviewDialog } from "@/components/shared/document-preview";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { usePlan } from "@/hooks/use-plan";
import { STAGE_LABELS, type ProcessStage } from "@/lib/api/process-events";
import { formatTimestamp } from "@/lib/domain/dates";
import { DOCUMENT_TYPE_LABEL, PROCESSING_LABEL } from "@/lib/labels";
import { cn } from "@/lib/utils";
import type { DocumentRecord } from "@/schemas/domain";
import { DOCUMENT_TYPES, type DocumentType } from "@/schemas/extraction";

const STAGE_ORDER: ProcessStage[] = ["reading", "extracting", "validating", "explaining", "saving"];

function statusTone(status: DocumentRecord["processing_status"]) {
  switch (status) {
    case "ready_for_review":
      return "bg-teal-soft text-teal";
    case "failed":
    case "rejected":
      return "bg-danger-soft text-danger";
    case "processing":
    case "uploading":
      return "bg-secondary text-primary";
    case "sample":
      return "bg-amber-soft text-amber";
    default:
      return "bg-muted text-muted-foreground";
  }
}

export function DocumentList({ documents }: { documents: DocumentRecord[] }) {
  if (documents.length === 0) {
    return <p className="rounded-xl border border-dashed p-6 text-center text-sm text-muted-foreground">No documents yet.</p>;
  }
  return (
    <ul className="space-y-3">
      {documents.map((doc) => (
        <DocumentRow key={doc.id} doc={doc} />
      ))}
    </ul>
  );
}

function DocumentRow({ doc }: { doc: DocumentRecord }) {
  const router = useRouter();
  const { mutate, server, bundle } = usePlan();
  const [stages, setStages] = useState<ProcessStage[] | null>(null);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [confirmReprocess, setConfirmReprocess] = useState(false);
  const processing = stages !== null || doc.processing_status === "processing";
  const isSample = doc.processing_status === "sample";
  const aiAvailable = server ? server.ai !== "unconfigured" : true;
  const itemCount = bundle
    ? [bundle.medications, bundle.tasks, bundle.follow_ups, bundle.warning_signs].flat().filter((i) => i.document_id === doc.id).length
    : 0;

  const process = async () => {
    setStages([]);
    const result = await mutate((b, current) =>
      b.processDocument(current, doc.id, (stage) => setStages((s) => (s && !s.includes(stage) ? [...s, stage] : s))),
    );
    setStages(null);
    if (result) toast.success("Document processed. Review what was found before relying on it.", { action: { label: "Review", onClick: () => router.push("/review") } });
  };

  const Icon = doc.mime_type.startsWith("image/") ? FileImage : FileText;

  return (
    <li className="rounded-2xl border bg-card p-4 sm:p-5" data-testid="document-row">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start">
        <span className="grid size-11 shrink-0 place-items-center rounded-xl bg-secondary text-primary">
          <Icon className="size-5" aria-hidden />
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <p className="min-w-0 truncate font-semibold">{doc.original_filename}</p>
            <span className={cn("rounded-md px-2 py-0.5 text-xs font-semibold", statusTone(doc.processing_status))} data-testid="document-status">
              {processing ? "Processing" : PROCESSING_LABEL[doc.processing_status]}
            </span>
          </div>
          <p className="mt-0.5 text-xs text-muted-foreground">
            {(doc.file_size / 1024).toFixed(0)} KB · added {formatTimestamp(doc.created_at)}
            {itemCount > 0 && ` · ${itemCount} item${itemCount === 1 ? "" : "s"} extracted`}
          </p>

          <div className="mt-3 flex flex-wrap items-center gap-2">
            <label className="sr-only" htmlFor={`type-${doc.id}`}>
              Document type
            </label>
            <Select
              value={doc.document_type}
              disabled={isSample || processing}
              onValueChange={(value) =>
                mutate((b, current) => b.setDocumentType(current, doc.id, value as DocumentType), { success: "Document type updated" })
              }
            >
              <SelectTrigger id={`type-${doc.id}`} className="h-9 w-56" aria-label="Document type">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {DOCUMENT_TYPES.map((t) => (
                  <SelectItem key={t} value={t}>
                    {DOCUMENT_TYPE_LABEL[t]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <span className="text-xs text-muted-foreground">
              {doc.classification_source === "ai"
                ? "Classified by AI — change it if wrong"
                : doc.classification_source === "patient"
                  ? "Set by you"
                  : doc.classification_source === "sample"
                    ? "Sample"
                    : "Classified when processed"}
            </span>
          </div>

          {doc.processing_status === "failed" && !processing && doc.processing_error && (
            <p className="mt-3 flex items-start gap-2 rounded-lg bg-danger-soft px-3 py-2 text-sm text-danger" role="alert">
              <AlertCircle className="mt-0.5 size-4 shrink-0" aria-hidden />
              {doc.processing_error}
            </p>
          )}

          {stages !== null && (
            <ol className="mt-4 grid gap-1.5 rounded-xl bg-muted/50 p-3" aria-live="polite" aria-label="Processing progress">
              {STAGE_ORDER.filter((s) => s !== "explaining" || stages.includes("explaining")).map((stage) => {
                const reached = stages.includes(stage);
                const current = reached && stages[stages.length - 1] === stage;
                return (
                  <li key={stage} className={cn("flex items-center gap-2 text-sm", reached ? "text-foreground" : "text-muted-foreground")}>
                    {current ? (
                      <Loader2 className="size-4 animate-spin text-teal" aria-hidden />
                    ) : reached ? (
                      <CheckCircle2 className="size-4 text-teal" aria-hidden />
                    ) : (
                      <Circle className="size-4" aria-hidden />
                    )}
                    {STAGE_LABELS[stage]}
                  </li>
                );
              })}
            </ol>
          )}
        </div>

        <div className="flex flex-wrap gap-2 sm:flex-col sm:items-stretch">
          {!isSample && (doc.processing_status === "uploaded" || doc.processing_status === "failed") && (
            <Button size="sm" onClick={process} disabled={processing || !aiAvailable} title={!aiAvailable ? "AI processing is not configured" : undefined}>
              {processing ? <Loader2 className="animate-spin" aria-hidden /> : <Play aria-hidden />}
              {doc.processing_status === "failed" ? "Try again" : "Process"}
            </Button>
          )}
          {!isSample && doc.processing_status === "ready_for_review" && (
            <>
              <Button size="sm" asChild>
                <Link href="/review">Review results</Link>
              </Button>
              <Button size="sm" variant="outline" onClick={() => setConfirmReprocess(true)} disabled={processing || !aiAvailable}>
                <RotateCw aria-hidden /> Reprocess
              </Button>
            </>
          )}
          <Button size="sm" variant="outline" onClick={() => setPreviewOpen(true)} disabled={doc.processing_status === "uploading"}>
            <Eye aria-hidden /> Preview
          </Button>
          <Button size="sm" variant="ghost" className="text-danger hover:bg-danger-soft hover:text-danger" onClick={() => setConfirmDelete(true)} disabled={processing}>
            <Trash2 aria-hidden /> Delete
          </Button>
        </div>
      </div>

      <DocumentPreviewDialog documentId={doc.id} open={previewOpen} onOpenChange={setPreviewOpen} />
      <ConfirmDialog
        open={confirmDelete}
        onOpenChange={setConfirmDelete}
        title="Delete this document?"
        description={`This permanently deletes "${doc.original_filename}" and the ${itemCount} item(s) extracted from it, including your confirmations. Your correction history is kept. This cannot be undone.`}
        confirmLabel="Delete permanently"
        destructive
        onConfirm={() => void mutate((b, current) => b.deleteDocument(current, doc.id), { success: "Document deleted" })}
      />
      <ConfirmDialog
        open={confirmReprocess}
        onOpenChange={setConfirmReprocess}
        title="Process this document again?"
        description="The items extracted from this document will be replaced, including any confirmations or corrections you made to them. Your correction history is kept."
        confirmLabel="Reprocess"
        onConfirm={() => void process()}
      />
    </li>
  );
}
