import { Suspense } from "react";
import { ClientRoot } from "@/components/app/client-root";
import { LogoMark } from "@/components/shared/logo";

function AppLoading() {
  return (
    <div className="flex min-h-dvh items-center justify-center" aria-busy="true">
      <div className="flex items-center gap-3 text-muted-foreground">
        <LogoMark className="animate-pulse" />
        <span className="text-sm">Loading your recovery plan…</span>
      </div>
    </div>
  );
}

export default function AppLayout({ children }: LayoutProps<"/">) {
  return (
    <Suspense fallback={<AppLoading />}>
      <ClientRoot>{children}</ClientRoot>
    </Suspense>
  );
}
