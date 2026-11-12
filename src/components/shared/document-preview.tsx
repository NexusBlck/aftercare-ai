"use client";

import { FileText, Loader2 } from "lucide-react";
import { useEffect, useState } from "react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { usePlan } from "@/hooks/use-plan";
import type { DocumentPreview } from "@/lib/client/backends";
import { ClientError } from "@/lib/client/http";
import { DOCUMENT_TYPE_LABEL } from "@/lib/labels";

export function DocumentPreviewDialog({
  documentId,
  open,
  onOpenChange,
  highlight,
}: {
  documentId: string | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  highlight?: string | null;
}) {
  const { bundle, backend } = usePlan();
  const [preview, setPreview] = useState<DocumentPreview | null>(null);
  const [error, setError] = useState<string | null>(null);
  const doc = bundle?.documents.find((d) => d.id === documentId) ?? null;

  useEffect(() => {
    if (!open || !doc || !bundle) return;
    let revoke: (() => void) | undefined;
    let cancelled = false;
    backend
      .previewDocument(bundle, doc.id)
      .then((p) => {
        if (cancelled) return p.kind === "url" ? p.revoke?.() : undefined;
        revoke = p.kind === "url" ? p.revoke : undefined;
        setPreview(p);
        setError(null);
      })
      .catch((err) => {
        if (!cancelled) setError(err instanceof ClientError ? err.message : "This document could not be opened.");
      });
    return () => {
      cancelled = true;
      revoke?.();
      setPreview(null);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- reload only when the dialog opens or the document changes
  }, [open, doc?.id]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[92dvh] w-[calc(100vw-1.5rem)] max-w-4xl flex-col gap-3 sm:max-w-4xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 pr-6 text-base">
            <FileText className="size-4 shrink-0 text-muted-foreground" aria-hidden />
            <span className="truncate">{doc?.original_filename ?? "Document"}</span>
          </DialogTitle>
          <DialogDescription>
            {doc ? DOCUMENT_TYPE_LABEL[doc.document_type] : ""}
            {doc?.processing_status === "sample" ? " · Synthetic sample document (fictional patient)" : ""}
          </DialogDescription>
        </DialogHeader>
        <div className="min-h-0 flex-1 overflow-auto rounded-lg border bg-muted/40">
          {error ? (
            <Alert variant="destructive" className="m-4 w-auto">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          ) : !preview ? (
            <div className="flex h-64 items-center justify-center text-muted-foreground">
              <Loader2 className="mr-2 size-4 animate-spin" aria-hidden /> Opening document…
            </div>
          ) : preview.kind === "text" ? (
            <pre className="p-4 font-mono text-[0.8rem] leading-relaxed whitespace-pre-wrap text-foreground sm:p-6">
              {highlight ? <Highlighted text={preview.text} term={highlight} /> : preview.text}
            </pre>
          ) : preview.mimeType === "application/pdf" ? (
            <iframe src={preview.url} title={`Preview of ${doc?.original_filename ?? "document"}`} className="h-[70dvh] w-full bg-white" />
          ) : (
            // eslint-disable-next-line @next/next/no-img-element -- private signed/blob URL, not optimizable
            <img src={preview.url} alt={`Uploaded document ${doc?.original_filename ?? ""}`} className="mx-auto max-h-[70dvh] w-auto" />
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

function Highlighted({ text, term }: { text: string; term: string }) {
  const index = text.indexOf(term);
  if (index < 0) return <>{text}</>;
  return (
    <>
      {text.slice(0, index)}
      <mark className="rounded bg-amber-soft px-0.5 text-foreground ring-1 ring-amber/40">{term}</mark>
      {text.slice(index + term.length)}
    </>
  );
}
