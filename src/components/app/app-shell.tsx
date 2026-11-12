"use client";

import {
  CalendarDays,
  ClipboardCheck,
  FileText,
  FlaskConical,
  LayoutDashboard,
  ListChecks,
  LogOut,
  Menu,
  Pill,
  Settings,
} from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useState, type ReactNode } from "react";
import { Logo } from "@/components/shared/logo";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { usePlan } from "@/hooks/use-plan";
import { planOverview } from "@/lib/domain/summary";
import { exitDemo } from "@/lib/client/demo";
import { createBrowserSupabase } from "@/lib/supabase/browser";
import { cn } from "@/lib/utils";

const NAV = [
  { href: "/dashboard", label: "Today", icon: LayoutDashboard, mobile: true },
  { href: "/review", label: "Review", icon: ClipboardCheck, mobile: true },
  { href: "/recovery-plan", label: "Recovery plan", short: "Plan", icon: ListChecks, mobile: true },
  { href: "/medications", label: "Medications", short: "Meds", icon: Pill, mobile: true },
  { href: "/appointments", label: "Appointments", short: "Visits", icon: CalendarDays, mobile: true },
  { href: "/documents", label: "Documents", icon: FileText, mobile: false },
  { href: "/settings", label: "Settings", icon: Settings, mobile: false },
] as const;

export function useSignOut() {
  const router = useRouter();
  const { mode } = usePlan();
  return async () => {
    if (mode === "demo") {
      exitDemo();
      return;
    }
    await createBrowserSupabase()?.auth.signOut();
    router.replace("/login?reason=signed-out");
    router.refresh();
  };
}

function NavLinks({ onNavigate, reviewCount }: { onNavigate?: () => void; reviewCount: number }) {
  const pathname = usePathname();
  return (
    <ul className="space-y-1">
      {NAV.map((item) => {
        const active = pathname === item.href || pathname.startsWith(`${item.href}/`);
        const Icon = item.icon;
        return (
          <li key={item.href}>
            <Link
              href={item.href}
              onClick={onNavigate}
              aria-current={active ? "page" : undefined}
              className={cn(
                "flex h-11 items-center gap-3 rounded-lg px-3 text-sm font-medium transition-colors",
                active ? "bg-sidebar-accent text-white" : "text-sidebar-foreground/80 hover:bg-sidebar-accent/60 hover:text-white",
              )}
            >
              <Icon className={cn("size-4.5", active && "text-sidebar-primary")} aria-hidden />
              {item.label}
              {item.href === "/review" && reviewCount > 0 && (
                <span className="ml-auto rounded-md bg-amber px-1.5 py-0.5 text-[0.7rem] font-bold text-white">{reviewCount}</span>
              )}
            </Link>
          </li>
        );
      })}
    </ul>
  );
}

export function AppShell({ children }: { children: ReactNode }) {
  const { mode, bundle, profile, email } = usePlan();
  const pathname = usePathname();
  const [menuOpen, setMenuOpen] = useState(false);
  const signOut = useSignOut();
  const overview = bundle ? planOverview(bundle) : null;
  const reviewCount = overview ? overview.needsReview + overview.openConflicts : 0;

  return (
    <div className="flex min-h-dvh flex-col lg:flex-row">
      {/* Desktop sidebar */}
      <aside className="sticky top-0 hidden h-dvh w-64 shrink-0 flex-col bg-sidebar p-4 text-sidebar-foreground lg:flex" aria-label="Main navigation">
        <Logo inverted href="/dashboard" className="px-2 py-1" />
        <nav className="mt-8 flex-1">
          <NavLinks reviewCount={reviewCount} />
        </nav>
        <div className="space-y-3 border-t border-sidebar-border pt-4">
          <p className="truncate px-2 text-xs text-sidebar-foreground/70">
            {mode === "demo" ? "Demo — fictional patient" : (profile.display_name ?? email ?? "Signed in")}
          </p>
          <Button variant="ghost" onClick={signOut} className="w-full justify-start text-sidebar-foreground/80 hover:bg-sidebar-accent hover:text-white">
            <LogOut aria-hidden />
            {mode === "demo" ? "Exit demo" : "Sign out"}
          </Button>
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        {mode === "demo" && (
          <div className="flex flex-wrap items-center justify-center gap-x-3 gap-y-1 bg-amber-soft px-4 py-2 text-center text-xs font-medium text-amber sm:text-sm" role="note">
            <FlaskConical className="size-4" aria-hidden />
            Demo mode: synthetic data for a fictional patient, stored only in this browser.
            <button type="button" onClick={exitDemo} className="underline underline-offset-2">
              Exit demo
            </button>
          </div>
        )}

        {/* Mobile header */}
        <header className="sticky top-0 z-30 flex h-14 items-center justify-between border-b bg-background/95 px-4 backdrop-blur lg:hidden">
          <Logo href="/dashboard" />
          <Sheet open={menuOpen} onOpenChange={setMenuOpen}>
            <SheetTrigger asChild>
              <Button variant="ghost" size="icon" aria-label="Open menu">
                <Menu aria-hidden />
              </Button>
            </SheetTrigger>
            <SheetContent side="right" className="w-72 border-sidebar-border bg-sidebar p-4 text-sidebar-foreground">
              <SheetHeader className="p-0">
                <SheetTitle className="text-white">Menu</SheetTitle>
              </SheetHeader>
              <nav className="mt-4" aria-label="Main navigation">
                <NavLinks onNavigate={() => setMenuOpen(false)} reviewCount={reviewCount} />
              </nav>
              <Button variant="ghost" onClick={signOut} className="mt-4 w-full justify-start text-sidebar-foreground/80 hover:bg-sidebar-accent hover:text-white">
                <LogOut aria-hidden />
                {mode === "demo" ? "Exit demo" : "Sign out"}
              </Button>
            </SheetContent>
          </Sheet>
        </header>

        <main id="main" className="mx-auto w-full max-w-6xl flex-1 px-4 pt-6 pb-28 sm:px-6 lg:px-10 lg:pt-10 lg:pb-12">
          {children}
        </main>

        <footer className="hidden border-t px-10 py-4 text-xs text-muted-foreground lg:block">
          AFTERCARE AI organizes the documents you provide. It does not give medical advice. In an emergency, call your local emergency number.
        </footer>

        {/* Mobile bottom navigation */}
        <nav className="fixed inset-x-0 bottom-0 z-30 border-t bg-card/95 pb-[env(safe-area-inset-bottom)] backdrop-blur lg:hidden" aria-label="Quick navigation">
          <ul className="grid grid-cols-5">
            {NAV.filter((n) => n.mobile).map((item) => {
              const active = pathname === item.href;
              const Icon = item.icon;
              return (
                <li key={item.href}>
                  <Link
                    href={item.href}
                    aria-current={active ? "page" : undefined}
                    className={cn("relative flex h-16 flex-col items-center justify-center gap-1 text-[0.7rem] font-medium", active ? "text-teal" : "text-muted-foreground")}
                  >
                    <Icon className="size-5" aria-hidden />
                    {"short" in item ? item.short : item.label}
                    {item.href === "/review" && reviewCount > 0 && (
                      <span className="absolute top-2 right-[calc(50%-1.25rem)] min-w-4 rounded-full bg-amber px-1 text-[0.6rem] leading-4 font-bold text-white">
                        {reviewCount}
                      </span>
                    )}
                  </Link>
                </li>
              );
            })}
          </ul>
        </nav>
      </div>
    </div>
  );
}
