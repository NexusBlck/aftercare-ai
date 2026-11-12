"use client";

import type { ApiErrorCode } from "@/lib/api/errors";
import { isApiErrorBody } from "@/lib/api/errors";
import type { ProcessEvent } from "@/lib/api/process-events";

export class ClientError extends Error {
  constructor(
    public code: ApiErrorCode | "network" | "aborted",
    message: string,
    public retryable = false,
  ) {
    super(message);
  }
}

const OFFLINE_MESSAGE = "We could not reach AFTERCARE AI. Check your internet connection and try again.";

async function toClientError(response: Response): Promise<ClientError> {
  try {
    const body: unknown = await response.json();
    if (isApiErrorBody(body)) return new ClientError(body.error.code, body.error.message, body.error.retryable ?? false);
  } catch {
    // fall through
  }
  return new ClientError("internal_error", `The server returned an unexpected error (${response.status}).`, response.status >= 500);
}

export async function apiFetch<T>(url: string, init?: RequestInit): Promise<T> {
  let response: Response;
  try {
    response = await fetch(url, {
      ...init,
      headers: init?.body && !(init.body instanceof FormData) ? { "Content-Type": "application/json", ...init.headers } : init?.headers,
      credentials: "same-origin",
    });
  } catch (err) {
    if (err instanceof DOMException && err.name === "AbortError") throw new ClientError("aborted", "Cancelled.");
    throw new ClientError("network", OFFLINE_MESSAGE, true);
  }
  if (!response.ok) throw await toClientError(response);
  return (await response.json()) as T;
}

export async function apiBlob(url: string): Promise<Blob> {
  let response: Response;
  try {
    response = await fetch(url, { credentials: "same-origin" });
  } catch {
    throw new ClientError("network", OFFLINE_MESSAGE, true);
  }
  if (!response.ok) throw await toClientError(response);
  return response.blob();
}

/** Reads an NDJSON processing stream, calling onEvent for each event as it arrives. */
export async function readProcessStream(
  url: string,
  init: RequestInit,
  onEvent: (event: ProcessEvent) => void,
): Promise<void> {
  let response: Response;
  try {
    response = await fetch(url, { ...init, method: "POST", credentials: "same-origin" });
  } catch {
    throw new ClientError("network", OFFLINE_MESSAGE, true);
  }
  if (!response.ok) throw await toClientError(response);
  if (!response.body) throw new ClientError("internal_error", "The server response was empty.");

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let finished = false;
  try {
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      let newline = buffer.indexOf("\n");
      while (newline >= 0) {
        const line = buffer.slice(0, newline).trim();
        buffer = buffer.slice(newline + 1);
        if (line) {
          const event = JSON.parse(line) as ProcessEvent;
          if (event.type === "error") throw new ClientError(event.error.code, event.error.message, event.error.retryable ?? false);
          if (event.type === "done" || event.type === "extracted") finished = true;
          onEvent(event);
        }
        newline = buffer.indexOf("\n");
      }
    }
  } catch (err) {
    if (err instanceof ClientError) throw err;
    throw new ClientError("network", "The connection was interrupted while processing. Check the document status and try again.", true);
  }
  if (!finished) {
    throw new ClientError("network", "Processing ended before a result was received. Check the document status and try again.", true);
  }
}

/** PUT with real upload progress and cancellation (fetch cannot report upload progress). */
export function xhrUpload(
  url: string,
  file: File,
  contentType: string,
  opts: { onProgress?: (fraction: number) => void; signal?: AbortSignal; headers?: Record<string, string> },
): Promise<void> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("PUT", url);
    xhr.setRequestHeader("Content-Type", contentType);
    xhr.setRequestHeader("x-upsert", "false");
    for (const [k, v] of Object.entries(opts.headers ?? {})) xhr.setRequestHeader(k, v);
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable) opts.onProgress?.(e.loaded / e.total);
    };
    xhr.onload = () =>
      xhr.status >= 200 && xhr.status < 300
        ? resolve()
        : reject(new ClientError("storage_error", "The secure upload failed. Please try again.", true));
    xhr.onerror = () => reject(new ClientError("network", OFFLINE_MESSAGE, true));
    xhr.onabort = () => reject(new ClientError("aborted", "Upload cancelled."));
    opts.signal?.addEventListener("abort", () => xhr.abort(), { once: true });
    xhr.send(file);
  });
}
