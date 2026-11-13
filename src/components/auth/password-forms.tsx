"use client";

import { Loader2 } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { apiFetch, ClientError } from "@/lib/client/http";

export function ForgotPasswordForm() {
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await apiFetch("/api/auth/reset", { method: "POST", body: JSON.stringify({ email }) });
      setSent(true);
    } catch (err) {
      setError(err instanceof ClientError ? err.message : "Something went wrong. Please try again.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="w-full max-w-md">
      <h1 className="text-2xl font-extrabold sm:text-3xl">Reset your password</h1>
      <p className="mt-2 text-muted-foreground">Enter your account email and we&rsquo;ll send a reset link. It works once and expires after 15 minutes.</p>
      {sent ? (
        <p className="mt-6 rounded-lg bg-teal-soft px-3 py-2 text-sm text-teal" role="status">
          If an account exists for that email, a reset link is on its way. Check your inbox and spam folder.
        </p>
      ) : (
        <form onSubmit={submit} className="mt-6 grid gap-4">
          <div className="grid gap-1.5">
            <Label htmlFor="reset-email">Email</Label>
            <Input id="reset-email" type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} className="h-11" />
          </div>
          {error && (
            <p className="rounded-lg bg-danger-soft px-3 py-2 text-sm text-danger" role="alert">
              {error}
            </p>
          )}
          <Button type="submit" size="lg" disabled={busy}>
            {busy && <Loader2 className="animate-spin" aria-hidden />}
            Send reset link
          </Button>
        </form>
      )}
      <p className="mt-6 text-sm text-muted-foreground">
        Remembered it?{" "}
        <Link href="/login" className="font-semibold text-foreground underline underline-offset-2">
          Sign in
        </Link>
      </p>
    </div>
  );
}

export function NewPasswordForm() {
  const router = useRouter();
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (password.length < 8 || password.length > 72) return setError("Use between 8 and 72 characters.");
    // nosemgrep: node_timing_attack -- compares two fields the user just typed, in their own browser; no secret involved
    if (password !== confirm) return setError("The two passwords do not match.");
    setBusy(true);
    setError(null);
    try {
      await apiFetch("/api/auth/password", { method: "POST", body: JSON.stringify({ password }) });
      await fetch("/api/auth/logout", { method: "POST", credentials: "same-origin" }).catch(() => undefined);
      router.replace("/login?reason=password-updated");
    } catch (err) {
      setError(
        err instanceof ClientError && err.code === "unauthorized"
          ? "This reset link has expired or was already used. Please request a new one."
          : err instanceof ClientError
            ? err.message
            : "Something went wrong. Please try again.",
      );
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="w-full max-w-md">
      <h1 className="text-2xl font-extrabold sm:text-3xl">Choose a new password</h1>
      <p className="mt-2 text-muted-foreground">Use 8 to 72 characters. Other signed-in devices will be signed out.</p>
      <form onSubmit={submit} className="mt-6 grid gap-4">
        <div className="grid gap-1.5">
          <Label htmlFor="new-password">New password</Label>
          <Input id="new-password" type="password" autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)} className="h-11" />
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="confirm-password">Confirm new password</Label>
          <Input id="confirm-password" type="password" autoComplete="new-password" value={confirm} onChange={(e) => setConfirm(e.target.value)} className="h-11" />
        </div>
        {error && (
          <p className="rounded-lg bg-danger-soft px-3 py-2 text-sm text-danger" role="alert">
            {error}{" "}
            {/expired/.test(error) && (
              <Link href="/forgot-password" className="font-semibold underline">
                Request a new link
              </Link>
            )}
          </p>
        )}
        <Button type="submit" size="lg" disabled={busy}>
          {busy && <Loader2 className="animate-spin" aria-hidden />}
          Save new password
        </Button>
      </form>
    </div>
  );
}
