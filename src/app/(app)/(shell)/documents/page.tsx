"use client";

import { FlaskConical, ShieldCheck } from "lucide-react";
import { PageHeader, PlanGate } from "@/components/app/plan-gate";
import { DocumentList } from "@/components/documents/document-list";
import { UploadZone } from "@/components/documents/upload-zone";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { usePlan } from "@/hooks/use-plan";

export default function DocumentsPage() {
  const { server } = usePlan();
  return (
    <PlanGate>
      {(bundle) => (
        <>
          <PageHeader
            title="Documents"
            description="Upload the documents you received at discharge. AFTERCARE AI reads them, and you check every result before it becomes part of your plan."
          />

          {server?.ai === "unconfigured" && (
            <Alert className="mb-6 border-amber/30 bg-amber-soft">
              <AlertTitle>AI processing is not configured on this server</AlertTitle>
              <AlertDescription>
                Uploads work, but documents cannot be processed until an administrator adds a Gemini API key on the server. You can still explore the labelled sample plan in demo mode.
              </AlertDescription>
            </Alert>
          )}
          {server?.ai === "mock" && (
            <Alert className="mb-6 border-amber/30 bg-amber-soft">
              <FlaskConical className="size-4" aria-hidden />
              <AlertTitle>Test extractor active — not AI output</AlertTitle>
              <AlertDescription>
                This server uses a deterministic test extractor for automated testing. It only recognises the synthetic test documents.
              </AlertDescription>
            </Alert>
          )}

          <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)]">
            <section aria-labelledby="upload-title">
              <h2 id="upload-title" className="mb-3 text-lg font-bold">
                Add documents
              </h2>
              <UploadZone />
              <div className="mt-4 flex gap-3 rounded-xl bg-muted/60 p-4 text-sm text-muted-foreground">
                <ShieldCheck className="mt-0.5 size-5 shrink-0 text-teal" aria-hidden />
                <p>
                  Files are checked by their actual contents, not just their name. Text inside documents is treated as information only — instructions hidden in a document cannot change how AFTERCARE AI behaves.{" "}
                  <a href="/samples/synthetic-discharge-summary.pdf" className="font-medium text-foreground underline underline-offset-2" download>
                    Download a synthetic sample document
                  </a>{" "}
                  to try it.
                </p>
              </div>
            </section>
            <section aria-labelledby="library-title">
              <h2 id="library-title" className="mb-3 text-lg font-bold">
                Your document library <span className="font-normal text-muted-foreground">({bundle.documents.length})</span>
              </h2>
              <DocumentList documents={bundle.documents} />
            </section>
          </div>
        </>
      )}
    </PlanGate>
  );
}
