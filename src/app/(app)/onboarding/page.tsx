"use client";

import { ArrowRight, FileUp, FlaskConical } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";
import { Logo } from "@/components/shared/logo";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { usePlan } from "@/hooks/use-plan";
import { LocalBackend } from "@/lib/client/backends";
import { ClientError } from "@/lib/client/http";
import { cn } from "@/lib/utils";
import type { Language } from "@/schemas/domain";

export default function OnboardingPage() {
  const router = useRouter();
  const { backend, mode, profile, bundle, status, setBundle, setProfile, server } = usePlan();
  const [name, setName] = useState(profile.display_name ?? "");
  const [language, setLanguage] = useState<Language>(profile.preferred_language);
  const [title, setTitle] = useState("");
  const [start, setStart] = useState<"sample" | "empty">("sample");
  const [saving, setSaving] = useState(false);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setSaving(true);
    try {
      const nextProfile = { display_name: name.trim() || null, preferred_language: language };
      await backend.saveProfile(nextProfile);
      setProfile({ ...nextProfile, onboarded: true });

      if (mode === "demo") {
        const local = backend as LocalBackend;
        const next = start === "sample" ? await local.loadSample() : await local.createPlan(title || undefined);
        setBundle(next);
        router.push(start === "sample" ? "/dashboard" : "/documents");
      } else if (bundle) {
        router.push("/dashboard");
      } else {
        setBundle(await backend.createPlan(title || undefined));
        router.push("/documents");
      }
    } catch (err) {
      toast.error(err instanceof ClientError ? err.message : "We could not save your details. Please try again.");
      setSaving(false);
    }
  };

  return (
    <div className="min-h-dvh bg-background">
      <header className="mx-auto flex max-w-2xl items-center px-4 py-6">
        <Logo href="/" />
      </header>
      <main className="mx-auto max-w-2xl px-4 pb-16">
        <div className="rounded-2xl border bg-card p-6 shadow-sm sm:p-8">
          <p className="text-sm font-semibold text-teal">Getting started</p>
          <h1 className="mt-1 text-2xl font-extrabold sm:text-3xl">Let’s set up your recovery plan</h1>
          <p className="mt-2 text-muted-foreground">
            We only ask for what we need. Everything here is optional except your language choice.
          </p>

          <form onSubmit={submit} className="mt-8 grid gap-6">
            <div className="grid gap-2">
              <Label htmlFor="display-name">What should we call you? (optional)</Label>
              <Input id="display-name" value={name} onChange={(e) => setName(e.target.value)} maxLength={80} autoComplete="given-name" placeholder="First name or nickname" />
            </div>

            <fieldset className="grid gap-2">
              <legend className="mb-2 text-sm font-medium">Language for plain-language explanations</legend>
              <div className="grid grid-cols-2 gap-3">
                {(
                  [
                    ["en", "English", "Explanations in English"],
                    ["ur", "اردو · Urdu", "Explanations in Urdu where available"],
                  ] as const
                ).map(([value, label, hint]) => (
                  <label
                    key={value}
                    className={cn(
                      "flex cursor-pointer flex-col rounded-xl border p-4 transition-colors has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-ring",
                      language === value ? "border-teal bg-teal-soft/60" : "hover:bg-muted/60",
                    )}
                  >
                    <input type="radio" name="language" value={value} checked={language === value} onChange={() => setLanguage(value)} className="sr-only" />
                    <span className="font-semibold">{label}</span>
                    <span className="mt-1 text-xs text-muted-foreground">{hint}</span>
                  </label>
                ))}
              </div>
              <p className="text-xs text-muted-foreground">Original document wording is always shown too. Translations are not medically certified.</p>
            </fieldset>

            {mode === "demo" && (
              <fieldset className="grid gap-2">
                <legend className="mb-2 text-sm font-medium">How would you like to explore?</legend>
                <div className="grid gap-3 sm:grid-cols-2">
                  <label className={cn("flex cursor-pointer gap-3 rounded-xl border p-4 has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-ring", start === "sample" ? "border-teal bg-teal-soft/60" : "hover:bg-muted/60")}>
                    <input type="radio" name="start" checked={start === "sample"} onChange={() => setStart("sample")} className="sr-only" />
                    <FlaskConical className="mt-0.5 size-5 shrink-0 text-teal" aria-hidden />
                    <span>
                      <span className="block font-semibold">Explore the sample plan</span>
                      <span className="mt-1 block text-xs text-muted-foreground">Precomputed from three synthetic documents for a fictional patient. Labelled as sample data.</span>
                    </span>
                  </label>
                  <label className={cn("flex cursor-pointer gap-3 rounded-xl border p-4 has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-ring", start === "empty" ? "border-teal bg-teal-soft/60" : "hover:bg-muted/60")}>
                    <input type="radio" name="start" checked={start === "empty"} onChange={() => setStart("empty")} className="sr-only" />
                    <FileUp className="mt-0.5 size-5 shrink-0 text-teal" aria-hidden />
                    <span>
                      <span className="block font-semibold">Upload synthetic documents</span>
                      <span className="mt-1 block text-xs text-muted-foreground">
                        {server?.ai === "unconfigured"
                          ? "Live AI processing is not configured on this server, so uploads cannot be processed."
                          : "Runs live AI extraction. Use only synthetic or sample documents in demo mode."}
                      </span>
                    </span>
                  </label>
                </div>
              </fieldset>
            )}

            {(mode === "account" || start === "empty") && !bundle && (
              <div className="grid gap-2">
                <Label htmlFor="plan-title">Name your recovery plan (optional)</Label>
                <Input id="plan-title" value={title} onChange={(e) => setTitle(e.target.value)} maxLength={120} placeholder="e.g. Recovery after knee surgery" />
              </div>
            )}

            <Button type="submit" size="lg" disabled={saving || status === "loading"} className="justify-self-start">
              {saving
                ? "Setting up…"
                : mode === "demo" && start === "sample"
                  ? "Open the sample plan"
                  : mode === "account" && bundle
                    ? "Save and continue"
                    : "Continue to upload documents"}
              <ArrowRight aria-hidden />
            </Button>
          </form>
        </div>
        <p className="mt-6 text-center text-xs text-muted-foreground">
          AFTERCARE AI organizes the instructions your care team gave you. It does not diagnose, prescribe, or replace your clinician.
        </p>
      </main>
    </div>
  );
}
