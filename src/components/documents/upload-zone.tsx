"use client";

import { CloudUpload, Loader2, X } from "lucide-react";
import { useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { usePlan } from "@/hooks/use-plan";
import { ClientError } from "@/lib/client/http";
import { ACCEPT_ATTRIBUTE, checkFileClaims, maxUploadBytes } from "@/lib/security/file-validation";
import { cn } from "@/lib/utils";

interface QueueItem {
  key: string;
  name: string;
  progress: number;
  state: "queued" | "uploading" | "error";
  error?: string;
  controller: AbortController;
}

export function UploadZone() {
  const { mutate, server, mode } = usePlan();
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);
  const [queue, setQueue] = useState<QueueItem[]>([]);
  const maxMb = server?.maxUploadMb ?? 10;

  const update = (key: string, patch: Partial<QueueItem>) => setQueue((q) => q.map((i) => (i.key === key ? { ...i, ...patch } : i)));
  const remove = (key: string) => setQueue((q) => q.filter((i) => i.key !== key));

  const handleFiles = async (files: FileList | File[]) => {
    const list = Array.from(files);
    const items: Array<{ item: QueueItem; file: File }> = list.map((file) => {
      const check = checkFileClaims(file.name, file.size, maxUploadBytes(maxMb));
      return {
        file,
        item: {
          key: crypto.randomUUID(),
          name: file.name,
          progress: 0,
          state: check.ok ? "queued" : "error",
          error: check.ok ? undefined : check.message,
          controller: new AbortController(),
        },
      };
    });
    setQueue((q) => [...q, ...items.map((i) => i.item)]);

    for (const { item, file } of items) {
      if (item.state === "error" || item.controller.signal.aborted) continue;
      update(item.key, { state: "uploading" });
      let failure: string | null = null;
      const result = await mutate((b, bundle) =>
        b
          .uploadDocument(bundle, file, {
            signal: item.controller.signal,
            onProgress: (p) => update(item.key, { progress: Math.round(p * 100) }),
          })
          .catch((err: unknown) => {
            failure = err instanceof ClientError ? err.message : "Upload failed.";
            throw err;
          }),
      );
      if (result) remove(item.key);
      else if (item.controller.signal.aborted) remove(item.key);
      else update(item.key, { state: "error", error: failure ?? "Upload failed." });
    }
  };

  return (
    <div>
      <div
        onDragOver={(e) => {
          e.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragging(false);
          if (e.dataTransfer.files.length) void handleFiles(e.dataTransfer.files);
        }}
        className={cn(
          "flex flex-col items-center justify-center rounded-2xl border-2 border-dashed bg-card px-6 py-10 text-center transition-colors",
          dragging ? "border-teal bg-teal-soft/50" : "border-border",
        )}
      >
        <span className="grid size-14 place-items-center rounded-2xl bg-teal-soft text-teal">
          <CloudUpload className="size-7" aria-hidden />
        </span>
        <p className="mt-4 text-base font-semibold">Drag and drop your documents here</p>
        <p className="mt-1 text-sm text-muted-foreground">PDF, JPG or PNG · up to {maxMb} MB each · you can select several</p>
        <Button className="mt-5" onClick={() => inputRef.current?.click()}>
          Browse files
        </Button>
        <input
          ref={inputRef}
          type="file"
          multiple
          accept={ACCEPT_ATTRIBUTE}
          className="sr-only"
          data-testid="file-input"
          aria-label="Choose documents to upload"
          onChange={(e) => {
            if (e.target.files?.length) void handleFiles(e.target.files);
            e.target.value = "";
          }}
        />
        <p className="mt-4 max-w-md text-xs text-muted-foreground">
          {mode === "demo"
            ? "Demo mode: files are kept only in this browser. Use synthetic or sample documents only."
            : "Files are stored in private, encrypted storage that only your account can access."}
        </p>
      </div>

      {queue.length > 0 && (
        <ul className="mt-4 space-y-2" aria-live="polite">
          {queue.map((item) => (
            <li key={item.key} className={cn("rounded-xl border bg-card p-3", item.state === "error" && "border-danger/30 bg-danger-soft/40")}>
              <div className="flex items-center gap-3">
                {item.state === "uploading" && <Loader2 className="size-4 shrink-0 animate-spin text-teal" aria-hidden />}
                <p className="min-w-0 flex-1 truncate text-sm font-medium">{item.name}</p>
                {item.state === "uploading" && <span className="text-xs text-muted-foreground tabular-nums">{item.progress}%</span>}
                <Button
                  size="icon-sm"
                  variant="ghost"
                  aria-label={item.state === "error" ? `Dismiss ${item.name}` : `Cancel upload of ${item.name}`}
                  onClick={() => {
                    item.controller.abort();
                    remove(item.key);
                  }}
                >
                  <X aria-hidden />
                </Button>
              </div>
              {item.state === "uploading" && <Progress value={item.progress} className="mt-2 h-1.5" aria-label={`Upload progress for ${item.name}`} />}
              {item.state === "error" && <p className="mt-1 text-sm text-danger" role="alert">{item.error}</p>}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
