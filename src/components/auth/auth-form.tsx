"use client";

import { Eye, EyeOff, FlaskConical, Loader2 } from "lucide-react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useState } from "react";
import "@/schemas/zod-config";
import { z } from "zod";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { safeNext } from "@/lib/security/redirect";
import { accountsConfigured, createBrowserSupabase } from "@/lib/supabase/browser";

const Schema = z.object({
  email: z.email("Enter a valid email address."),
  password: z.string().min(8, "Use at least 8 characters."),
});

const REASONS: Record<string, string> = {
  expired: "Your session has expired. Please sign in again.",
  "signed-out": "You have been signed out.",
  unconfigured: "Accounts are not configured on this server. You can use the demo instead.",
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

export function AuthForm({ mode }: { mode: "login" | "signup" }) {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [errors, setErrors] = useState<{ email?: string; password?: string; form?: string }>({});
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
    setErrors({});
    const supabase = createBrowserSupabase();
    if (!supabase) {
      setErrors({ form: REASONS.unconfigured });
      return;
    }
    setBusy(true);
    try {
      if (mode === "login") {
        const { error } = await supabase.auth.signInWithPassword(parsed.data);
        if (error) {
          setErrors({ form: error.message === "Invalid login credentials" ? "That email and password do not match an account." : error.message });
          return;
        }
        router.replace(safeNext(new URLSearchParams(window.location.search).get("next"), window.location.origin));
        router.refresh();
      } else {
        const { data, error } = await supabase.auth.signUp({
          ...parsed.data,
          options: { emailRedirectTo: `${window.location.origin}/onboarding` },
        });
        if (error) {
          setErrors({ form: error.message });
          return;
        }
        if (data.session) {
          router.replace("/onboarding");
          router.refresh();
        } else {
          setInfo("Check your email to confirm your account, then sign in.");
        }
      }
    } catch {
      setErrors({ form: "We could not reach the sign-in service. Check your connection and try again." });
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
          <Label htmlFor="password">Password</Label>
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
        {errors.form && (
          <p className="rounded-lg bg-danger-soft px-3 py-2 text-sm text-danger" role="alert">
            {errors.form}
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
