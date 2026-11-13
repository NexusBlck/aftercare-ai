"use client";

import { Loader2, UsersRound } from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";
import { clearStoredToken, useTokenFromHash } from "@/components/clinic/token-from-hash";
import { Field } from "@/components/clinic/ui";
import { Logo } from "@/components/shared/logo";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { apiFetch, ClientError } from "@/lib/client/http";
import { navigateFresh } from "@/lib/client/navigation";

const KEY = "aftercare_staff_invite";

export default function JoinClinicPage() {
  const token = useTokenFromHash(KEY);
  const [signedIn, setSignedIn] = useState<boolean | null>(null);
  const [email, setEmail] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    apiFetch<{ user: { email: string | null } }>("/api/clinic/me")
      .then((me) => {
        setSignedIn(true);
        setEmail(me.user.email);
      })
      .catch(() => setSignedIn(false));
  }, []);

  return (
    <main className="flex min-h-dvh flex-col items-center justify-center px-4 py-10">
      <Logo />
      <div className="mt-8 w-full max-w-md rounded-2xl border bg-card p-6 sm:p-8">
        <UsersRound className="size-8 text-primary" aria-hidden />
        <h1 className="mt-3 text-2xl font-extrabold">Join your clinic team</h1>
        {token === undefined || signedIn === null ? (
          <Loader2 className="mt-6 size-5 animate-spin text-muted-foreground" aria-label="Loading" />
        ) : token === null ? (
          <p className="mt-2 text-muted-foreground">This invitation link is incomplete. Open the full link you received, or ask your clinic administrator for a new one.</p>
        ) : !signedIn ? (
          <>
            <p className="mt-2 text-muted-foreground">Sign in or create an account with the email address your invitation was sent to. You will come back here afterwards.</p>
            <div className="mt-6 flex flex-wrap gap-2">
              <Button asChild>
                <Link href="/login?next=/clinic/join">Sign in</Link>
              </Button>
              <Button asChild variant="outline">
                <Link href="/signup">Create account</Link>
              </Button>
            </div>
          </>
        ) : (
          <form
            className="mt-4 grid gap-4"
            onSubmit={async (e) => {
              e.preventDefault();
              setBusy(true);
              setError(null);
              try {
                await apiFetch("/api/clinic/join", { method: "POST", body: JSON.stringify({ token, display_name: name }) });
                clearStoredToken(KEY);
                navigateFresh("/clinic/dashboard");
              } catch (err) {
                setError(err instanceof ClientError ? err.message : "We could not accept the invitation.");
              } finally {
                setBusy(false);
              }
            }}
          >
            <p className="text-sm text-muted-foreground">Signed in as {email}.</p>
            <Field label="Your name as colleagues should see it" htmlFor="join-name" hint="e.g. Dr Sana Malik or Nurse Ali">
              <Input id="join-name" value={name} onChange={(e) => setName(e.target.value)} maxLength={80} />
            </Field>
            {error && <p role="alert" className="rounded-lg bg-danger-soft px-3 py-2 text-sm text-danger">{error}</p>}
            <Button type="submit" disabled={busy}>
              {busy && <Loader2 className="animate-spin" aria-hidden />} Accept invitation
            </Button>
          </form>
        )}
      </div>
    </main>
  );
}
