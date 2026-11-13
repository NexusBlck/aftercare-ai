"use client";

import { HeartHandshake, Loader2, ShieldCheck } from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";
import { clearStoredToken, useTokenFromHash } from "@/components/clinic/token-from-hash";
import { Field } from "@/components/clinic/ui";
import { Logo } from "@/components/shared/logo";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { apiFetch, ClientError } from "@/lib/client/http";
import { navigateFresh } from "@/lib/client/navigation";

const KEY = "aftercare_patient_invite";

/**
 * Patient invitation: sign in (or create an account), then confirm date of birth to link the account
 * to the clinic's record. The page reveals nothing about the patient or clinic before verification.
 */
export default function PatientInvitationPage() {
  const token = useTokenFromHash(KEY);
  const [signedIn, setSignedIn] = useState<boolean | null>(null);
  const [dob, setDob] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    apiFetch<{ signed_in: boolean }>("/api/auth/session")
      .then((r) => setSignedIn(r.signed_in))
      .catch(() => setSignedIn(false));
  }, []);

  return (
    <main className="flex min-h-dvh flex-col items-center justify-center px-4 py-10">
      <Logo />
      <div className="mt-8 w-full max-w-md rounded-2xl border bg-card p-6 sm:p-8">
        <HeartHandshake className="size-8 text-teal" aria-hidden />
        <h1 className="mt-3 text-2xl font-extrabold">Your care team invited you</h1>
        <p className="mt-2 text-muted-foreground">Link your AFTERCARE AI account to see the recovery plan your clinician approved.</p>
        {token === undefined || signedIn === null ? (
          <Loader2 className="mt-6 size-5 animate-spin text-muted-foreground" aria-label="Loading" />
        ) : token === null ? (
          <p className="mt-4 text-sm">This invitation link is incomplete. Open the full link you received, or ask your clinic for a new one.</p>
        ) : !signedIn ? (
          <>
            <p className="mt-4 text-sm">First sign in, or create a free account. You will come back to this page.</p>
            <div className="mt-4 flex flex-wrap gap-2">
              <Button asChild>
                <Link href="/signup">Create account</Link>
              </Button>
              <Button asChild variant="outline">
                <Link href="/login?next=/invitation">Sign in</Link>
              </Button>
            </div>
          </>
        ) : (
          <form
            className="mt-5 grid gap-4"
            onSubmit={async (e) => {
              e.preventDefault();
              setBusy(true);
              setError(null);
              try {
                await apiFetch("/api/invitations/redeem", { method: "POST", body: JSON.stringify({ token, date_of_birth: dob }) });
                clearStoredToken(KEY);
                navigateFresh("/care-team");
              } catch (err) {
                setError(err instanceof ClientError ? err.message : "We could not link your account. Please try again.");
              } finally {
                setBusy(false);
              }
            }}
          >
            <Field label="Your date of birth" htmlFor="inv-dob" required hint="To confirm the invitation is for you.">
              <Input id="inv-dob" type="date" value={dob} onChange={(e) => setDob(e.target.value)} required />
            </Field>
            {error && <p role="alert" className="rounded-lg bg-danger-soft px-3 py-2 text-sm text-danger">{error}</p>}
            <Button type="submit" disabled={busy || !dob}>
              {busy && <Loader2 className="animate-spin" aria-hidden />} Link my account
            </Button>
            <p className="flex gap-2 text-xs text-muted-foreground">
              <ShieldCheck className="size-4 shrink-0" aria-hidden /> After five incorrect attempts the invitation is locked for your safety.
            </p>
          </form>
        )}
      </div>
    </main>
  );
}
