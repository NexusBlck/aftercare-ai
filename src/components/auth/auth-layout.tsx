import { CheckCircle2 } from "lucide-react";
import type { ReactNode } from "react";
import { LegalLinks } from "@/components/legal/site-footer";
import { Logo } from "@/components/shared/logo";

const POINTS = [
  "Reads your discharge summary, prescriptions and care sheets",
  "Shows the exact source text behind every item",
  "Flags missing, unclear and conflicting instructions",
  "You review everything — nothing is treated as confirmed until you check it",
];

export function AuthLayout({ children }: { children: ReactNode }) {
  return (
    <div className="grid min-h-dvh lg:grid-cols-[1fr_1.1fr]">
      <aside className="hidden flex-col justify-between bg-navy-deep p-10 text-white lg:flex">
        <Logo inverted />
        <div>
          <p className="font-heading text-3xl leading-tight font-bold">Leave hospital with a plan you understand.</p>
          <ul className="mt-8 space-y-4">
            {POINTS.map((p) => (
              <li key={p} className="flex gap-3 text-white/85">
                <CheckCircle2 className="mt-0.5 size-5 shrink-0 text-sidebar-primary" aria-hidden />
                {p}
              </li>
            ))}
          </ul>
        </div>
        <p className="text-xs text-white/60">An educational tool. It does not diagnose, prescribe or replace your care team.</p>
      </aside>
      <main className="flex flex-col px-4 py-6 sm:px-8">
        <div className="lg:hidden">
          <Logo />
        </div>
        <div className="flex flex-1 items-center justify-center py-10">
          {children}
        </div>
        <LegalLinks className="justify-center text-muted-foreground" />
      </main>
    </div>
  );
}
