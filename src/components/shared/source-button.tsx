"use client";

import { FileSearch, Quote } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { usePlan } from "@/hooks/use-plan";
import { DOCUMENT_TYPE_LABEL } from "@/lib/labels";
import { DocumentPreviewDialog } from "./document-preview";

/** Shows the verbatim excerpt an item was extracted from, and opens the original document. */
export function SourceButton({
  documentId,
  page,
  excerpt,
  label = "Source",
}: {
  documentId: string | null;
  page: number | null;
  excerpt: string | null;
  label?: string;
}) {
  const { bundle } = usePlan();
  const [open, setOpen] = useState(false);
  const [previewOpen, setPreviewOpen] = useState(false);
  const doc = bundle?.documents.find((d) => d.id === documentId) ?? null;

  return (
    <>
      <Button variant="ghost" size="sm" onClick={() => setOpen(true)} className="text-muted-foreground hover:text-foreground">
        <FileSearch aria-hidden />
        {label}
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="w-[calc(100vw-1.5rem)] sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Where this came from</DialogTitle>
            <DialogDescription>
              {doc
                ? `${doc.original_filename} · ${DOCUMENT_TYPE_LABEL[doc.document_type]}${page ? ` · page ${page}` : ""}`
                : documentId
                  ? "The source document has been deleted."
                  : "Entered by you."}
            </DialogDescription>
          </DialogHeader>
          {excerpt ? (
            <>
            <p className="text-xs text-muted-foreground">
              {doc?.processing_status === "sample"
                ? "Sample data: precomputed from a synthetic document, not a live AI result."
                : "This item was extracted automatically by AI. Check it against the exact text below and your original document."}
            </p>
            <figure className="rounded-lg border-l-4 border-teal bg-teal-soft/60 p-4">
              <Quote className="mb-1 size-4 text-teal" aria-hidden />
              <blockquote className="text-sm leading-relaxed text-foreground">{excerpt}</blockquote>
              <figcaption className="mt-2 text-xs text-muted-foreground">Exact text quoted from the document</figcaption>
            </figure>
            </>
          ) : (
            <p className="rounded-lg border border-amber/30 bg-amber-soft p-4 text-sm text-amber">
              No supporting text was returned for this item. Check it carefully against the original document.
            </p>
          )}
          <DialogFooter>
            {doc && (
              <Button
                variant="outline"
                onClick={() => {
                  setOpen(false);
                  setPreviewOpen(true);
                }}
              >
                Open original document
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <DocumentPreviewDialog documentId={documentId} open={previewOpen} onOpenChange={setPreviewOpen} highlight={excerpt} />
    </>
  );
}
