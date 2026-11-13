"use client";

import { Building2, LogIn, ShieldCheck } from "lucide-react";
import Link from "next/link";
import { use, useEffect, type ReactNode } from "react";
import { browser } from "react-dom";
import { useRouter } from "next/navigation";
import { LogoMark } from "@/components/shared/logo";
import { Button } from "@/components/ui/button";
import { navigateFresh } from "@/lib/client/navigation";
import { ClinicProvider, useClinicMe } from "./clinic-context";
import { ClinicShell } from "./clinic-shell";
import { ErrorState } from "./ui";

function Loading() {
  return (
    <main className="flex min-h-dvh items-center justify-center" aria-busy="true">
      <div className="flex items-center gap-3 text-muted-foreground">
        <LogoMark className="animate-pulse" />
        <span className="text-sm">Loading the clinic portal…</span>
      </div>
    </main>
  );
}

/**
 * Client root for the clinic portal. Access is decided by the server (/api/clinic/me): users without
 * an active membership are sent to clinic registration; every API call is authorized again server-side.
 */
export function ClinicRoot({ children }: { children: ReactNode }) {
  use(browser("The clinic portal loads its data in the browser."));
  const { data, error, loading, reload } = useClinicMe();
  const router = useRouter();
  const noClinic = data && !data.active;

  useEffect(() => {
    if (noClinic) router.replace("/clinic/register");
  }, [noClinic, router]);
  const needsCode = error?.code === "mfa_required";
  useEffect(() => {
    if (needsCode) navigateFresh(`/security/verify?next=${encodeURIComponent(window.location.pathname)}`);
  }, [needsCode]);

  if (needsCode) return <Loading />;
  if (error?.code === "mfa_setup_required") {
    return (
      <main className="flex min-h-dvh items-center justify-center px-4">
        <div className="max-w-sm text-center">
          <ShieldCheck className="mx-auto size-8 text-primary" aria-hidden />
          <p className="mt-3 font-semibold">Your clinic requires two-factor authentication.</p>
          <p className="mt-1 text-sm text-muted-foreground">Set up an authenticator app on your phone to continue. It takes about a minute.</p>
          <Button asChild className="mt-4">
            <Link href="/security?next=/clinic/dashboard">Set up two-factor</Link>
          </Button>
        </div>
      </main>
    );
  }

  if (error?.code === "unauthorized") {
    return (
      <main className="flex min-h-dvh items-center justify-center px-4">
        <div className="max-w-sm text-center">
          <LogIn className="mx-auto size-8 text-primary" aria-hidden />
          <p className="mt-3 font-semibold">Please sign in to use the clinic portal.</p>
          <Button asChild className="mt-4">
            <Link href="/login?next=/clinic/dashboard">Sign in</Link>
          </Button>
        </div>
      </main>
    );
  }
  if (error?.code === "accounts_unconfigured") {
    return (
      <main className="flex min-h-dvh items-center justify-center px-4">
        <div className="max-w-md text-center">
          <Building2 className="mx-auto size-8 text-primary" aria-hidden />
          <p className="mt-3 font-semibold">Accounts are not configured on this server.</p>
          <p className="mt-1 text-sm text-muted-foreground">The clinic portal needs Supabase. See DEPLOYMENT.md.</p>
        </div>
      </main>
    );
  }
  if (error) {
    return (
      <main className="mx-auto max-w-xl px-4 py-16">
        <ErrorState error={error} onRetry={reload} />
      </main>
    );
  }
  if (loading || !data?.active) return <Loading />;
  return (
    <ClinicProvider me={data} refresh={reload}>
      <ClinicShell>{children}</ClinicShell>
    </ClinicProvider>
  );
}
