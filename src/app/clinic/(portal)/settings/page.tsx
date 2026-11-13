"use client";

import { Loader2 } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { useClinic } from "@/components/clinic/clinic-context";
import { ClinicPageHeader, Field, NativeSelect, Section } from "@/components/clinic/ui";
import { send } from "@/components/clinic/use-api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { DEFAULT_EMERGENCY_GUIDANCE } from "@/lib/clinic/urgent";
import { ClientError } from "@/lib/client/http";

export default function ClinicSettingsPage() {
  const { active, can, refresh } = useClinic();
  const org = active.organization;
  const editable = can("org.manage");
  const [form, setForm] = useState({
    name: org.name,
    org_type: org.org_type,
    city: org.city ?? "",
    address: org.address ?? "",
    contact_email: org.contact_email ?? "",
    contact_phone: org.contact_phone ?? "",
    communication_hours: org.communication_hours ?? "",
    emergency_instructions: org.emergency_instructions ?? "",
  });
  const [busy, setBusy] = useState(false);
  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => setForm({ ...form, [k]: e.target.value });

  return (
    <>
      <ClinicPageHeader title="Clinic settings" description={editable ? "Your clinic profile and what patients see about contacting you." : "Only owners and administrators can change these settings."} />
      <form
        className="grid max-w-3xl gap-6"
        onSubmit={async (e) => {
          e.preventDefault();
          setBusy(true);
          try {
            await send("/api/clinic/organization", "PATCH", form);
            toast.success("Clinic settings saved.");
            await refresh();
          } catch (err) {
            toast.error(err instanceof ClientError ? err.message : "We could not save the settings.");
          } finally {
            setBusy(false);
          }
        }}
      >
        <fieldset disabled={!editable} className="grid gap-6">
          <Section title="Profile">
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Clinic name" htmlFor="org-name" required>
                <Input id="org-name" value={form.name} onChange={set("name")} maxLength={120} />
              </Field>
              <Field label="Type" htmlFor="org-type">
                <NativeSelect id="org-type" value={form.org_type} onChange={set("org_type")}>
                  <option value="hospital">Hospital</option>
                  <option value="clinic">Clinic</option>
                  <option value="practice">Practice</option>
                  <option value="other">Other</option>
                </NativeSelect>
              </Field>
              <Field label="City" htmlFor="org-city">
                <Input id="org-city" value={form.city} onChange={set("city")} maxLength={80} />
              </Field>
              <Field label="Address" htmlFor="org-address">
                <Input id="org-address" value={form.address} onChange={set("address")} maxLength={300} />
              </Field>
              <Field label="Contact email" htmlFor="org-email">
                <Input id="org-email" type="email" value={form.contact_email} onChange={set("contact_email")} maxLength={254} />
              </Field>
              <Field label="Contact phone" htmlFor="org-phone">
                <Input id="org-phone" type="tel" value={form.contact_phone} onChange={set("contact_phone")} maxLength={40} />
              </Field>
            </div>
          </Section>
          <Section title="Patient communication" description="Shown to patients next to the question form. Do not promise response times the clinic has not committed to.">
            <div className="grid gap-4">
              <Field label="When the care team reads messages" htmlFor="org-hours" hint="e.g. “Messages are read Monday–Friday, 9am–5pm. Replies may take up to two working days.”">
                <Textarea id="org-hours" value={form.communication_hours} onChange={set("communication_hours")} maxLength={300} rows={2} />
              </Field>
              <Field label="Emergency instructions" htmlFor="org-emergency" hint={`Shown with the default guidance: “${DEFAULT_EMERGENCY_GUIDANCE}” Must be approved by your clinical safety lead.`}>
                <Textarea id="org-emergency" value={form.emergency_instructions} onChange={set("emergency_instructions")} maxLength={600} rows={3} />
              </Field>
            </div>
          </Section>
        </fieldset>
        {editable && (
          <div>
            <Button type="submit" disabled={busy}>
              {busy && <Loader2 className="animate-spin" aria-hidden />} Save settings
            </Button>
          </div>
        )}
      </form>
    </>
  );
}
