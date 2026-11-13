import type { Metadata } from "next";
import { Suspense } from "react";
import { ClinicRoot } from "@/components/clinic/clinic-root";
import { LogoMark } from "@/components/shared/logo";

export const metadata: Metadata = { title: "Clinic portal · AFTERCARE AI" };

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

export default function ClinicPortalLayout({ children }: LayoutProps<"/clinic">) {
  return (
    <Suspense fallback={<Loading />}>
      <ClinicRoot>{children}</ClinicRoot>
    </Suspense>
  );
}
