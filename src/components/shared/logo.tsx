import Link from "next/link";
import { cn } from "@/lib/utils";

export function LogoMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 32" aria-hidden="true" className={cn("size-8", className)}>
      <rect width="32" height="32" rx="8" fill="var(--navy-deep)" />
      <path d="M9 17.5 13.5 22 23 11" fill="none" stroke="var(--sidebar-primary)" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx="23" cy="11" r="2.2" fill="var(--sidebar-primary)" />
    </svg>
  );
}

export function Logo({ className, inverted = false, href = "/" }: { className?: string; inverted?: boolean; href?: string }) {
  return (
    <Link href={href} className={cn("inline-flex items-center gap-2.5 rounded-md", className)} aria-label="AFTERCARE AI home">
      <LogoMark />
      <span className={cn("font-heading text-[1.05rem] font-extrabold tracking-tight", inverted ? "text-white" : "text-foreground")}>
        AFTERCARE<span className={inverted ? "text-sidebar-primary" : "text-teal"}> AI</span>
      </span>
    </Link>
  );
}
