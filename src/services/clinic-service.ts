import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { AppError } from "@/lib/api/errors";
import { mapDbError } from "@/lib/clinic/db-errors";
import { must, requireId, type ClinicContext } from "@/lib/clinic/server";
import { PlanBundleSchema, type FollowUp, type PlanBundle } from "@/schemas/domain";

/**
 * Clinic data access. Every query runs with the signed-in staff member's Supabase client, so RLS
 * applies; every query is also explicitly scoped to the active organization, so a staff member who
 * belongs to several clinics only ever sees the clinic they are working in.
 */

export const PAGE_SIZE = 25;

export const PATIENT_COLUMNS =
  "id, organization_id, mrn, full_name, date_of_birth, email, phone, preferred_language, emergency_contact_name, emergency_contact_phone, consent_status, status, linked_at, created_at, updated_at";

export function parseBundle(raw: unknown): PlanBundle {
  const parsed = PlanBundleSchema.safeParse(raw);
  if (!parsed.success) throw new AppError("database_error", "This plan version could not be read.", 500);
  return parsed.data;
}

/** Characters that have meaning in PostgREST filter strings are removed from search input. */
export function sanitizeSearch(q: string | undefined): string {
  return (q ?? "").replace(/[,()*%_\\:"'.]/g, " ").replace(/\s+/g, " ").trim().slice(0, 80);
}

/** Escapes LIKE wildcards so `ilike` compares the literal value (case-insensitively). */
export function escapeLike(value: string): string {
  return value.replace(/[\\%_]/g, (c) => `\\${c}`);
}

export interface PatientRow {
  id: string;
  organization_id: string;
  mrn: string | null;
  full_name: string;
  date_of_birth: string;
  email: string | null;
  phone: string | null;
  preferred_language: "en" | "ur";
  status: "active" | "archived";
  linked_at: string | null;
}

export interface EpisodeRow {
  id: string;
  organization_id: string;
  patient_id: string;
  title: string;
  department: string | null;
  admission_date: string | null;
  discharge_date: string | null;
  status: "open" | "closed";
}

export interface PlanRow {
  id: string;
  organization_id: string;
  patient_id: string;
  episode_id: string;
  title: string;
  approved_version_id: string | null;
  created_at: string;
}

export async function getPatient(ctx: ClinicContext, id: string): Promise<PatientRow> {
  requireId(id, "patient");
  return must(
    await ctx.supabase.from("clinic_patients").select(PATIENT_COLUMNS).eq("id", id).eq("organization_id", ctx.orgId).maybeSingle(),
    "patient",
  ) as unknown as PatientRow;
}

export async function getEpisode(ctx: ClinicContext, id: string): Promise<EpisodeRow> {
  requireId(id, "care episode");
  return must(
    await ctx.supabase.from("care_episodes").select("*").eq("id", id).eq("organization_id", ctx.orgId).maybeSingle(),
    "care episode",
  ) as unknown as EpisodeRow;
}

export interface VersionRow {
  id: string;
  plan_id: string;
  version: number;
  status: "draft" | "pending_review" | "changes_requested" | "approved" | "rejected" | "superseded";
  bundle: PlanBundle;
  based_on_version_id: string | null;
  created_by: string | null;
  submitted_by: string | null;
  submitted_at: string | null;
  decided_at: string | null;
  created_at: string;
  updated_at: string;
}

export async function getVersion(ctx: ClinicContext, id: string): Promise<VersionRow> {
  requireId(id, "plan version");
  const row = must(
    await ctx.supabase.from("plan_versions").select("*").eq("id", id).eq("organization_id", ctx.orgId).maybeSingle(),
    "plan version",
  ) as unknown as Omit<VersionRow, "bundle"> & { bundle: unknown };
  return { ...row, bundle: parseBundle(row.bundle) };
}

/** Optimistic concurrency: the write succeeds only if nobody saved the version since it was read. */
export async function saveVersionBundle(ctx: ClinicContext, version: VersionRow, bundle: PlanBundle): Promise<VersionRow> {
  const checked = PlanBundleSchema.parse(bundle);
  const { data, error } = await ctx.supabase
    .from("plan_versions")
    .update({ bundle: checked })
    .eq("id", version.id)
    .eq("organization_id", ctx.orgId)
    .eq("updated_at", version.updated_at)
    .select("*")
    .maybeSingle();
  if (error) throw mapDbError(error, "save the plan");
  if (!data) throw new AppError("conflict", "Someone else changed this plan while you were editing. Reload to see the latest version.", 409);
  return { ...(data as Omit<VersionRow, "bundle">), bundle: parseBundle((data as { bundle: unknown }).bundle) };
}

export async function getPlan(ctx: ClinicContext, id: string): Promise<PlanRow> {
  requireId(id, "recovery plan");
  return must(
    await ctx.supabase.from("recovery_plans").select("*").eq("id", id).eq("organization_id", ctx.orgId).maybeSingle(),
    "recovery plan",
  ) as unknown as PlanRow;
}

export async function openVersionFor(supabase: SupabaseClient, orgId: string, planId: string) {
  const { data, error } = await supabase
    .from("plan_versions")
    .select("id, status, version")
    .eq("plan_id", planId)
    .eq("organization_id", orgId)
    .in("status", ["draft", "pending_review", "changes_requested"])
    .maybeSingle();
  if (error) throw mapDbError(error, "load the plan");
  return data as { id: string; status: string; version: number } | null;
}

export async function memberNames(ctx: ClinicContext): Promise<Map<string, string>> {
  const { data } = await ctx.supabase
    .from("organization_memberships")
    .select("user_id, display_name, email")
    .eq("organization_id", ctx.orgId);
  return new Map((data ?? []).map((m) => [m.user_id as string, (m.display_name as string | null) ?? (m.email as string | null) ?? "Staff member"]));
}

/* ------------------------------------------------------------------ follow-ups */

export interface FollowUpRow {
  plan_id: string;
  patient_id: string;
  patient_name: string;
  item: FollowUp;
  due: "overdue" | "upcoming" | "later" | "undated" | "done";
  patient_status: string;
  patient_note: string | null;
  staff_status: string;
  staff_note: string | null;
}

export function classifyFollowUp(date: string | null, staffStatus: string, today: string, horizon: string): FollowUpRow["due"] {
  if (staffStatus === "verified_attended" || staffStatus === "cancelled") return "done";
  if (!date) return "undated";
  if (date < today) return "overdue";
  if (date <= horizon) return "upcoming";
  return "later";
}

/** Follow-ups come from approved plans only: drafts are not commitments to the patient. */
export async function listFollowUps(ctx: ClinicContext, patientId?: string): Promise<FollowUpRow[]> {
  let plans = ctx.supabase
    .from("recovery_plans")
    .select("id, patient_id, approved_version_id, patient:clinic_patients(full_name, status)")
    .eq("organization_id", ctx.orgId)
    .not("approved_version_id", "is", null);
  if (patientId) plans = plans.eq("patient_id", patientId);
  const { data: planRows, error } = await plans;
  if (error) throw mapDbError(error, "load follow-ups");
  const rows = (planRows ?? []) as unknown as Array<{ id: string; patient_id: string; approved_version_id: string; patient: { full_name: string; status: string } | null }>;
  const active = rows.filter((p) => p.patient?.status === "active");
  if (active.length === 0) return [];

  const [versions, tracking] = await Promise.all([
    ctx.supabase.from("plan_versions").select("id, follow_ups:bundle->follow_ups").in("id", active.map((p) => p.approved_version_id)).eq("organization_id", ctx.orgId),
    ctx.supabase.from("follow_up_tracking").select("*").in("plan_id", active.map((p) => p.id)).eq("organization_id", ctx.orgId),
  ]);
  if (versions.error || tracking.error) throw mapDbError(versions.error ?? tracking.error, "load follow-ups");
  const byVersion = new Map((versions.data ?? []).map((v) => [v.id as string, (v.follow_ups as FollowUp[] | null) ?? []]));
  const track = new Map((tracking.data ?? []).map((t) => [`${t.plan_id}:${t.follow_up_item_id}`, t]));

  const today = new Date().toISOString().slice(0, 10);
  const horizon = new Date(Date.now() + 14 * 86_400_000).toISOString().slice(0, 10);
  const out: FollowUpRow[] = [];
  for (const plan of active) {
    for (const item of byVersion.get(plan.approved_version_id) ?? []) {
      const t = track.get(`${plan.id}:${item.id}`);
      const staffStatus = (t?.staff_status as string | undefined) ?? "unverified";
      out.push({
        plan_id: plan.id,
        patient_id: plan.patient_id,
        patient_name: plan.patient?.full_name ?? "Patient",
        item,
        due: classifyFollowUp(item.scheduled_date, staffStatus, today, horizon),
        patient_status: (t?.patient_status as string | undefined) ?? "none",
        patient_note: (t?.patient_note as string | null | undefined) ?? null,
        staff_status: staffStatus,
        staff_note: (t?.staff_note as string | null | undefined) ?? null,
      });
    }
  }
  const order = { overdue: 0, upcoming: 1, undated: 2, later: 3, done: 4 };
  return out.sort((a, b) => order[a.due] - order[b.due] || (a.item.scheduled_date ?? "9999").localeCompare(b.item.scheduled_date ?? "9999"));
}

export async function countRows(query: PromiseLike<{ count: number | null; error: { message?: string; code?: string } | null }>): Promise<number> {
  const { count, error } = await query;
  if (error) throw mapDbError(error, "load the dashboard");
  return count ?? 0;
}
