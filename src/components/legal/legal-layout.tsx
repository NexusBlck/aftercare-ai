import Link from "next/link";
import type { ReactNode } from "react";
import { SiteFooter } from "@/components/legal/site-footer";
import { Logo } from "@/components/shared/logo";
import { EFFECTIVE_DATE_LABEL } from "@/lib/legal";

const NAV = [
  { href: "/privacy", label: "Privacy policy" },
  { href: "/terms", label: "Terms of service" },
  { href: "/subprocessors", label: "Subprocessors" },
  { href: "/contact", label: "Contact" },
];

export function LegalLayout({ title, version, children }: { title: string; version?: string; children: ReactNode }) {
  return (
    <div className="flex min-h-dvh flex-col">
      <header className="border-b bg-background/90">
        <div className="mx-auto flex h-16 max-w-4xl items-center justify-between gap-4 px-4 sm:px-6">
          <Logo />
          <Link href="/" className="text-sm font-medium text-muted-foreground hover:text-foreground">
            Back to home
          </Link>
        </div>
      </header>
      <main id="main-content" className="mx-auto w-full max-w-4xl flex-1 px-4 py-10 sm:px-6">
        <nav aria-label="Legal documents" className="mb-8 flex flex-wrap gap-2">
          {NAV.map((n) => (
            <Link key={n.href} href={n.href} className="rounded-lg border bg-card px-3 py-1.5 text-sm font-medium hover:bg-muted">
              {n.label}
            </Link>
          ))}
        </nav>
        <article className="legal">
          <h1>{title}</h1>
          {version && (
            <p className="legal-meta">
              Effective {EFFECTIVE_DATE_LABEL} · Version {version}
            </p>
          )}
          {children}
        </article>
      </main>
      <SiteFooter />
    </div>
  );
}
