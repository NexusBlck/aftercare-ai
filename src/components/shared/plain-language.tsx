"use client";

import { Languages } from "lucide-react";
import { usePlan } from "@/hooks/use-plan";
import type { PlainLanguage } from "@/schemas/domain";

/**
 * The simplified explanation, always shown as a separate, labelled layer beneath the original
 * documented wording — never in place of it.
 */
export function PlainLanguageNote({ value }: { value: PlainLanguage | null }) {
  const { language } = usePlan();
  if (!value) return null;
  if (value.status === "rejected") {
    return (
      <p className="mt-3 rounded-md bg-muted px-3 py-2 text-xs text-muted-foreground">
        A simplified version was withheld because it did not keep every number from the original. Rely on the documented wording above.
      </p>
    );
  }
  if (value.status === "unavailable" || !value.en) return null;
  const showUrdu = language === "ur" && value.ur;
  const source = value.status === "sample" ? "Sample explanation" : "AI-simplified";

  return (
    <div className="mt-3 rounded-lg border border-teal/20 bg-teal-soft/50 px-3 py-2.5">
      <p className="mb-1 flex items-center gap-1.5 text-[0.7rem] font-semibold tracking-wide text-teal uppercase">
        <Languages className="size-3.5" aria-hidden />
        In plain language · {source}
        {showUrdu ? " · Urdu translation (not medically certified)" : ""}
      </p>
      {showUrdu ? (
        <p lang="ur" dir="rtl" className="urdu text-[0.95rem] text-foreground">
          {value.ur}
        </p>
      ) : (
        <p className="text-sm leading-relaxed text-foreground">{value.en}</p>
      )}
      {language === "ur" && !value.ur && (
        <p className="mt-1 text-xs text-muted-foreground">An Urdu version was not available or did not pass our number check.</p>
      )}
    </div>
  );
}
