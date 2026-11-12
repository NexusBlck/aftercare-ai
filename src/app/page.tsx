import {
  ArrowRight,
  CalendarDays,
  Check,
  ClipboardCheck,
  FileDown,
  FileSearch,
  FileUp,
  FlaskConical,
  GitCompareArrows,
  Languages,
  ListChecks,
  Lock,
  Pill,
  ShieldCheck,
  X,
} from "lucide-react";
import Link from "next/link";
import { DemoCleanup } from "@/components/landing/demo-cleanup";
import { ProductPreview } from "@/components/landing/product-preview";
import { Logo } from "@/components/shared/logo";
import { Button } from "@/components/ui/button";

const STEPS = [
  {
    icon: FileUp,
    title: "Upload your documents",
    body: "Add the discharge summary, prescriptions, wound-care sheet and follow-up letters you were given — as PDFs or photos.",
  },
  {
    icon: ClipboardCheck,
    title: "Check what was found",
    body: "AI reads each document and lists medications, instructions, dates and warning signs, each linked to the exact text it came from. You confirm or correct every item.",
  },
  {
    icon: ListChecks,
    title: "Follow your plan",
    body: "Get a daily checklist, a medication list, a follow-up tracker, plain-language explanations and questions to ask your care team.",
  },
];

const FEATURES = [
  { icon: FileSearch, title: "Every item shows its source", body: "Tap any medication or instruction to see the exact sentence and page it came from." },
  { icon: GitCompareArrows, title: "Gaps and conflicts flagged", body: "Missing durations, unclear handwriting and documents that disagree are highlighted — never silently resolved." },
  { icon: Pill, title: "Medication organizer", body: "Dose, route, frequency and duration as written. No invented dose times, no suggested changes." },
  { icon: Languages, title: "Plain language, English & Urdu", body: "Medical terms explained simply, with every number preserved. Original wording always stays visible." },
  { icon: CalendarDays, title: "Follow-up tracker", body: "Appointments and tests from your documents, with undated ones called out so you can ask." },
  { icon: FileDown, title: "Printable summary", body: "Download a PDF that separates what you confirmed from what still needs your care team." },
];

const DOES = [
  "Organizes instructions your care team already wrote",
  "Explains medical wording in plain language",
  "Shows where every piece of information came from",
  "Highlights missing, unclear and conflicting information",
  "Helps you prepare questions for your clinician",
];

const DOES_NOT = [
  "Diagnose, prescribe or change any treatment",
  "Invent doses, schedules or recovery timelines",
  "Decide between conflicting instructions",
  "Replace your doctor, nurse or pharmacist",
  "Respond to emergencies — call your local emergency number",
];

export default function LandingPage() {
  return (
    <div className="flex min-h-dvh flex-col">
      <DemoCleanup />
      <a href="#main-content" className="sr-only focus:not-sr-only focus:absolute focus:top-2 focus:left-2 focus:z-50 focus:rounded-md focus:bg-card focus:px-3 focus:py-2">
        Skip to content
      </a>
      <header className="sticky top-0 z-40 border-b border-transparent bg-background/90 backdrop-blur">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between gap-4 px-4 sm:px-6">
          <Logo />
          <nav aria-label="Primary" className="hidden items-center gap-7 text-sm font-medium text-muted-foreground md:flex">
            <a href="#how-it-works" className="hover:text-foreground">
              How it works
            </a>
            <a href="#features" className="hover:text-foreground">
              Features
            </a>
            <a href="#safety" className="hover:text-foreground">
              Safety
            </a>
            <a href="#privacy" className="hover:text-foreground">
              Privacy
            </a>
          </nav>
          <div className="flex items-center gap-2">
            <Button asChild variant="ghost" className="hidden sm:inline-flex">
              <Link href="/login">Sign in</Link>
            </Button>
            <Button asChild>
              <Link href="/signup">Get started</Link>
            </Button>
          </div>
        </div>
      </header>

      <main id="main-content" className="flex-1">
        {/* Hero */}
        <section className="mx-auto grid max-w-6xl items-center gap-12 px-4 pt-12 pb-20 sm:px-6 lg:grid-cols-[1.1fr_1fr] lg:pt-20 lg:pb-28">
          <div>
            <p className="inline-flex items-center gap-2 rounded-full border bg-card px-3 py-1 text-xs font-semibold text-teal">
              <span className="size-1.5 rounded-full bg-teal" aria-hidden /> For patients going home after surgery
            </p>
            <h1 className="mt-5 text-4xl leading-[1.08] font-extrabold text-foreground sm:text-5xl lg:text-[3.4rem]">
              Your discharge papers, turned into a recovery plan you can follow.
            </h1>
            <p className="mt-5 max-w-xl text-lg leading-relaxed text-muted-foreground">
              AFTERCARE AI reads the documents your care team gave you and organizes them into a clear, reviewable plan — medications, wound care, activity, follow-ups and warning signs. It explains your instructions; it never replaces them.
            </p>
            <div className="mt-8 flex flex-col gap-3 sm:flex-row">
              <Button asChild size="lg">
                <Link href="/signup">
                  Get started <ArrowRight aria-hidden />
                </Link>
              </Button>
              <Button asChild size="lg" variant="outline">
                <a href="/demo">
                  <FlaskConical aria-hidden /> Try the demo
                </a>
              </Button>
              <Button asChild size="lg" variant="ghost" className="sm:hidden">
                <Link href="/login">Sign in</Link>
              </Button>
            </div>
            <p className="mt-4 text-sm text-muted-foreground">The demo uses synthetic documents for a fictional patient — no sign-up needed.</p>
          </div>
          <ProductPreview />
        </section>

        {/* Problem */}
        <section className="border-y bg-card">
          <div className="mx-auto grid max-w-6xl gap-8 px-4 py-14 sm:px-6 md:grid-cols-3">
            {[
              ["Too many papers", "A discharge summary, a prescription, a wound-care sheet, a follow-up letter — each with different parts of your instructions."],
              ["Hard-to-read language", "Abbreviations like BD, PO and PRN, and medical terms that are easy to misunderstand when you are tired and sore."],
              ["Easy-to-miss gaps", "A medicine without a duration or two documents that disagree are hard to spot — and important to ask about."],
            ].map(([title, body]) => (
              <div key={title}>
                <h2 className="text-lg font-bold">{title}</h2>
                <p className="mt-2 text-muted-foreground">{body}</p>
              </div>
            ))}
          </div>
        </section>

        {/* How it works */}
        <section id="how-it-works" className="mx-auto max-w-6xl scroll-mt-20 px-4 py-20 sm:px-6">
          <p className="text-sm font-semibold text-teal">How it works</p>
          <h2 className="mt-2 max-w-2xl text-3xl font-extrabold sm:text-4xl">Three steps from a stack of papers to a plan</h2>
          <ol className="mt-10 grid gap-6 md:grid-cols-3">
            {STEPS.map((step, i) => (
              <li key={step.title} className="rounded-2xl border bg-card p-6">
                <div className="flex items-center gap-3">
                  <span className="grid size-10 place-items-center rounded-xl bg-navy-deep text-white">
                    <step.icon className="size-5" aria-hidden />
                  </span>
                  <span className="text-sm font-semibold text-muted-foreground">Step {i + 1}</span>
                </div>
                <h3 className="mt-5 text-xl font-bold">{step.title}</h3>
                <p className="mt-2 leading-relaxed text-muted-foreground">{step.body}</p>
              </li>
            ))}
          </ol>
        </section>

        {/* Features */}
        <section id="features" className="scroll-mt-20 bg-navy-deep text-white">
          <div className="mx-auto max-w-6xl px-4 py-20 sm:px-6">
            <p className="text-sm font-semibold text-sidebar-primary">What you get</p>
            <h2 className="mt-2 max-w-2xl text-3xl font-extrabold sm:text-4xl">Built for understanding, not guessing</h2>
            <div className="mt-10 grid gap-px overflow-hidden rounded-2xl border border-white/10 bg-white/10 sm:grid-cols-2 lg:grid-cols-3">
              {FEATURES.map((f) => (
                <div key={f.title} className="bg-navy-deep p-6">
                  <f.icon className="size-6 text-sidebar-primary" aria-hidden />
                  <h3 className="mt-4 text-lg font-bold">{f.title}</h3>
                  <p className="mt-2 text-sm leading-relaxed text-white/75">{f.body}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* Benefits */}
        <section className="mx-auto max-w-6xl px-4 py-20 sm:px-6">
          <div className="grid gap-10 lg:grid-cols-2 lg:items-center">
            <div>
              <p className="text-sm font-semibold text-teal">For you and the people helping you</p>
              <h2 className="mt-2 text-3xl font-extrabold sm:text-4xl">Know what to do today — and what to ask</h2>
              <p className="mt-4 text-lg text-muted-foreground">
                Instead of searching through papers, open one place that shows today’s instructions, your medicines as prescribed, your next appointment and the warning signs your team asked you to watch for.
              </p>
            </div>
            <ul className="grid gap-3 sm:grid-cols-2">
              {[
                "A daily checklist from your documented instructions",
                "Your medication list with every detail as written",
                "Warning signs in one clearly marked place",
                "Questions for your care team, ready to copy",
                "A summary to share with family or carers",
                "Works on your phone, tablet or computer",
              ].map((b) => (
                <li key={b} className="flex gap-3 rounded-xl border bg-card p-4 text-sm font-medium">
                  <Check className="mt-0.5 size-4 shrink-0 text-teal" aria-hidden />
                  {b}
                </li>
              ))}
            </ul>
          </div>
        </section>

        {/* Safety */}
        <section id="safety" className="scroll-mt-20 border-y bg-card">
          <div className="mx-auto max-w-6xl px-4 py-20 sm:px-6">
            <p className="text-sm font-semibold text-teal">Safety first</p>
            <h2 className="mt-2 max-w-3xl text-3xl font-extrabold sm:text-4xl">An organizer for your instructions — not a source of new ones</h2>
            <p className="mt-4 max-w-3xl text-muted-foreground">
              AFTERCARE AI is an educational prototype. It has not been clinically validated and is not a medical device. Anything it extracts is marked “needs review” until you check it, and your confirmation is never treated as a clinician’s approval.
            </p>
            <div className="mt-10 grid gap-6 md:grid-cols-2">
              <div className="rounded-2xl border border-teal/25 bg-teal-soft/50 p-6">
                <h3 className="text-lg font-bold text-teal">AFTERCARE AI does</h3>
                <ul className="mt-4 space-y-3">
                  {DOES.map((d) => (
                    <li key={d} className="flex gap-3">
                      <Check className="mt-0.5 size-5 shrink-0 text-teal" aria-hidden />
                      {d}
                    </li>
                  ))}
                </ul>
              </div>
              <div className="rounded-2xl border border-danger/20 bg-danger-soft/50 p-6">
                <h3 className="text-lg font-bold text-danger">AFTERCARE AI does not</h3>
                <ul className="mt-4 space-y-3">
                  {DOES_NOT.map((d) => (
                    <li key={d} className="flex gap-3">
                      <X className="mt-0.5 size-5 shrink-0 text-danger" aria-hidden />
                      {d}
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          </div>
        </section>

        {/* Privacy */}
        <section id="privacy" className="mx-auto max-w-6xl scroll-mt-20 px-4 py-20 sm:px-6">
          <div className="grid gap-10 lg:grid-cols-[1fr_1.2fr]">
            <div>
              <p className="text-sm font-semibold text-teal">Privacy</p>
              <h2 className="mt-2 text-3xl font-extrabold sm:text-4xl">Your documents are yours</h2>
            </div>
            <ul className="grid gap-4 sm:grid-cols-2">
              {[
                [Lock, "Private storage", "Uploaded files are kept in private storage that only your account can open."],
                [ShieldCheck, "Strict access rules", "Database rules stop any other account from reading your records."],
                [FileSearch, "Minimal information", "We ask only for a display name and language. No date of birth, no ID numbers."],
                [X, "Delete anytime", "Remove a single document or erase everything with one action in Settings."],
              ].map(([Icon, title, body]) => {
                const I = Icon as typeof Lock;
                return (
                  <li key={title as string} className="rounded-2xl border bg-card p-5">
                    <I className="size-5 text-teal" aria-hidden />
                    <h3 className="mt-3 font-bold">{title as string}</h3>
                    <p className="mt-1 text-sm text-muted-foreground">{body as string}</p>
                  </li>
                );
              })}
            </ul>
          </div>
        </section>

        {/* CTA */}
        <section className="px-4 pb-20 sm:px-6">
          <div className="mx-auto max-w-6xl rounded-3xl bg-navy-deep px-6 py-14 text-center text-white sm:px-12">
            <h2 className="text-3xl font-extrabold sm:text-4xl">Go home with a plan you understand</h2>
            <p className="mx-auto mt-3 max-w-xl text-white/75">Create a free account to upload your documents, or explore the demo with a fictional patient first.</p>
            <div className="mt-8 flex flex-col justify-center gap-3 sm:flex-row">
              <Button asChild size="lg" className="bg-sidebar-primary text-navy-deep hover:bg-sidebar-primary/90">
                <Link href="/signup">
                  Get started <ArrowRight aria-hidden />
                </Link>
              </Button>
              <Button asChild size="lg" variant="outline" className="border-white/30 bg-transparent text-white hover:bg-white/10 hover:text-white">
                <a href="/demo">Try the demo</a>
              </Button>
            </div>
          </div>
        </section>
      </main>

      <footer className="border-t bg-card">
        <div className="mx-auto flex max-w-6xl flex-col gap-4 px-4 py-8 text-sm text-muted-foreground sm:px-6 md:flex-row md:items-center md:justify-between">
          <Logo />
          <p className="max-w-2xl">
            AFTERCARE AI is an educational prototype that organizes documents you provide. It is not medical advice, has no regulatory approval, and is not for emergencies. Always follow your healthcare team’s instructions.
          </p>
        </div>
      </footer>
    </div>
  );
}
