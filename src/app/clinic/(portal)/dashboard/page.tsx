"use client";

import { ArrowRight, ClipboardCheck, FileUp, UserPlus } from "lucide-react";
import Link from "next/link";
import { useClinic } from "@/components/clinic/clinic-context";
import { ClinicPageHeader, EmptyState, ErrorState, formatDate, LoadingRows, Pill, Section, StatCard } from "@/components/clinic/ui";
import { useApi } from "@/components/clinic/use-api";
import { Button } from "@/components/ui/button";
import { actionLabel } from "@/lib/clinic/labels";

interface Dashboard {
  metrics: Record<
    "patients" | "linked" | "openEpisodes" | "pendingReview" | "inProgress" | "approvedPlans" | "pendingInvites" | "openQuestions" | "urgentQuestions" | "upcomingFollowUps" | "overdueFollowUps",
    number
  >;
  recentPatients: Array<{ id: string; full_name: string; mrn: string | null; created_at: string; linked_at: string | null }>;
  reviewQueue: Array<{ id: string; version: number; submitted_at: string; plan: { id: string; title: string; patient: { id: string; full_name: string } | null } | null }>;
  activity: Array<{ id: number; action: string; resource_type: string; created_at: string }> | null;
  followUps: Array<{ plan_id: string; patient_id: string; patient_name: string; due: string; item: { id: string; specialty: string | null; clinician: string | null; scheduled_date: string | null } }>;
}

export default function ClinicDashboardPage() {
  const { active, can } = useClinic();
  const { data, error, loading, reload } = useApi<Dashboard>("/api/clinic/dashboard");
  const m = data?.metrics;

  return (
    <>
      <ClinicPageHeader
        eyebrow={active.organization.name}
        title="Dashboard"
        description="Live counts from your clinic's records. Select a number to see the records behind it."
        actions={
          <>
            {can("patients.write") && (
              <Button asChild>
                <Link href="/clinic/patients/new">
                  <UserPlus aria-hidden /> Register patient
                </Link>
              </Button>
            )}
            <Button asChild variant="outline">
              <Link href="/clinic/review">
                <ClipboardCheck aria-hidden /> Review queue
              </Link>
            </Button>
          </>
        }
      />
      {error && <ErrorState error={error} onRetry={reload} />}
      {loading && !data && <LoadingRows rows={4} />}
      {m && data && (
        <div className="space-y-6">
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <StatCard label="Registered patients" value={m.patients} hint={`${m.linked} linked to the patient app`} href="/clinic/patients" />
            <StatCard label="Awaiting clinical review" value={m.pendingReview} hint={`${m.inProgress} drafts in preparation`} href="/clinic/review" tone={m.pendingReview ? "amber" : "default"} />
            <StatCard label="Approved recovery plans" value={m.approvedPlans} hint={`${m.openEpisodes} open care episodes`} href="/clinic/patients" tone="teal" />
            <StatCard label="Pending patient invitations" value={m.pendingInvites} hint="Not yet accepted" href="/clinic/patients" />
            <StatCard label="Upcoming follow-ups (14 days)" value={m.upcomingFollowUps} href="/clinic/follow-ups" />
            <StatCard label="Overdue follow-ups" value={m.overdueFollowUps} hint="Date passed, not verified" href="/clinic/follow-ups" tone={m.overdueFollowUps ? "danger" : "default"} />
            <StatCard label="Open patient questions" value={m.openQuestions} href="/clinic/questions" />
            <StatCard
              label="Questions with possible urgent symptoms"
              value={m.urgentQuestions}
              hint="Keyword screen — not a triage decision"
              href="/clinic/questions"
              tone={m.urgentQuestions ? "danger" : "default"}
            />
          </div>

          <div className="grid gap-6 xl:grid-cols-2">
            <Section title="Waiting for a clinician" action={<Link href="/clinic/review" className="text-sm font-semibold text-teal hover:underline">Open queue</Link>}>
              {data.reviewQueue.length === 0 ? (
                <EmptyState title="Nothing waiting for review" description="Plans submitted for clinical review will appear here." />
              ) : (
                <ul className="divide-y">
                  {data.reviewQueue.map((v) => (
                    <li key={v.id}>
                      <Link href={`/clinic/plans/${v.plan?.id}`} className="flex items-center justify-between gap-3 py-3 hover:text-teal">
                        <span className="min-w-0">
                          <span className="block truncate font-semibold">{v.plan?.patient?.full_name ?? "Patient"}</span>
                          <span className="block truncate text-sm text-muted-foreground">
                            {v.plan?.title} · version {v.version} · submitted {formatDate(v.submitted_at, true)}
                          </span>
                        </span>
                        <ArrowRight className="size-4 shrink-0" aria-hidden />
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
            </Section>

            <Section title="Follow-ups needing attention" action={<Link href="/clinic/follow-ups" className="text-sm font-semibold text-teal hover:underline">All follow-ups</Link>}>
              {data.followUps.length === 0 ? (
                <EmptyState title="No upcoming or overdue follow-ups" description="Follow-ups appear once a plan containing documented appointments is approved." />
              ) : (
                <ul className="divide-y">
                  {data.followUps.map((f) => (
                    <li key={`${f.plan_id}-${f.item.id}`} className="flex items-center justify-between gap-3 py-3">
                      <span className="min-w-0">
                        <Link href={`/clinic/patients/${f.patient_id}`} className="block truncate font-semibold hover:text-teal">
                          {f.patient_name}
                        </Link>
                        <span className="block truncate text-sm text-muted-foreground">{f.item.specialty ?? f.item.clinician ?? "Follow-up"} · {formatDate(f.item.scheduled_date)}</span>
                      </span>
                      <Pill tone={f.due === "overdue" ? "danger" : "amber"}>{f.due === "overdue" ? "Overdue" : "Upcoming"}</Pill>
                    </li>
                  ))}
                </ul>
              )}
            </Section>

            <Section title="Recently registered" action={<Link href="/clinic/patients" className="text-sm font-semibold text-teal hover:underline">All patients</Link>}>
              {data.recentPatients.length === 0 ? (
                <EmptyState
                  icon={<UserPlus className="size-5" aria-hidden />}
                  title="No patients yet"
                  description="Register a patient, upload their discharge documents and prepare a plan for clinical review."
                  action={
                    can("patients.write") ? (
                      <Button asChild>
                        <Link href="/clinic/patients/new">Register the first patient</Link>
                      </Button>
                    ) : null
                  }
                />
              ) : (
                <ul className="divide-y">
                  {data.recentPatients.map((p) => (
                    <li key={p.id}>
                      <Link href={`/clinic/patients/${p.id}`} className="flex items-center justify-between gap-3 py-3 hover:text-teal">
                        <span className="min-w-0">
                          <span className="block truncate font-semibold">{p.full_name}</span>
                          <span className="block text-sm text-muted-foreground">
                            {p.mrn ? `Ref ${p.mrn} · ` : ""}registered {formatDate(p.created_at)}
                          </span>
                        </span>
                        {p.linked_at ? <Pill tone="teal">App linked</Pill> : <Pill>Not linked</Pill>}
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
            </Section>

            <Section title="Recent activity" description={data.activity ? "From the clinic audit log" : undefined}>
              {data.activity === null ? (
                <p className="text-sm text-muted-foreground">The activity log is visible to clinic owners and administrators.</p>
              ) : data.activity.length === 0 ? (
                <EmptyState icon={<FileUp className="size-5" aria-hidden />} title="No activity yet" />
              ) : (
                <ul className="divide-y">
                  {data.activity.map((a) => (
                    <li key={a.id} className="flex items-center justify-between gap-3 py-2.5 text-sm">
                      <span>{actionLabel(a.action)}</span>
                      <span className="shrink-0 text-muted-foreground">{formatDate(a.created_at, true)}</span>
                    </li>
                  ))}
                </ul>
              )}
            </Section>
          </div>
        </div>
      )}
    </>
  );
}
