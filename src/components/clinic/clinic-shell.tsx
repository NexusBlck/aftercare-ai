"use client";

import {
  Building2,
  CalendarClock,
  ClipboardCheck,
  CreditCard,
  LayoutDashboard,
  LogOut,
  Menu,
  MessageSquareText,
  ScrollText,
  Settings,
  Users,
  UserRoundPlus,
} from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useState, type ReactNode } from "react";
import { LegalLinks } from "@/components/legal/site-footer";
import { Logo } from "@/components/shared/logo";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { ROLE_LABELS, type Permission } from "@/lib/clinic/permissions";
import { cn } from "@/lib/utils";
import { useClinic } from "./clinic-context";
import { NotificationsBell } from "./notifications-bell";
import { send } from "./use-api";

const NAV: Array<{ href: string; label: string; icon: typeof LayoutDashboard; permission?: Permission }> = [
  { href: "/clinic/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { href: "/clinic/patients", label: "Patients", icon: Users },
  { href: "/clinic/review", label: "Clinical review", icon: ClipboardCheck },
  { href: "/clinic/follow-ups", label: "Follow-ups", icon: CalendarClock },
  { href: "/clinic/questions", label: "Questions", icon: MessageSquareText, permission: "questions.respond" },
  { href: "/clinic/staff", label: "Staff", icon: UserRoundPlus },
  { href: "/clinic/settings", label: "Clinic settings", icon: Settings },
  { href: "/clinic/billing", label: "Subscription", icon: CreditCard, permission: "billing.read" },
  { href: "/clinic/audit", label: "Audit log", icon: ScrollText, permission: "audit.read" },
];

function NavLinks({ onNavigate }: { onNavigate?: () => void }) {
  const pathname = usePathname();
  const { can } = useClinic();
  return (
    <ul className="space-y-1">
      {NAV.filter((n) => !n.permission || can(n.permission)).map((item) => {
        const active = pathname === item.href || pathname.startsWith(`${item.href}/`);
        const Icon = item.icon;
        return (
          <li key={item.href}>
            <Link
              href={item.href}
              onClick={onNavigate}
              aria-current={active ? "page" : undefined}
              className={cn(
                "flex h-10 items-center gap-3 rounded-lg px-3 text-sm font-medium transition-colors",
                active ? "bg-sidebar-accent text-white" : "text-sidebar-foreground/80 hover:bg-sidebar-accent/60 hover:text-white",
              )}
            >
              <Icon className={cn("size-4.5", active && "text-sidebar-primary")} aria-hidden />
              {item.label}
            </Link>
          </li>
        );
      })}
    </ul>
  );
}

function OrgSwitcher() {
  const { me, active, refresh } = useClinic();
  const router = useRouter();
  if (me.memberships.length < 2) {
    return (
      <div className="flex items-center gap-2 rounded-lg bg-sidebar-accent/40 px-3 py-2.5">
        <Building2 className="size-4 shrink-0 text-sidebar-primary" aria-hidden />
        <span className="truncate text-sm font-semibold text-white">{active.organization.name}</span>
      </div>
    );
  }
  return (
    <label className="block">
      <span className="sr-only">Active clinic</span>
      <select
        value={active.organization.id}
        onChange={async (e) => {
          await send("/api/clinic/active-org", "POST", { organization_id: e.target.value });
          await refresh();
          router.push("/clinic/dashboard");
        }}
        className="h-10 w-full rounded-lg border border-sidebar-border bg-sidebar-accent/40 px-2 text-sm font-semibold text-white"
      >
        {me.memberships.map((m) => (
          <option key={m.organization_id} value={m.organization_id} className="text-foreground">
            {m.name}
          </option>
        ))}
      </select>
    </label>
  );
}

function useSignOut() {
  const router = useRouter();
  return async () => {
    await fetch("/api/auth/logout", { method: "POST", credentials: "same-origin" }).catch(() => undefined);
    router.replace("/login?reason=signed-out");
    router.refresh();
  };
}

export function ClinicShell({ children }: { children: ReactNode }) {
  const { active } = useClinic();
  const [open, setOpen] = useState(false);
  const signOut = useSignOut();
  const who = (
    <p className="truncate px-2 text-xs text-sidebar-foreground/70">
      {active.member.display_name ?? "Signed in"} · {ROLE_LABELS[active.member.role]}
      {active.member.clinical_reviewer && active.member.role !== "clinician" ? " · Clinical reviewer" : ""}
    </p>
  );

  return (
    <div className="flex min-h-dvh flex-col lg:flex-row">
      <aside className="sticky top-0 hidden h-dvh w-64 shrink-0 flex-col bg-sidebar p-4 text-sidebar-foreground lg:flex" aria-label="Clinic navigation">
        <div className="flex items-center justify-between">
          <Logo inverted href="/clinic/dashboard" className="px-2 py-1" />
          <NotificationsBell inverted />
        </div>
        <p className="mt-1 px-2 text-[0.7rem] font-semibold tracking-wider text-sidebar-foreground/60 uppercase">Clinic portal</p>
        <div className="mt-5">
          <OrgSwitcher />
        </div>
        <nav className="mt-5 flex-1 overflow-y-auto">
          <NavLinks />
        </nav>
        <div className="space-y-3 border-t border-sidebar-border pt-4">
          {who}
          <Button variant="ghost" onClick={signOut} className="w-full justify-start text-sidebar-foreground/80 hover:bg-sidebar-accent hover:text-white">
            <LogOut aria-hidden /> Sign out
          </Button>
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        {!active.entitlements.active && (
          <div role="note" className="bg-danger-soft px-4 py-2 text-center text-sm font-medium text-danger">
            The clinic subscription is not active. Existing records are available, but new patients, documents and invitations cannot be added.
          </div>
        )}
        <header className="sticky top-0 z-30 flex h-14 items-center justify-between border-b bg-background/95 px-4 backdrop-blur lg:hidden">
          <Logo href="/clinic/dashboard" />
          <div className="flex items-center gap-1">
            <NotificationsBell />
            <Sheet open={open} onOpenChange={setOpen}>
              <SheetTrigger asChild>
                <Button variant="ghost" size="icon" aria-label="Open menu">
                  <Menu aria-hidden />
                </Button>
              </SheetTrigger>
              <SheetContent side="right" className="w-72 border-sidebar-border bg-sidebar p-4 text-sidebar-foreground">
                <SheetHeader className="p-0">
                  <SheetTitle className="text-white">Clinic menu</SheetTitle>
                </SheetHeader>
                <OrgSwitcher />
                <nav className="mt-4" aria-label="Clinic navigation">
                  <NavLinks onNavigate={() => setOpen(false)} />
                </nav>
                <div className="mt-4 border-t border-sidebar-border pt-4">
                  {who}
                  <Button variant="ghost" onClick={signOut} className="mt-2 w-full justify-start text-sidebar-foreground/80 hover:bg-sidebar-accent hover:text-white">
                    <LogOut aria-hidden /> Sign out
                  </Button>
                </div>
              </SheetContent>
            </Sheet>
          </div>
        </header>
        <main id="main" className="mx-auto w-full max-w-7xl flex-1 px-4 py-6 sm:px-6 lg:px-10 lg:py-10">
          {children}
        </main>
        <footer className="border-t px-4 py-4 text-xs text-muted-foreground sm:px-10 lg:flex lg:items-center lg:justify-between lg:gap-6">
          <span>AFTERCARE AI organizes documented instructions for clinician review. It does not diagnose, prescribe or replace clinical judgement.</span>
          <LegalLinks className="mt-2 shrink-0 text-xs lg:mt-0" />
        </footer>
      </div>
    </div>
  );
}
