"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { toast } from "sonner";
import { ApiBackend, LocalBackend, type Mode, type PlanBackend } from "@/lib/client/backends";
import { ClientError } from "@/lib/client/http";
import type { LocalProfile } from "@/lib/client/local-store";
import { DEMO_COOKIE } from "@/lib/mode";
import { navigateFresh } from "@/lib/client/navigation";
import type { Language, PlanBundle } from "@/schemas/domain";

export interface ServerStatus {
  accounts: boolean;
  ai: "gemini" | "mock" | "freellmapi" | "free" | "unconfigured";
  model: string | null;
  maxUploadMb: number;
}

interface PlanContextValue {
  mode: Mode;
  backend: PlanBackend;
  status: "loading" | "ready" | "error";
  loadError: string | null;
  bundle: PlanBundle | null;
  profile: LocalProfile;
  email: string | null;
  server: ServerStatus | null;
  language: Language;
  reload: () => Promise<void>;
  /** Runs a backend mutation, updates state, and shows a toast on failure. Returns null on failure. */
  mutate: (fn: (backend: PlanBackend, bundle: PlanBundle) => Promise<PlanBundle>, opts?: { success?: string }) => Promise<PlanBundle | null>;
  setBundle: (bundle: PlanBundle | null) => void;
  setProfile: (profile: LocalProfile) => void;
}

const PlanContext = createContext<PlanContextValue | null>(null);

export function readModeFromCookie(): Mode {
  if (typeof document === "undefined") return "account";
  return document.cookie.split("; ").some((c) => c === `${DEMO_COOKIE}=1`) ? "demo" : "account";
}

export function PlanProvider({ children }: { children: ReactNode }) {
  const [mode] = useState<Mode>(() => readModeFromCookie());
  const backend = useMemo<PlanBackend>(() => (mode === "demo" ? new LocalBackend() : new ApiBackend()), [mode]);
  const [status, setStatus] = useState<PlanContextValue["status"]>("loading");
  const [loadError, setLoadError] = useState<string | null>(null);
  const [bundle, setBundleState] = useState<PlanBundle | null>(null);
  // Mutations always start from the latest plan, even when several run back-to-back.
  const bundleRef = useRef<PlanBundle | null>(null);
  const setBundle = useCallback((next: PlanBundle | null) => {
    bundleRef.current = next;
    setBundleState(next);
  }, []);
  const [profile, setProfile] = useState<LocalProfile>({ display_name: null, preferred_language: "en", onboarded: false });
  const [email, setEmail] = useState<string | null>(null);
  const [server, setServer] = useState<ServerStatus | null>(null);

  const handleAuthError = useCallback(
    (err: unknown) => {
      if (err instanceof ClientError && (err.code === "unauthorized" || err.code === "accounts_unconfigured")) {
        navigateFresh(`/login?reason=${err.code === "unauthorized" ? "expired" : "unconfigured"}`);
        return true;
      }
      return false;
    },
    [],
  );

  const load = useCallback(
    () =>
      Promise.all([backend.loadProfile(), backend.loadCurrent()]).then(
        ([p, b]) => {
          setProfile(p.profile);
          setEmail(p.email);
          setBundle(b);
          setLoadError(null);
          setStatus("ready");
        },
        (err: unknown) => {
          if (handleAuthError(err)) return;
          setLoadError(err instanceof ClientError ? err.message : "We could not load your recovery plan.");
          setStatus("error");
        },
      ),
    [backend, handleAuthError, setBundle],
  );
  const reload = useCallback(async () => {
    setStatus("loading");
    await load();
  }, [load]);

  useEffect(() => {
    let cancelled = false;
    void load();
    fetch("/api/health")
      .then((r) => (r.ok ? (r.json() as Promise<ServerStatus>) : null))
      .then((s) => {
        if (!cancelled && s) setServer(s);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [load]);

  const mutate = useCallback<PlanContextValue["mutate"]>(
    async (fn, opts) => {
      const current = bundleRef.current;
      if (!current) return null;
      try {
        const next = await fn(backend, current);
        setBundle(next);
        if (opts?.success) toast.success(opts.success);
        return next;
      } catch (err) {
        if (handleAuthError(err)) return null;
        if (err instanceof ClientError && err.code === "aborted") return null;
        toast.error(err instanceof ClientError ? err.message : "Something went wrong. Please try again.");
        // Re-sync after a failure so the UI reflects what was actually saved.
        void reload();
        return null;
      }
    },
    [backend, handleAuthError, reload, setBundle],
  );

  const value: PlanContextValue = {
    mode,
    backend,
    status,
    loadError,
    bundle,
    profile,
    email,
    server,
    language: profile.preferred_language,
    reload,
    mutate,
    setBundle,
    setProfile,
  };

  return <PlanContext value={value}>{children}</PlanContext>;
}

export function usePlan(): PlanContextValue {
  const ctx = useContext(PlanContext);
  if (!ctx) throw new Error("usePlan must be used inside PlanProvider");
  return ctx;
}
