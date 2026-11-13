"use client";

import { Loader2, ShieldCheck, ShieldOff } from "lucide-react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useApi } from "@/components/clinic/use-api";
import { apiFetch, ClientError } from "@/lib/client/http";
import { navigateFresh } from "@/lib/client/navigation";
import { safeNext } from "@/lib/security/redirect";

function CodeInput({ value, onChange, id = "mfa-code" }: { value: string; onChange: (v: string) => void; id?: string }) {
  return (
    <div className="grid gap-1.5">
      <Label htmlFor={id}>6-digit code</Label>
      <Input
        id={id}
        inputMode="numeric"
        autoComplete="one-time-code"
        pattern="\d{6}"
        maxLength={6}
        value={value}
        onChange={(e) => onChange(e.target.value.replace(/\D/g, "").slice(0, 6))}
        className="h-11 text-lg tracking-[0.3em]"
        autoFocus
      />
    </div>
  );
}

const errorText = (err: unknown, fallback: string) => (err instanceof ClientError ? err.message : fallback);

/** Second sign-in step: the code from the authenticator app. */
export function MfaVerifyForm() {
  const next = useSearchParams().get("next");
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (code.length !== 6) return setError("Enter the 6-digit code from your authenticator app.");
    setBusy(true);
    setError(null);
    try {
      await apiFetch("/api/auth/mfa/verify", { method: "POST", body: JSON.stringify({ code }) });
      navigateFresh(safeNext(next, window.location.origin));
    } catch (err) {
      if (err instanceof ClientError && err.code === "unauthorized") return navigateFresh("/login?reason=expired");
      setError(errorText(err, "We could not check the code. Please try again."));
      setCode("");
      setBusy(false);
    }
  };

  return (
    <div className="w-full max-w-md">
      <h1 className="text-2xl font-extrabold sm:text-3xl">Two-factor authentication</h1>
      <p className="mt-2 text-muted-foreground">Open your authenticator app and enter the current code for AFTERCARE AI.</p>
      <form onSubmit={submit} className="mt-6 grid gap-4">
        <CodeInput value={code} onChange={setCode} />
        {error && (
          <p className="rounded-lg bg-danger-soft px-3 py-2 text-sm text-danger" role="alert">
            {error}
          </p>
        )}
        <Button type="submit" size="lg" disabled={busy}>
          {busy && <Loader2 className="animate-spin" aria-hidden />}
          Continue
        </Button>
      </form>
      <p className="mt-6 text-sm text-muted-foreground">
        Lost access to your authenticator app? Ask your clinic administrator or contact support to reset it.{" "}
        <button
          type="button"
          className="font-semibold text-foreground underline underline-offset-2"
          onClick={async () => {
            await fetch("/api/auth/logout", { method: "POST", credentials: "same-origin" }).catch(() => undefined);
            navigateFresh("/login?reason=signed-out");
          }}
        >
          Sign out
        </button>
      </p>
    </div>
  );
}

interface MfaStatus {
  enabled: boolean;
  verified_this_session: boolean;
  factors: Array<{ id: string; name: string; created_at: string }>;
  required_by: string[];
}

/** Account security: set up or turn off an authenticator app. */
export function SecuritySettings() {
  const next = useSearchParams().get("next");
  const { data, error, loading, reload } = useApi<MfaStatus>("/api/auth/mfa");
  const [setup, setSetup] = useState<{ factor_id: string; qr_code: string; secret: string } | null>(null);
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  useEffect(() => {
    if (error?.code === "unauthorized") navigateFresh("/login?next=/security");
    if (error?.code === "mfa_required") navigateFresh("/security/verify?next=/security");
  }, [error?.code]);

  const start = async () => {
    setBusy(true);
    setFormError(null);
    try {
      setSetup(await apiFetch("/api/auth/mfa", { method: "POST" }));
      setCode("");
    } catch (err) {
      if (err instanceof ClientError && err.code === "mfa_required") return navigateFresh("/security/verify?next=/security");
      setFormError(errorText(err, "We could not start set-up."));
    } finally {
      setBusy(false);
    }
  };

  const confirm = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!setup) return;
    if (code.length !== 6) return setFormError("Enter the 6-digit code shown in your authenticator app.");
    setBusy(true);
    setFormError(null);
    try {
      await apiFetch("/api/auth/mfa/verify", { method: "POST", body: JSON.stringify({ code, factor_id: setup.factor_id }) });
      toast.success("Two-factor authentication is on.");
      // The session was upgraded by the verification; reload so every page sees it.
      navigateFresh(next ? safeNext(next, window.location.origin) : "/security");
    } catch (err) {
      setFormError(errorText(err, "We could not check the code."));
      setCode("");
      setBusy(false);
    }
  };

  const remove = async (factorId: string) => {
    setBusy(true);
    setFormError(null);
    try {
      await apiFetch("/api/auth/mfa", { method: "DELETE", body: JSON.stringify({ factor_id: factorId }) });
      toast.success("Two-factor authentication is off.");
      await reload();
    } catch (err) {
      if (err instanceof ClientError && err.code === "mfa_required") return navigateFresh("/security/verify?next=/security");
      setFormError(errorText(err, "We could not turn it off."));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="w-full max-w-lg">
      <h1 className="text-2xl font-extrabold sm:text-3xl">Account security</h1>
      <p className="mt-2 text-muted-foreground">
        Two-factor authentication asks for a code from an app on your phone (such as Google Authenticator or Microsoft Authenticator) each time you sign in.
      </p>

      {data && data.required_by.length > 0 && !data.enabled && (
        <p className="mt-4 rounded-lg bg-amber-soft px-3 py-2 text-sm" role="status">
          {data.required_by.join(", ")} requires two-factor authentication. Set it up below to use the clinic portal.
        </p>
      )}

      <div className="mt-6 rounded-xl border bg-card p-5">
        {loading || !data ? (
          <p className="text-sm text-muted-foreground">Loading…</p>
        ) : data.enabled ? (
          <>
            <p className="flex items-center gap-2 font-semibold">
              <ShieldCheck className="size-5 text-teal" aria-hidden /> Two-factor authentication is on
            </p>
            <ul className="mt-3 grid gap-2">
              {data.factors.map((f) => (
                <li key={f.id} className="flex flex-wrap items-center justify-between gap-2 text-sm">
                  <span>
                    {f.name} <span className="text-muted-foreground">· added {new Date(f.created_at).toLocaleDateString()}</span>
                  </span>
                  {data.required_by.length === 0 && (
                    <Button variant="ghost" size="sm" className="text-danger" disabled={busy} onClick={() => void remove(f.id)}>
                      <ShieldOff aria-hidden /> Turn off
                    </Button>
                  )}
                </li>
              ))}
            </ul>
            {next && (
              <Button className="mt-4" onClick={() => navigateFresh(safeNext(next, window.location.origin))}>
                Continue
              </Button>
            )}
          </>
        ) : setup ? (
          <form onSubmit={confirm} className="grid gap-4">
            <ol className="grid list-decimal gap-1 pl-5 text-sm">
              <li>Open your authenticator app and add a new account.</li>
              <li>Scan this QR code, or type the key below.</li>
              <li>Enter the 6-digit code the app shows.</li>
            </ol>
            {/* eslint-disable-next-line @next/next/no-img-element -- one-time data: URL from Supabase */}
            <img src={setup.qr_code} alt="QR code for your authenticator app" width={180} height={180} className="rounded-lg border bg-white p-2" />
            <p className="text-sm">
              Key: <code className="break-all rounded bg-muted px-1.5 py-0.5 font-mono text-xs">{setup.secret}</code>
            </p>
            <CodeInput value={code} onChange={setCode} id="mfa-setup-code" />
            <div className="flex gap-2">
              <Button type="submit" disabled={busy}>
                {busy && <Loader2 className="animate-spin" aria-hidden />} Turn on
              </Button>
              <Button type="button" variant="outline" onClick={() => setSetup(null)}>
                Cancel
              </Button>
            </div>
          </form>
        ) : (
          <>
            <p className="font-semibold">Two-factor authentication is off</p>
            <Button className="mt-3" disabled={busy} onClick={() => void start()}>
              {busy && <Loader2 className="animate-spin" aria-hidden />} Set up an authenticator app
            </Button>
          </>
        )}
        {formError && (
          <p className="mt-3 rounded-lg bg-danger-soft px-3 py-2 text-sm text-danger" role="alert">
            {formError}
          </p>
        )}
      </div>
      <p className="mt-6 text-sm">
        <Link href="/clinic/dashboard" className="underline underline-offset-2">
          Clinic portal
        </Link>{" "}
        ·{" "}
        <Link href="/dashboard" className="underline underline-offset-2">
          Patient app
        </Link>
      </p>
    </div>
  );
}
