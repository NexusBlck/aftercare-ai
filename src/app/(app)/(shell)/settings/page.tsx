"use client";

import { FlaskConical, LogOut, ShieldCheck, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";
import { useSignOut } from "@/components/app/app-shell";
import { PageHeader } from "@/components/app/plan-gate";
import { DataAndAgreements } from "@/components/legal/data-and-agreements";
import { ExportButton } from "@/components/recovery/export-button";
import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { usePlan } from "@/hooks/use-plan";
import { LocalBackend } from "@/lib/client/backends";
import { exitDemo } from "@/lib/client/demo";
import { ClientError } from "@/lib/client/http";
import { cn } from "@/lib/utils";
import type { Language } from "@/schemas/domain";

function Card({ title, description, children }: { title: string; description?: string; children: React.ReactNode }) {
  return (
    <section className="rounded-2xl border bg-card p-5 sm:p-6" aria-label={title}>
      <h2 className="text-lg font-bold">{title}</h2>
      {description && <p className="mt-1 text-sm text-muted-foreground">{description}</p>}
      <div className="mt-4">{children}</div>
    </section>
  );
}

export default function SettingsPage() {
  const router = useRouter();
  const { backend, mode, profile, setProfile, email, bundle, mutate, setBundle, server } = usePlan();
  const signOut = useSignOut();
  const [name, setName] = useState(profile.display_name ?? "");
  const [title, setTitle] = useState(bundle?.plan.title ?? "");
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [confirmSample, setConfirmSample] = useState(false);

  const saveProfile = async (language: Language = profile.preferred_language) => {
    try {
      const next = { display_name: name.trim() || null, preferred_language: language };
      await backend.saveProfile(next);
      setProfile({ ...next, onboarded: true });
      toast.success("Preferences saved");
    } catch (err) {
      toast.error(err instanceof ClientError ? err.message : "We could not save your preferences.");
    }
  };

  const deleteEverything = async () => {
    try {
      const res = await backend.deleteAllData();
      setBundle(null);
      if (mode === "demo") {
        exitDemo();
      } else {
        toast.success(res.accountDeleted ? "Your account and all data were deleted." : "All your documents and plan data were deleted.");
        router.replace("/?deleted=1");
      }
    } catch (err) {
      toast.error(err instanceof ClientError ? err.message : "Deletion failed. Nothing was changed.");
    }
  };

  return (
    <>
      <PageHeader title="Settings" description="Your profile, language and privacy controls." />
      <div className="grid gap-6 lg:grid-cols-2">
        <Card title="Profile" description={mode === "demo" ? "Demo profile — stored only in this browser." : (email ?? undefined)}>
          <form
            className="grid gap-3"
            onSubmit={(e) => {
              e.preventDefault();
              void saveProfile();
            }}
          >
            <Label htmlFor="settings-name">Display name (optional)</Label>
            <div className="flex gap-2">
              <Input id="settings-name" value={name} onChange={(e) => setName(e.target.value)} maxLength={80} />
              <Button type="submit">Save</Button>
            </div>
          </form>
        </Card>

        <Card title="Explanation language" description="Original document wording is always shown. Translations are AI-generated and not medically certified.">
          <div className="grid grid-cols-2 gap-3" role="radiogroup" aria-label="Explanation language">
            {(
              [
                ["en", "English"],
                ["ur", "اردو · Urdu"],
              ] as const
            ).map(([value, label]) => (
              <button
                key={value}
                type="button"
                role="radio"
                aria-checked={profile.preferred_language === value}
                onClick={() => void saveProfile(value)}
                className={cn(
                  "h-12 rounded-xl border font-semibold transition-colors",
                  profile.preferred_language === value ? "border-teal bg-teal-soft text-teal" : "hover:bg-muted",
                )}
              >
                {label}
              </button>
            ))}
          </div>
        </Card>

        {bundle && (
          <Card title="Recovery plan">
            <form
              className="grid gap-3"
              onSubmit={(e) => {
                e.preventDefault();
                if (title.trim()) void mutate((b, current) => b.renamePlan(current, title.trim()), { success: "Plan renamed" });
              }}
            >
              <Label htmlFor="plan-title">Plan title</Label>
              <div className="flex gap-2">
                <Input id="plan-title" value={title} onChange={(e) => setTitle(e.target.value)} maxLength={120} />
                <Button type="submit">Rename</Button>
              </div>
            </form>
            <div className="mt-4">
              <ExportButton />
            </div>
          </Card>
        )}

        <Card title="Privacy & data">
          <ul className="space-y-2 text-sm text-muted-foreground">
            <li className="flex gap-2">
              <ShieldCheck className="mt-0.5 size-4 shrink-0 text-teal" aria-hidden />
              {mode === "demo"
                ? "Demo data stays in this browser. Documents you process are sent to the AI service once and are not stored on our server."
                : "Your documents are stored in private storage that only your account can access. Database rules prevent other accounts from reading your records."}
            </li>
            <li className="flex gap-2">
              <ShieldCheck className="mt-0.5 size-4 shrink-0 text-teal" aria-hidden />
              We do not use analytics on your health information, and document contents are never written to server logs.
            </li>
            {server && (
              <li className="flex gap-2">
                <ShieldCheck className="mt-0.5 size-4 shrink-0 text-teal" aria-hidden />
                AI processing:{" "}
                {server.ai === "gemini"
                  ? `Google Gemini (${server.model})`
                  : server.ai === "freellmapi"
                    ? "free-tier AI models chosen per request by FreeLLMAPI (see the Privacy policy)"
                    : server.ai === "free"
                      ? "free tiers of Groq, Google AI Studio and OpenRouter, in a fallback order (see the Privacy policy)"
                    : server.ai === "mock"
                      ? "deterministic test extractor (not AI)"
                      : "not configured"}
                .
              </li>
            )}
          </ul>
          <div className="mt-5 flex flex-wrap gap-2">
            {mode === "demo" && (
              <Button variant="outline" onClick={() => setConfirmSample(true)}>
                <FlaskConical aria-hidden /> Reset sample plan
              </Button>
            )}
            <Button variant="outline" onClick={signOut}>
              <LogOut aria-hidden /> {mode === "demo" ? "Exit demo" : "Sign out"}
            </Button>
            <Button variant="ghost" className="text-danger hover:bg-danger-soft hover:text-danger" onClick={() => setConfirmDelete(true)}>
              <Trash2 aria-hidden /> {mode === "demo" ? "Delete demo data" : "Delete all my data"}
            </Button>
          </div>
        </Card>
        <DataAndAgreements />
      </div>

      <ConfirmDialog
        open={confirmDelete}
        onOpenChange={setConfirmDelete}
        title={mode === "demo" ? "Delete demo data?" : "Delete all your data?"}
        description={
          mode === "demo"
            ? "This removes the demo plan and any files stored in this browser."
            : "This permanently deletes every uploaded document, your recovery plan, your corrections and your profile. This cannot be undone."
        }
        confirmLabel="Delete permanently"
        destructive
        onConfirm={() => void deleteEverything()}
      />
      <ConfirmDialog
        open={confirmSample}
        onOpenChange={setConfirmSample}
        title="Reset the sample plan?"
        description="Your demo changes (confirmations, corrections, ticked tasks and uploads) will be replaced with a fresh copy of the sample plan."
        confirmLabel="Reset"
        onConfirm={async () => {
          const next = await (backend as LocalBackend).loadSample();
          setBundle(next);
          setTitle(next.plan.title);
          toast.success("Sample plan reset");
        }}
      />
    </>
  );
}
