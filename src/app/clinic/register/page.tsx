"use client";

import { Building2, CheckCircle2, Loader2 } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { z } from "zod";
import { Field, NativeSelect } from "@/components/clinic/ui";
import { LegalLinks } from "@/components/legal/site-footer";
import { Logo } from "@/components/shared/logo";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { apiFetch, ClientError } from "@/lib/client/http";
import { CreateOrganizationSchema } from "@/schemas/clinic";
import { PasswordSchema, EmailSchema } from "@/schemas/auth";

type Step = "loading" | "account" | "confirm-email" | "clinic" | "member";

const POINTS = [
  "Upload discharge documents into private, clinic-only storage",
  "AI organizes documented instructions; it never fills gaps",
  "Clinicians review, correct and approve every plan",
  "Patients see only the version a clinician approved",
];

export default function ClinicRegisterPage() {
  const router = useRouter();
  const [step, setStep] = useState<Step>("loading");
  const [memberOf, setMemberOf] = useState<string | null>(null);

  useEffect(() => {
    apiFetch<{ active: { organization: { name: string } } | null }>("/api/clinic/me")
      .then((me) => {
        if (me.active) {
          setMemberOf(me.active.organization.name);
          setStep("member");
        } else setStep("clinic");
      })
      .catch(() => setStep("account"));
  }, []);

  return (
    <div className="grid min-h-dvh lg:grid-cols-[1fr_1.15fr]">
      <aside className="hidden flex-col justify-between bg-navy-deep p-10 text-white lg:flex">
        <Logo inverted />
        <div>
          <p className="text-sm font-semibold tracking-wider text-sidebar-primary uppercase">For hospitals and clinics</p>
          <p className="mt-3 font-heading text-3xl leading-tight font-bold">Discharge instructions your patients understand — approved by your clinicians.</p>
          <ul className="mt-8 space-y-4">
            {POINTS.map((p) => (
              <li key={p} className="flex gap-3 text-white/85">
                <CheckCircle2 className="mt-0.5 size-5 shrink-0 text-sidebar-primary" aria-hidden />
                {p}
              </li>
            ))}
          </ul>
        </div>
        <p className="text-xs text-white/60">AFTERCARE AI does not diagnose, prescribe or replace clinical judgement.</p>
      </aside>
      <main className="flex flex-col items-center justify-center px-4 py-10 sm:px-8">
        <div className="mb-8 lg:hidden">
          <Logo />
        </div>
        <div className="w-full max-w-md">
          {step === "loading" && <Loader2 className="mx-auto size-6 animate-spin text-muted-foreground" aria-label="Loading" />}
          {step === "account" && <AccountStep onDone={(needsConfirmation) => setStep(needsConfirmation ? "confirm-email" : "clinic")} />}
          {step === "confirm-email" && (
            <div role="status">
              <h1 className="text-2xl font-extrabold">Confirm your email</h1>
              <p className="mt-2 text-muted-foreground">We sent you a confirmation link. After confirming, return to this page to create your clinic.</p>
            </div>
          )}
          {step === "clinic" && <ClinicStep onDone={() => router.replace("/clinic/dashboard")} />}
          {step === "member" && (
            <div>
              <h1 className="text-2xl font-extrabold">You already belong to {memberOf}</h1>
              <p className="mt-2 text-muted-foreground">Open the clinic portal, or create a separate clinic if you run another practice.</p>
              <div className="mt-6 flex flex-wrap gap-2">
                <Button asChild>
                  <Link href="/clinic/dashboard">Open clinic portal</Link>
                </Button>
                <Button variant="outline" onClick={() => setStep("clinic")}>
                  Create another clinic
                </Button>
              </div>
            </div>
          )}
          <p className="mt-10 text-xs text-muted-foreground">
            Are you a patient? <Link href="/signup" className="underline">Create a patient account</Link> or use the invitation link from your clinic.
          </p>
          <LegalLinks className="mt-3 text-xs" />
        </div>
      </main>
    </div>
  );
}

function AccountStep({ onDone }: { onDone: (needsConfirmation: boolean) => void }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [accepted, setAccepted] = useState(false);
  const [marketing, setMarketing] = useState(false);
  const [errors, setErrors] = useState<Record<string, string | undefined>>({});
  const [busy, setBusy] = useState(false);

  return (
    <form
      noValidate
      onSubmit={async (e) => {
        e.preventDefault();
        const next: Record<string, string | undefined> = {
          email: EmailSchema.safeParse(email).success ? undefined : "Enter a valid email address.",
          password: PasswordSchema.safeParse(password).error?.issues[0]?.message,
          consent: accepted ? undefined : "Please agree to the Terms of Service and Privacy Policy.",
        };
        setErrors(next);
        if (Object.values(next).some(Boolean)) return;
        setBusy(true);
        try {
          const res = await apiFetch<{ needsConfirmation: boolean }>("/api/auth/signup", {
            method: "POST",
            body: JSON.stringify({ email, password, consents: { accepted: true, marketing }, audience: "clinic" }),
          });
          onDone(res.needsConfirmation);
        } catch (err) {
          setErrors({ form: err instanceof ClientError ? err.message : "We could not create the account." });
        } finally {
          setBusy(false);
        }
      }}
      className="grid gap-4"
    >
      <div>
        <p className="text-sm font-semibold text-teal">Step 1 of 2</p>
        <h1 className="mt-1 text-2xl font-extrabold sm:text-3xl">Create your clinic account</h1>
        <p className="mt-2 text-muted-foreground">You will be the clinic owner. You can invite your team afterwards.</p>
      </div>
      <Field label="Work email" htmlFor="reg-email" required error={errors.email}>
        <Input id="reg-email" type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} aria-invalid={!!errors.email} />
      </Field>
      <Field label="Password" htmlFor="reg-password" required error={errors.password} hint="At least 8 characters.">
        <Input id="reg-password" type="password" autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)} aria-invalid={!!errors.password} />
      </Field>
      <label className="flex items-start gap-3 text-sm">
        <Checkbox id="consent-terms" checked={accepted} onCheckedChange={(v) => setAccepted(v === true)} className="mt-0.5" aria-describedby={errors.consent ? "consent-error" : undefined} />
        <span>
          I agree to the <Link href="/terms" className="font-semibold underline">Terms of Service</Link> and <Link href="/privacy" className="font-semibold underline">Privacy Policy</Link>
          <span aria-hidden className="ml-0.5 font-semibold text-danger">*</span>
          <span className="sr-only"> (required)</span>
        </span>
      </label>
      {errors.consent && <p id="consent-error" role="alert" className="text-sm text-danger">{errors.consent}</p>}
      <label className="flex items-start gap-3 text-sm">
        <Checkbox id="consent-marketing" checked={marketing} onCheckedChange={(v) => setMarketing(v === true)} className="mt-0.5" />
        <span>Send me product updates and offers by email</span>
      </label>
      {errors.form && (
        <p role="alert" className="rounded-lg bg-danger-soft px-3 py-2 text-sm text-danger">
          {errors.form}{" "}
          {errors.form.includes("already exists") && (
            <Link href="/login?next=/clinic/register" className="font-semibold underline">
              Sign in instead
            </Link>
          )}
        </p>
      )}
      <Button type="submit" size="lg" disabled={busy}>
        {busy && <Loader2 className="animate-spin" aria-hidden />} Continue
      </Button>
      <p className="text-sm text-muted-foreground">
        Already have an account? <Link href="/login?next=/clinic/register" className="font-semibold text-foreground underline">Sign in</Link>
      </p>
    </form>
  );
}

function ClinicStep({ onDone }: { onDone: () => void }) {
  const [form, setForm] = useState({ name: "", org_type: "clinic", city: "", contact_email: "", contact_phone: "", owner_name: "", owner_is_clinician: false });
  const [errors, setErrors] = useState<Record<string, string | undefined>>({});
  const [busy, setBusy] = useState(false);
  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => setForm({ ...form, [k]: e.target.value });

  return (
    <form
      noValidate
      className="grid gap-4"
      onSubmit={async (e) => {
        e.preventDefault();
        const parsed = CreateOrganizationSchema.safeParse(form);
        if (!parsed.success) {
          const flat = z.flattenError(parsed.error).fieldErrors as Record<string, string[] | undefined>;
          setErrors(Object.fromEntries(Object.entries(flat).map(([k, v]) => [k, v?.[0]])));
          return;
        }
        setErrors({});
        setBusy(true);
        try {
          await apiFetch("/api/clinic/organization", { method: "POST", body: JSON.stringify(parsed.data) });
          onDone();
        } catch (err) {
          setErrors({ form: err instanceof ClientError ? err.message : "We could not create the clinic." });
        } finally {
          setBusy(false);
        }
      }}
    >
      <div>
        <p className="text-sm font-semibold text-teal">Step 2 of 2</p>
        <h1 className="mt-1 flex items-center gap-2 text-2xl font-extrabold sm:text-3xl">
          <Building2 className="size-7 text-primary" aria-hidden /> Your clinic
        </h1>
        <p className="mt-2 text-muted-foreground">New clinics start on a 30-day Starter trial. No payment details are needed.</p>
      </div>
      <Field label="Clinic or hospital name" htmlFor="org-name" required error={errors.name}>
        <Input id="org-name" value={form.name} onChange={set("name")} maxLength={120} />
      </Field>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Type" htmlFor="org-type">
          <NativeSelect id="org-type" value={form.org_type} onChange={set("org_type")}>
            <option value="clinic">Clinic</option>
            <option value="hospital">Hospital</option>
            <option value="practice">Practice</option>
            <option value="other">Other</option>
          </NativeSelect>
        </Field>
        <Field label="City" htmlFor="org-city">
          <Input id="org-city" value={form.city} onChange={set("city")} maxLength={80} />
        </Field>
        <Field label="Contact email" htmlFor="org-email" error={errors.contact_email}>
          <Input id="org-email" type="email" value={form.contact_email} onChange={set("contact_email")} />
        </Field>
        <Field label="Contact phone" htmlFor="org-phone" error={errors.contact_phone}>
          <Input id="org-phone" type="tel" value={form.contact_phone} onChange={set("contact_phone")} />
        </Field>
      </div>
      <Field label="Your name" htmlFor="owner-name" required error={errors.owner_name} hint="Shown to colleagues and on plans you approve.">
        <Input id="owner-name" value={form.owner_name} onChange={set("owner_name")} maxLength={80} placeholder="e.g. Dr Ayesha Khan" />
      </Field>
      <label className="flex items-start gap-3 rounded-lg border p-3 text-sm">
        <Checkbox checked={form.owner_is_clinician} onCheckedChange={(v) => setForm({ ...form, owner_is_clinician: v === true })} className="mt-0.5" />
        <span>
          I am a licensed clinician and will review and approve recovery plans myself.
          <span className="block text-xs text-muted-foreground">Leave unticked if clinicians on your team will approve plans.</span>
        </span>
      </label>
      {errors.form && <p role="alert" className="rounded-lg bg-danger-soft px-3 py-2 text-sm text-danger">{errors.form}</p>}
      <Button type="submit" size="lg" disabled={busy}>
        {busy && <Loader2 className="animate-spin" aria-hidden />} Create clinic
      </Button>
    </form>
  );
}
