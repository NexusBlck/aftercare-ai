"use client";

import { ShieldAlert } from "lucide-react";
import { PageHeader, PlanGate } from "@/components/app/plan-gate";
import { MedicationCard } from "@/components/recovery/cards";

export default function MedicationsPage() {
  return (
    <PlanGate>
      {(bundle) => {
        const unconfirmed = bundle.medications.filter((m) => m.verification_status !== "confirmed_by_patient").length;
        return (
          <>
            <PageHeader
              title="Medications"
              description="Each medicine exactly as written in your documents. AFTERCARE AI never suggests, changes or stops a medication, and does not create dose times."
            />
            {unconfirmed > 0 && (
              <div className="mb-6 flex items-start gap-3 rounded-2xl border border-amber/30 bg-amber-soft p-4 text-sm">
                <ShieldAlert className="mt-0.5 size-5 shrink-0 text-amber" aria-hidden />
                <p>
                  <span className="font-semibold">
                    {unconfirmed} medication{unconfirmed === 1 ? " has" : "s have"} not been confirmed.
                  </span>{" "}
                  Until you check {unconfirmed === 1 ? "it" : "them"} against your prescription, this list is not a confirmed schedule. For any difference or doubt, ask your pharmacist or the clinician who prescribed it.
                </p>
              </div>
            )}
            {bundle.medications.length === 0 ? (
              <p className="rounded-xl border border-dashed p-6 text-center text-sm text-muted-foreground">No medications found in your documents yet.</p>
            ) : (
              <div className="grid gap-4 xl:grid-cols-2">
                {bundle.medications.map((m) => (
                  <MedicationCard key={m.id} med={m} />
                ))}
              </div>
            )}
          </>
        );
      }}
    </PlanGate>
  );
}
