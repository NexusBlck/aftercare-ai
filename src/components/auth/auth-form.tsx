"use client";

import { Eye, EyeOff, FlaskConical, Loader2 } from "lucide-react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Suspense, useState } from "react";
import "@/schemas/zod-config";
import { z } from "zod";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { safeNext } from "@/lib/security/redirect";
import { apiFetch, ClientError } from "@/lib/client/http";
import { accountsConfigured } from "@/lib/supabase/browser";
import { navigateFresh } from "@/lib/client/navigation";

const Schema = z.object({
  email: z.email("Enter a valid email address."),
  password: z.string().min(8, "Use at least 8 characters.").max(72, "Use 72 characters or fewer."),
});

const REASONS: Record<string, string> = {
  expired: "Your session has expired. Please sign in again.",
  "signed-out": "You have been signed out.",
  unconfigured: "Accounts are not configured on this server. You can use the demo instead.",
  "link-invalid": "That link is invalid, expired or has already been used. Please request a new one.",
  "password-updated": "Your password was changed. Please sign in with your new password.",
  "account-deleted": "Your account and all data were deleted.",
};

/** Reads ?reason= in its own Suspense boundary so the form itself can be server-rendered. */
function ReasonAlert() {
  const reason = useSearchParams().get("reason");
  if (!reason || !REASONS[reason]) return null;
  return (
    <Alert className="mt-6">
      <AlertDescription>{REASONS[reason]}</AlertDescription>
    </Alert>
  );
}

/** A new account opened from an invitation link returns to that invitation (token kept in sessionStorage). */
function pendingInvitationPath(): string | null {
  try {
    if (sessionStorage.getItem("aftercare_patient_invite")) return "/invitation";
    if (sessionStorage.getItem("aftercare_staff_invite")) return "/clinic/join";
  } catch {
    // storage unavailable
  }
  return null;
}

export function AuthForm({ mode }: { mode: "login" | "signup" }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [errors, setErrors] = useState<{ email?: string; password?: string; consent?: string; form?: string; exists?: boolean }>({});
  const [consent, setConsent] = useState({ accepted: false, marketing: false });
  const [info, setInfo] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setInfo(null);
    const parsed = Schema.safeParse({ email: email.trim(), password });
    if (!parsed.success) {
      const fieldErrors = z.flattenError(parsed.error).fieldErrors;
      setErrors({ email: fieldErrors.email?.[0], password: fieldErrors.password?.[0] });
      return;
    }
    if (mode === "signup" && !consent.accepted) {
      setErrors({ consent: "Please agree to the Terms of Service and Privacy Policy to create an account." });
      return;
    }
    setErrors({});
    if (!accountsConfigured) {
      setErrors({ form: REASONS.unconfigured });
      return;
    }
    setBusy(true);
    try {
      // Sign-in and sign-up run on the server, which sets HttpOnly session cookies; the browser
      // never handles tokens.
      if (mode === "login") {
        const res = await apiFetch<{ home?: string }>("/api/auth/login", { method: "POST", body: JSON.stringify(parsed.data) });
        const next = new URLSearchParams(window.location.search).get("next");
        navigateFresh(next ? safeNext(next, window.location.origin) : (pendingInvitationPath() ?? res.home ?? "/dashboard"));
      } else {
        const res = await apiFetch<{ needsConfirmation: boolean }>("/api/auth/signup", {
          method: "POST",
          body: JSON.stringify({
            ...parsed.data,
            consents: { accepted: consent.accepted, marketing: consent.marketing },
          }),
        });
        if (res.needsConfirmation) {
          setInfo("Check your email for a confirmation link. It signs you in and takes you to set-up.");
        } else {
          navigateFresh(pendingInvitationPath() ?? "/onboarding");
        }
      }
    } catch (err) {
      setErrors({
        form: err instanceof ClientError ? err.message : "We could not reach the sign-in service. Check your connection and try again.",
        exists: err instanceof ClientError && err.code === "account_exists",
      });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="w-full max-w-md">
      <h1 className="text-2xl font-extrabold sm:text-3xl">{mode === "login" ? "Welcome back" : "Create your account"}</h1>
      <p className="mt-2 text-muted-foreground">
        {mode === "login" ? "Sign in to see your recovery plan." : "Your documents stay private to your account."}
      </p>

      <Suspense>
        <ReasonAlert />
      </Suspense>
      {!accountsConfigured && (
        <Alert className="mt-6 border-amber/30 bg-amber-soft">
          <AlertDescription>
            Accounts are not configured on this server (Supabase environment variables are missing). Use the demo to explore AFTERCARE AI with synthetic data.
          </AlertDescription>
        </Alert>
      )}

      <form onSubmit={submit} noValidate className="mt-6 grid gap-4">
        <div className="grid gap-1.5">
          <Label htmlFor="email">Email</Label>
          <Input
            id="email"
            type="email"
            autoComplete="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            aria-invalid={!!errors.email}
            aria-describedby={errors.email ? "email-error" : undefined}
            className="h-11"
          />
          {errors.email && (
            <p id="email-error" className="text-sm text-danger">
              {errors.email}
            </p>
          )}
        </div>
        <div className="grid gap-1.5">
          <div className="flex items-center justify-between">
            <Label htmlFor="password">Password</Label>
            {mode === "login" && (
              <Link href="/forgot-password" className="text-sm font-medium text-muted-foreground underline-offset-2 hover:text-foreground hover:underline">
                Forgot password?
              </Link>
            )}
          </div>
          <div className="relative">
            <Input
              id="password"
              type={showPassword ? "text" : "password"}
              autoComplete={mode === "login" ? "current-password" : "new-password"}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              aria-invalid={!!errors.password}
              aria-describedby={errors.password ? "password-error" : undefined}
              className="h-11 pr-12"
            />
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="absolute top-0.5 right-0.5"
              onClick={() => setShowPassword((s) => !s)}
              aria-label={showPassword ? "Hide password" : "Show password"}
              aria-pressed={showPassword}
            >
              {showPassword ? <EyeOff aria-hidden /> : <Eye aria-hidden />}
            </Button>
          </div>
          {errors.password && (
            <p id="password-error" className="text-sm text-danger">
              {errors.password}
            </p>
          )}
        </div>
        {mode === "signup" && (
          <fieldset className="grid gap-3" aria-describedby={errors.consent ? "consent-error" : undefined}>
            <legend className="sr-only">Agreements</legend>
            <ConsentBox id="consent-terms" checked={consent.accepted} onChange={(v) => setConsent({ ...consent, accepted: v })} required>
              I agree to the{" "}
              <Link href="/terms" target="_blank" className="font-semibold underline underline-offset-2">
                Terms of Service
              </Link>{" "}
              and{" "}
              <Link href="/privacy" target="_blank" className="font-semibold underline underline-offset-2">
                Privacy Policy
              </Link>
              , including processing of my health information
            </ConsentBox>
            <ConsentBox id="consent-marketing" checked={consent.marketing} onChange={(v) => setConsent({ ...consent, marketing: v })}>
              Send me product updates and offers by email
            </ConsentBox>
            {errors.consent && (
              <p id="consent-error" className="text-sm text-danger" role="alert">
                {errors.consent}
              </p>
            )}
          </fieldset>
        )}
        {errors.form && (
          <p className="rounded-lg bg-danger-soft px-3 py-2 text-sm text-danger" role="alert">
            {errors.form}
            {errors.exists && (
              <>
                {" "}
                <Link href="/login" className="font-semibold underline underline-offset-2">
                  Sign in instead
                </Link>
              </>
            )}
          </p>
        )}
        {info && (
          <p className="rounded-lg bg-teal-soft px-3 py-2 text-sm text-teal" role="status">
            {info}
          </p>
        )}
        <Button type="submit" size="lg" disabled={busy || !accountsConfigured}>
          {busy && <Loader2 className="animate-spin" aria-hidden />}
          {mode === "login" ? "Sign in" : "Create account"}
        </Button>
      </form>

      <p className="mt-6 text-sm text-muted-foreground">
        {mode === "login" ? "New to AFTERCARE AI? " : "Already have an account? "}
        <Link href={mode === "login" ? "/signup" : "/login"} className="font-semibold text-foreground underline underline-offset-2">
          {mode === "login" ? "Create an account" : "Sign in"}
        </Link>
      </p>

      <div className="mt-8 rounded-xl border bg-card p-4">
        <p className="text-sm font-semibold">Just exploring?</p>
        <p className="mt-1 text-sm text-muted-foreground">Try the demo with a fictional patient’s synthetic documents. Nothing is stored on our server.</p>
        <Button asChild variant="outline" className="mt-3">
          <a href="/demo">
            <FlaskConical aria-hidden /> Try the demo
          </a>
        </Button>
      </div>
    </div>
  );
}

function ConsentBox({
  id,
  checked,
  onChange,
  required = false,
  children,
}: {
  id: string;
  checked: boolean;
  onChange: (value: boolean) => void;
  required?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div className="flex items-start gap-3 text-sm">
      <input
        id={id}
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        aria-required={required}
        className="mt-0.5 size-4 shrink-0 accent-[var(--teal)]"
      />
      <label htmlFor={id} className="leading-snug">
        {children}
        {required && (
          <>
            <span aria-hidden className="ml-0.5 font-semibold text-danger">
              *
            </span>
            <span className="sr-only"> (required)</span>
          </>
        )}
      </label>
    </div>
  );
}
