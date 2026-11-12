"use client";

import { useCallback, useEffect, useState } from "react";
import { apiFetch, ClientError } from "@/lib/client/http";

export interface ApiState<T> {
  data: T | null;
  error: ClientError | null;
  loading: boolean;
  reload: () => Promise<void>;
}

async function fetchJson<T>(url: string): Promise<{ data: T | null; error: ClientError | null }> {
  try {
    return { data: await apiFetch<T>(url), error: null };
  } catch (err) {
    return { data: null, error: err instanceof ClientError ? err : new ClientError("network", "We could not reach the server.") };
  }
}

/**
 * GET a JSON endpoint. Pass `null` to skip. State is keyed by URL, so data for a previous URL (another
 * patient, another page) is never shown while the new one loads.
 */
export function useApi<T>(url: string | null): ApiState<T> {
  const [state, setState] = useState<{ url: string | null; data: T | null; error: ClientError | null }>({ url: null, data: null, error: null });

  useEffect(() => {
    if (!url) return;
    let cancelled = false;
    void fetchJson<T>(url).then((result) => {
      if (!cancelled) setState({ url, ...result });
    });
    return () => {
      cancelled = true;
    };
  }, [url]);

  const reload = useCallback(async () => {
    if (!url) return;
    const result = await fetchJson<T>(url);
    // Keep showing the current data if a background refresh fails.
    setState((prev) => (result.error && prev.url === url && prev.data ? { ...prev, error: result.error } : { url, ...result }));
  }, [url]);

  const fresh = state.url === url;
  return { data: fresh ? state.data : null, error: fresh ? state.error : null, loading: url !== null && !fresh, reload };
}

/** POST/PATCH/DELETE helper returning the parsed body. */
export function send<T>(url: string, method: "POST" | "PATCH" | "DELETE", body?: unknown): Promise<T> {
  return apiFetch<T>(url, { method, body: body === undefined ? undefined : JSON.stringify(body) });
}
