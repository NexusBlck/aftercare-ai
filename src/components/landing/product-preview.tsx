import { CheckCircle2, Clock3, FileSearch, GitCompareArrows, Pill, Quote } from "lucide-react";

/** Static illustration of the review experience, built from synthetic data. */
export function ProductPreview() {
  return (
    <figure className="relative mx-auto w-full max-w-md" aria-label="Illustration of the AFTERCARE AI review screen using synthetic data">
      <div className="absolute -inset-4 -z-10 rounded-[2rem] bg-gradient-to-br from-teal-soft via-transparent to-amber-soft/60 blur-2xl" aria-hidden />
      <div className="rounded-2xl border bg-card p-5 shadow-[0_24px_60px_-24px_rgba(15,23,42,0.35)]">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-start gap-3">
            <span className="grid size-9 place-items-center rounded-lg bg-secondary text-primary">
              <Pill className="size-4.5" aria-hidden />
            </span>
            <div>
              <p className="font-bold">
                Ibuprofen <span className="text-muted-foreground">400 mg</span>
              </p>
              <p className="text-xs text-muted-foreground">From: discharge summary, page 1</p>
            </div>
          </div>
          <span className="inline-flex h-6 items-center gap-1 rounded-md border border-teal/25 bg-teal-soft px-2 text-xs font-semibold text-teal">
            <CheckCircle2 className="size-3.5" aria-hidden /> Confirmed by you
          </span>
        </div>
        <dl className="mt-4 grid grid-cols-3 gap-3 text-sm">
          {[
            ["Dose", "1 tablet"],
            ["Frequency", "Three times a day"],
            ["Duration", "3 days"],
          ].map(([k, v]) => (
            <div key={k}>
              <dt className="text-[0.65rem] font-medium tracking-wide text-muted-foreground uppercase">{k}</dt>
              <dd className="font-medium">{v}</dd>
            </div>
          ))}
        </dl>
        <div className="mt-4 rounded-lg border-l-4 border-teal bg-teal-soft/60 p-3 text-xs">
          <Quote className="mb-1 size-3.5 text-teal" aria-hidden />
          “Ibuprofen 400 mg tablets: take 1 tablet by mouth three times a day after food for 3 days.”
        </div>
      </div>

      <div className="mt-4 ml-6 rounded-2xl border border-danger/25 bg-card p-4 shadow-[0_16px_40px_-24px_rgba(15,23,42,0.35)] sm:ml-10">
        <p className="flex items-center gap-1.5 text-xs font-semibold tracking-wide text-danger uppercase">
          <GitCompareArrows className="size-4" aria-hidden /> Conflict · medication schedule
        </p>
        <p className="mt-1.5 text-sm">
          Amoxicillin-clavulanate appears twice with a different frequency. Ask your pharmacist which instruction is correct.
        </p>
      </div>

      <div className="mt-4 mr-8 rounded-2xl border bg-card p-4 shadow-[0_16px_40px_-24px_rgba(15,23,42,0.35)]">
        <div className="flex items-center justify-between gap-2">
          <p className="text-sm font-semibold">Apply a new dry dressing as instructed by your nurse.</p>
          <span className="inline-flex h-6 shrink-0 items-center gap-1 rounded-md border border-amber/25 bg-amber-soft px-2 text-xs font-semibold text-amber">
            <Clock3 className="size-3.5" aria-hidden /> Review
          </span>
        </div>
        <p className="mt-1 flex items-center gap-1 text-xs text-muted-foreground">
          <FileSearch className="size-3.5" aria-hidden /> No frequency documented — added to your questions
        </p>
      </div>
      <figcaption className="mt-3 text-center text-xs text-muted-foreground">Illustration · synthetic data for a fictional patient</figcaption>
    </figure>
  );
}
