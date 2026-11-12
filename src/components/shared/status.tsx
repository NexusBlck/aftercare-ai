import { AlertTriangle, CheckCircle2, CircleHelp, Clock3, GitCompareArrows } from "lucide-react";
import type { ReactNode } from "react";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import type { VerificationStatus } from "@/schemas/domain";

export const STATUS_META: Record<VerificationStatus, { label: string; hint: string; className: string; icon: ReactNode }> = {
  needs_review: {
    label: "Needs your review",
    hint: "Check this against your original document, then confirm it or ask your clinician.",
    className: "bg-amber-soft text-amber border-amber/25",
    icon: <Clock3 className="size-3.5" aria-hidden />,
  },
  confirmed_by_patient: {
    label: "Confirmed by you",
    hint: "You confirmed this matches your document. This is not a clinician's verification.",
    className: "bg-teal-soft text-teal border-teal/25",
    icon: <CheckCircle2 className="size-3.5" aria-hidden />,
  },
  needs_clinician_clarification: {
    label: "Ask your clinician",
    hint: "You marked this for clarification by your care team.",
    className: "bg-secondary text-primary border-primary/20",
    icon: <CircleHelp className="size-3.5" aria-hidden />,
  },
  conflicting: {
    label: "Conflicting",
    hint: "Another document says something different. Do not choose yourself — ask your care team.",
    className: "bg-danger-soft text-danger border-danger/25",
    icon: <GitCompareArrows className="size-3.5" aria-hidden />,
  },
};

export function StatusBadge({ status, className }: { status: VerificationStatus; className?: string }) {
  const meta = STATUS_META[status];
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span
          tabIndex={0}
          className={cn(
            "inline-flex h-6 shrink-0 items-center gap-1 rounded-md border px-2 text-xs font-semibold whitespace-nowrap",
            meta.className,
            className,
          )}
          data-status={status}
        >
          {meta.icon}
          {meta.label}
        </span>
      </TooltipTrigger>
      <TooltipContent className="max-w-64">{meta.hint}</TooltipContent>
    </Tooltip>
  );
}

export function UncertainBadge({ note }: { note: string | null }) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span
          tabIndex={0}
          className="inline-flex h-6 items-center gap-1 rounded-md border border-amber/25 bg-amber-soft px-2 text-xs font-semibold text-amber"
        >
          <AlertTriangle className="size-3.5" aria-hidden />
          Uncertain
        </span>
      </TooltipTrigger>
      <TooltipContent className="max-w-64">{note ?? "The AI was unsure about this item. Check the original document."}</TooltipContent>
    </Tooltip>
  );
}

export function EditedBadge() {
  return (
    <span className="inline-flex h-6 items-center rounded-md border border-border bg-muted px-2 text-xs font-medium text-muted-foreground">
      Edited by you
    </span>
  );
}

/** A labelled value that renders missing information explicitly instead of hiding it. */
export function Field({ label, value, className }: { label: string; value: ReactNode | null | undefined; className?: string }) {
  const missing = value === null || value === undefined || value === "";
  return (
    <div className={cn("min-w-0", className)}>
      <dt className="text-xs font-medium tracking-wide text-muted-foreground uppercase">{label}</dt>
      <dd className={cn("mt-0.5 text-sm break-words", missing ? "text-muted-foreground italic" : "font-medium text-foreground")}>
        {missing ? "Not stated in your documents" : value}
      </dd>
    </div>
  );
}
