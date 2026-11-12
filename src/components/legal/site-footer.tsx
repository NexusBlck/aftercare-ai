import Link from "next/link";
import { LEGAL } from "@/lib/legal";
import { cn } from "@/lib/utils";

export const LEGAL_LINKS = [
  { href: "/privacy", label: "Privacy" },
  { href: "/terms", label: "Terms" },
  { href: "/privacy#cookies", label: "Cookies" },
  { href: "/subprocessors", label: "Subprocessors" },
  { href: "/contact", label: "Contact" },
];

export function LegalLinks({ className }: { className?: string }) {
  return (
    <nav aria-label="Legal" className={cn("flex flex-wrap gap-x-4 gap-y-1 text-sm", className)}>
      {LEGAL_LINKS.map((l) => (
        <Link key={l.href} href={l.href} className="underline-offset-2 hover:underline">
          {l.label}
        </Link>
      ))}
    </nav>
  );
}

export function SiteFooter() {
  return (
    <footer className="border-t bg-card">
      <div className="mx-auto flex max-w-6xl flex-col gap-3 px-4 py-6 text-sm text-muted-foreground sm:px-6">
        <LegalLinks />
        <p>
          © 2026 {LEGAL.operatorName ?? LEGAL.productName}. An educational tool that organizes documents you provide. Not medical advice, and not for emergencies.
        </p>
      </div>
    </footer>
  );
}
