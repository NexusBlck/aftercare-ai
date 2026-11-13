"use client";

import { FileUp, Loader2 } from "lucide-react";
import { useRef, useState } from "react";
import { toast } from "sonner";
import { Progress } from "@/components/ui/progress";
import { DOCUMENT_TYPE_LABELS } from "@/lib/clinic/labels";
import { apiFetch, ClientError, xhrUpload } from "@/lib/client/http";
import { NativeSelect } from "./ui";

const ACCEPT = ".pdf,.jpg,.jpeg,.png,application/pdf,image/jpeg,image/png";

/** Uploads to a signed URL in the clinic's private folder with real progress, then asks the server to verify the bytes. */
export function DocumentUploader({ episodeId, onUploaded, disabled }: { episodeId: string; onUploaded: () => void; disabled?: boolean }) {
  const input = useRef<HTMLInputElement>(null);
  const [type, setType] = useState("discharge_summary");
  const [progress, setProgress] = useState<number | null>(null);
  const [name, setName] = useState<string | null>(null);

  const upload = async (file: File) => {
    setName(file.name);
    setProgress(0);
    try {
      const created = await apiFetch<{ document: { id: string }; uploadUrl: string; contentType: string }>("/api/clinic/documents/upload", {
        method: "POST",
        body: JSON.stringify({ episode_id: episodeId, filename: file.name, size: file.size, document_type: type }),
      });
      await xhrUpload(created.uploadUrl, file, created.contentType, { onProgress: (p: number) => setProgress(Math.round(p * 100)) });
      await apiFetch(`/api/clinic/documents/${created.document.id}/finalize`, { method: "POST" });
      toast.success("Document uploaded securely.");
      onUploaded();
    } catch (err) {
      toast.error(err instanceof ClientError ? err.message : "The upload failed. Please try again.");
    } finally {
      setProgress(null);
      setName(null);
      if (input.current) input.current.value = "";
    }
  };

  return (
    <div className="rounded-xl border border-dashed bg-secondary/30 p-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
        <label className="grid flex-1 gap-1.5 text-sm font-semibold">
          Document type
          <NativeSelect value={type} onChange={(e) => setType(e.target.value)} disabled={disabled || progress !== null}>
            {Object.entries(DOCUMENT_TYPE_LABELS)
              .filter(([k]) => k !== "unknown")
              .map(([k, v]) => (
                <option key={k} value={k}>
                  {v}
                </option>
              ))}
          </NativeSelect>
        </label>
        <input
          ref={input}
          type="file"
          accept={ACCEPT}
          className="sr-only"
          id={`upload-${episodeId}`}
          disabled={disabled || progress !== null}
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) void upload(file);
          }}
        />
        <label
          htmlFor={`upload-${episodeId}`}
          className="inline-flex h-10 cursor-pointer items-center justify-center gap-2 rounded-lg bg-primary px-4 text-sm font-semibold text-primary-foreground hover:bg-primary/90 focus-within:outline-2 has-[:disabled]:pointer-events-none has-[:disabled]:opacity-50"
        >
          {progress !== null ? <Loader2 className="size-4 animate-spin" aria-hidden /> : <FileUp className="size-4" aria-hidden />}
          Upload PDF, JPG or PNG
        </label>
      </div>
      {progress !== null && (
        <div className="mt-3" aria-live="polite">
          <p className="mb-1 truncate text-xs text-muted-foreground">
            Uploading {name}… {progress}%
          </p>
          <Progress value={progress} aria-label="Upload progress" />
        </div>
      )}
    </div>
  );
}
