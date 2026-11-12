"use client";

import { AlertTriangle, Loader2 } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { z } from "zod";
import { ClinicPageHeader, Field, NativeSelect, Section } from "@/components/clinic/ui";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ClientError } from "@/lib/client/http";
import { CreatePatientSchema } from "@/schemas/clinic";

type Errors = Partial<Record<string, string>>;

export default function NewPatientPage() {
  const router = useRouter();
  const [form, setForm] = useState({
    full_name: "",
    date_of_birth: "",
    mrn: "",
    email: "",
    phone: "",
    preferred_language: "en",
    emergency_contact_name: "",
    emergency_contact_phone: "",
    consent_status: "not_recorded",
    episode_title: "",
    department: "",
    admission_date: "",
    discharge_date: "",
  });
  const [errors, setErrors] = useState<Errors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [duplicates, setDuplicates] = useState<Array<{ id: string; full_name: string; date_of_birth: string; mrn: string | null }> | null>(null);
  const [busy, setBusy] = useState(false);
  const set = (key: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => setForm((f) => ({ ...f, [key]: e.target.value }));

  const submit = async (confirmDuplicate = false) => {
    setFormError(null);
    const payload = {
      full_name: form.full_name,
      date_of_birth: form.date_of_birth,
      mrn: form.mrn,
      email: form.email,
      phone: form.phone,
      preferred_language: form.preferred_language,
      emergency_contact_name: form.emergency_contact_name,
      emergency_contact_phone: form.emergency_contact_phone,
      consent_status: form.consent_status,
      confirm_duplicate: confirmDuplicate,
      episode: form.episode_title.trim()
        ? { title: form.episode_title, department: form.department, admission_date: form.admission_date || null, discharge_date: form.discharge_date || null }
        : undefined,
    };
    const parsed = CreatePatientSchema.safeParse(payload);
    if (!parsed.success) {
      const flat = z.flattenError(parsed.error).fieldErrors as Record<string, string[] | undefined>;
      setErrors(Object.fromEntries(Object.entries(flat).map(([k, v]) => [k, v?.[0]])));
      return;
    }
    setErrors({});
    setBusy(true);
    try {
      const res = await fetch("/api/clinic/patients", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(parsed.data), credentials: "same-origin" });
      const body = await res.json();
      if (res.status === 409 && body.duplicate) {
        setDuplicates(body.matches);
        return;
      }
      if (!res.ok) throw new ClientError(body?.error?.code ?? "internal_error", body?.error?.message ?? "We could not register the patient.");
      router.push(`/clinic/patients/${body.patient.id}`);
    } catch (err) {
      setFormError(err instanceof ClientError ? err.message : "We could not register the patient. Please try again.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <ClinicPageHeader
        eyebrow={<Link href="/clinic/patients" className="hover:underline">Patients</Link>}
        title="Register a patient"
        description="Collect only what the recovery workflow needs. Use synthetic details while testing."
      />
      <form
        noValidate
        onSubmit={(e) => {
          e.preventDefault();
          void submit(false);
        }}
        className="grid max-w-3xl gap-6"
      >
        <Section title="Patient details">
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Full name" htmlFor="full_name" required error={errors.full_name}>
              <Input id="full_name" value={form.full_name} onChange={set("full_name")} autoComplete="off" maxLength={120} aria-invalid={!!errors.full_name} />
            </Field>
            <Field label="Date of birth" htmlFor="date_of_birth" required error={errors.date_of_birth} hint="Used to verify the patient when they accept their invitation.">
              <Input id="date_of_birth" type="date" value={form.date_of_birth} onChange={set("date_of_birth")} aria-invalid={!!errors.date_of_birth} />
            </Field>
            <Field label="Clinic reference (MRN)" htmlFor="mrn" error={errors.mrn} hint="Optional. Must be unique in your clinic.">
              <Input id="mrn" value={form.mrn} onChange={set("mrn")} maxLength={40} />
            </Field>
            <Field label="Preferred language" htmlFor="preferred_language">
              <NativeSelect id="preferred_language" value={form.preferred_language} onChange={set("preferred_language")}>
                <option value="en">English</option>
                <option value="ur">Urdu</option>
              </NativeSelect>
            </Field>
            <Field label="Email" htmlFor="email" error={errors.email}>
              <Input id="email" type="email" value={form.email} onChange={set("email")} maxLength={254} />
            </Field>
            <Field label="Phone" htmlFor="phone" error={errors.phone}>
              <Input id="phone" type="tel" value={form.phone} onChange={set("phone")} maxLength={40} />
            </Field>
            <Field label="Emergency contact name" htmlFor="emergency_contact_name">
              <Input id="emergency_contact_name" value={form.emergency_contact_name} onChange={set("emergency_contact_name")} maxLength={120} />
            </Field>
            <Field label="Emergency contact phone" htmlFor="emergency_contact_phone" error={errors.emergency_contact_phone}>
              <Input id="emergency_contact_phone" type="tel" value={form.emergency_contact_phone} onChange={set("emergency_contact_phone")} maxLength={40} />
            </Field>
            <Field label="Consent to use AFTERCARE AI" htmlFor="consent_status" hint="Record how the patient agreed to their information being processed.">
              <NativeSelect id="consent_status" value={form.consent_status} onChange={set("consent_status")}>
                <option value="not_recorded">Not yet recorded</option>
                <option value="verbal">Verbal consent</option>
                <option value="written">Written consent</option>
                <option value="declined">Declined</option>
              </NativeSelect>
            </Field>
          </div>
        </Section>

        <Section title="Care episode" description="Optional now — you can add episodes later from the patient's record.">
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Procedure or reason for care" htmlFor="episode_title" error={errors.episode}>
              <Input id="episode_title" value={form.episode_title} onChange={set("episode_title")} maxLength={160} placeholder="e.g. Laparoscopic appendectomy" />
            </Field>
            <Field label="Department" htmlFor="department">
              <Input id="department" value={form.department} onChange={set("department")} maxLength={80} />
            </Field>
            <Field label="Admission date" htmlFor="admission_date">
              <Input id="admission_date" type="date" value={form.admission_date} onChange={set("admission_date")} />
            </Field>
            <Field label="Discharge date" htmlFor="discharge_date">
              <Input id="discharge_date" type="date" value={form.discharge_date} onChange={set("discharge_date")} />
            </Field>
          </div>
        </Section>

        {duplicates && (
          <div role="alert" className="rounded-2xl border border-amber/30 bg-amber-soft p-5">
            <p className="flex items-center gap-2 font-semibold text-amber">
              <AlertTriangle className="size-4" aria-hidden /> This may be a patient you already registered
            </p>
            <ul className="mt-3 space-y-1 text-sm">
              {duplicates.map((d) => (
                <li key={d.id}>
                  <Link href={`/clinic/patients/${d.id}`} className="font-semibold underline">
                    {d.full_name}
                  </Link>{" "}
                  · born {d.date_of_birth}
                  {d.mrn ? ` · Ref ${d.mrn}` : ""}
                </li>
              ))}
            </ul>
            <div className="mt-4 flex flex-wrap gap-2">
              <Button type="button" variant="outline" onClick={() => setDuplicates(null)}>
                Go back
              </Button>
              <Button type="button" onClick={() => void submit(true)} disabled={busy}>
                It is a different person — register anyway
              </Button>
            </div>
          </div>
        )}
        {formError && (
          <p role="alert" className="rounded-lg bg-danger-soft px-3 py-2 text-sm text-danger">
            {formError}
          </p>
        )}
        {!duplicates && (
          <div className="flex gap-2">
            <Button type="submit" size="lg" disabled={busy}>
              {busy && <Loader2 className="animate-spin" aria-hidden />} Register patient
            </Button>
            <Button asChild type="button" size="lg" variant="outline">
              <Link href="/clinic/patients">Cancel</Link>
            </Button>
          </div>
        )}
      </form>
    </>
  );
}
