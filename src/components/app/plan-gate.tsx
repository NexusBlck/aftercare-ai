"use client";

import { FileUp, FlaskConical, RefreshCw } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { usePlan } from "@/hooks/use-plan";
import type { PlanBundle } from "@/schemas/domain";

export function PageSkeleton() {
  return (
    <div className="space-y-6" aria-busy="true" aria-label="Loading">
      <Skeleton className="h-9 w-64" />
      <div className="grid gap-4 sm:grid-cols-3">
        <Skeleton className="h-28" />
        <Skeleton className="h-28" />
        <Skeleton className="h-28" />
      </div>
      <Skeleton className="h-64" />
    </div>
  );
}

export function PageHeader({ title, description, actions }: { title: string; description?: ReactNode; actions?: ReactNode }) {
  return (
    <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between lg:mb-8">
      <div className="min-w-0">
        <h1 className="text-2xl font-extrabold text-foreground sm:text-3xl">{title}</h1>
        {description && <p className="mt-1.5 max-w-2xl text-[0.95rem] text-muted-foreground">{description}</p>}
      </div>
      {actions && <div className="flex shrink-0 flex-wrap gap-2">{actions}</div>}
    </div>
  );
}

/** Handles loading, load errors and "no plan yet" so each page only renders the happy path. */
export function PlanGate({ children }: { children: (bundle: PlanBundle) => ReactNode }) {
  const { status, loadError, bundle, reload, mode } = usePlan();
  if (status === "loading") return <PageSkeleton />;
  if (status === "error") {
    return (
      <div className="mx-auto max-w-md rounded-xl border bg-card p-6 text-center" role="alert">
        <h1 className="text-lg font-bold">We could not load your recovery plan</h1>
        <p className="mt-2 text-sm text-muted-foreground">{loadError}</p>
        <Button className="mt-4" onClick={() => void reload()}>
          <RefreshCw aria-hidden /> Try again
        </Button>
      </div>
    );
  }
  if (!bundle) {
    return (
      <div className="mx-auto max-w-lg rounded-2xl border bg-card p-8 text-center">
        <span className="mx-auto grid size-12 place-items-center rounded-xl bg-teal-soft text-teal">
          <FileUp className="size-6" aria-hidden />
        </span>
        <h1 className="mt-4 text-xl font-bold">Start your recovery plan</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Create a plan, then upload your discharge summary, prescriptions and other instructions. You will review everything before it is used.
        </p>
        <div className="mt-6 flex flex-col justify-center gap-2 sm:flex-row">
          <Button asChild>
            <Link href="/onboarding">Set up my plan</Link>
          </Button>
          {mode === "demo" && (
            <Button asChild variant="outline">
              {/* Plain anchor: /demo sets a cookie, so it must not be prefetched. */}
              <a href="/demo">
                <FlaskConical aria-hidden /> Load the sample plan
              </a>
            </Button>
          )}
        </div>
      </div>
    );
  }
  return <>{children(bundle)}</>;
}
