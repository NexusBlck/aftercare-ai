"use client";

import { Loader2, ShieldCheck } from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useState, type ReactNode } from "react";
import { useSignOut } from "@/components/app/app-shell";
import { Button } from "@/components/ui/button";
import { usePlan } from "@/hooks/use-plan";
import { ClientError } from "@/lib/client/http";
import { LEGAL_VERSIONS } from "@/lib/legal";
import type { LegalStatus } from "@/schemas/legal";

/**
 * Blocks the app until the current versions of the terms, privacy policy and health-data consent
 * have been accepted. New account holders accept these at sign-up; this covers demo visitors,
 * accounts created before the documents existed, and future document updates.
 */
export function ConsentGate({ children }: { children: ReactNode }) {
  const { backend, status: planStatus } = usePlan();
  const signOut = useSignOut();
  const [status, setStatus] = useState<LegalStatus | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [agreed, setAgreed] = useState(false);
  const [saving, setSaving] = useState(false);

  const load = useCallback(() => {
    backend.legalStatus().then(
      (s) => {
        setStatus(s);
        setError(null);
      },
      (err: unknown) => setError(err instanceof ClientError ? err.message : "We could not load your agreements."),
    );
  }, [backend]);

  useEffect(() => {
    // Wait for the plan provider so an expired session redirects to sign-in first.
    if (planStatus !== "loading") load();
  }, [load, planStatus]);

  if (planStatus === "loading" || (!status && !error)) return <>{children}</>;
  if (status && status.needs.length === 0) return <>{children}</>;

  const needs = status?.needs ?? [];
  const updated = status ? status.accepted.length > 0 : false;

  const accept = async () => {
    setSaving(true);
    try {
      setStatus(await backend.acceptLegal(needs));
    } catch (err) {
      setError(err instanceof ClientError ? err.message : "We could not record your agreement. Please try again.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="flex min-h-dvh items-center justify-center bg-background px-4 py-10">
      <section role="dialog" aria-modal="true" aria-labelledby="consent-title" className="w-full max-w-lg rounded-2xl border bg-card p-6 shadow-sm sm:p-8">
        <span className="grid size-11 place-items-center rounded-xl bg-teal-soft text-teal">
          <ShieldCheck className="size-6" aria-hidden />
        </span>
        <h1 id="consent-title" className="mt-4 text-xl font-bold">
          {updated ? "We have updated our terms" : "Before you continue"}
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">
          {updated
            ? "Please review and accept the updated documents to keep using AFTERCARE AI."
            : "AFTERCARE AI handles health information, so we need your agreement first."}
        </p>
        {error ? (
          <div className="mt-5 rounded-lg bg-danger-soft p-3 text-sm text-danger" role="alert">
            {error}{" "}
            <button type="button" className="font-semibold underline" onClick={load}>
              Try again
            </button>
          </div>
        ) : (
          <label className="mt-5 flex cursor-pointer items-start gap-3 rounded-lg border p-3 text-sm has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-ring">
            <input
              type="checkbox"
              className="mt-0.5 size-4 shrink-0 accent-[var(--teal)]"
              checked={agreed}
              onChange={(e) => setAgreed(e.target.checked)}
              data-testid="consent-agree"
            />
            <span>
              I agree to the{" "}
              <Link href="/terms" target="_blank" className="font-semibold underline underline-offset-2">
                Terms of Service
              </Link>{" "}
              and{" "}
              <Link href="/privacy" target="_blank" className="font-semibold underline underline-offset-2">
                Privacy Policy
              </Link>
              , including processing of my health information
              <span aria-hidden className="ml-0.5 font-semibold text-danger">
                *
              </span>
              <span className="sr-only"> (required)</span>
              <span className="mt-1 block text-xs text-muted-foreground">Version {LEGAL_VERSIONS.terms}</span>
            </span>
          </label>
        )}
        <div className="mt-6 flex flex-col-reverse gap-2 sm:flex-row sm:justify-between">
          <Button variant="ghost" onClick={signOut}>
            No thanks, leave
          </Button>
          <Button onClick={accept} disabled={!agreed || saving || !!error || needs.length === 0}>
            {saving && <Loader2 className="animate-spin" aria-hidden />}
            Agree and continue
          </Button>
        </div>
      </section>
    </div>
  );
}
