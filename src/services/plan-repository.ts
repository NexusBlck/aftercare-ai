import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { AppError } from "@/lib/api/errors";
import { isUuid } from "@/lib/security/file-validation";
import {
  CarePlanSchema,
  CorrectionSchema,
  DocumentRecordSchema,
  FollowUpSchema,
  MedicationSchema,
  RecoveryTaskSchema,
  ReviewFlagSchema,
  WarningSignSchema,
  type PlanBundle,
} from "@/schemas/domain";
import { z } from "zod";

/**
 * Persistence for plan bundles. Every query runs with the signed-in user's Supabase client, so
 * RLS enforces ownership in addition to the explicit user_id filters here.
 */

const TABLES = {
  documents: { table: "documents", schema: DocumentRecordSchema },
  medications: { table: "medications", schema: MedicationSchema },
  tasks: { table: "recovery_tasks", schema: RecoveryTaskSchema },
  follow_ups: { table: "follow_ups", schema: FollowUpSchema },
  warning_signs: { table: "warning_signs", schema: WarningSignSchema },
  flags: { table: "review_flags", schema: ReviewFlagSchema },
} as const;

type CollectionKey = keyof typeof TABLES;
const CHILD_ORDER: CollectionKey[] = ["medications", "tasks", "follow_ups", "warning_signs", "flags"];

function dbError(context: string): AppError {
  return new AppError("database_error", `We could not ${context}. Please try again.`, 500, true);
}

function normalizeRow(row: Record<string, unknown>): Record<string, unknown> {
  // Postgres `time` comes back as HH:MM:SS; the domain uses HH:MM.
  if (typeof row.scheduled_time === "string") row.scheduled_time = row.scheduled_time.slice(0, 5);
  return row;
}

function parseRows<T>(schema: z.ZodType<T>, rows: unknown[] | null, what: string): T[] {
  return (rows ?? []).map((row) => {
    const parsed = schema.safeParse(normalizeRow(row as Record<string, unknown>));
    if (!parsed.success) throw dbError(`read your ${what}`);
    return parsed.data;
  });
}

export async function getCurrentPlanId(supabase: SupabaseClient, userId: string): Promise<string | null> {
  const { data, error } = await supabase
    .from("care_plans")
    .select("id")
    .eq("user_id", userId)
    .neq("status", "archived")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw dbError("load your care plan");
  return data?.id ?? null;
}

export async function listPlans(supabase: SupabaseClient, userId: string) {
  const { data, error } = await supabase
    .from("care_plans")
    .select("id,title,status,discharge_date,created_at")
    .eq("user_id", userId)
    .order("created_at", { ascending: false });
  if (error) throw dbError("load your care plans");
  return data ?? [];
}

export async function loadBundle(supabase: SupabaseClient, userId: string, planId: string): Promise<PlanBundle> {
  if (!isUuid(planId)) throw new AppError("invalid_id", "That care plan link is not valid.", 400);
  const { data: planRow, error } = await supabase
    .from("care_plans")
    .select("*")
    .eq("id", planId)
    .eq("user_id", userId)
    .maybeSingle();
  if (error) throw dbError("load your care plan");
  if (!planRow) throw new AppError("not_found", "This care plan was not found.", 404);
  const plan = CarePlanSchema.safeParse(planRow);
  if (!plan.success) throw dbError("read your care plan");

  const keys = Object.keys(TABLES) as CollectionKey[];
  const results = await Promise.all([
    ...keys.map((key) =>
      supabase.from(TABLES[key].table).select("*").eq("care_plan_id", planId).eq("user_id", userId).order("created_at"),
    ),
    supabase.from("corrections").select("*").eq("care_plan_id", planId).eq("user_id", userId).order("created_at"),
  ]);
  if (results.some((r) => r.error)) throw dbError("load your care plan");

  const bundle = { plan: plan.data } as PlanBundle;
  keys.forEach((key, i) => {
    (bundle as Record<string, unknown>)[key] = parseRows(TABLES[key].schema as z.ZodType<unknown>, results[i].data, key);
  });
  bundle.corrections = parseRows(CorrectionSchema, results[keys.length].data, "corrections");
  return bundle;
}

/** Finds the plan that owns a child record, verifying ownership through RLS + user_id. */
export async function planIdForRecord(
  supabase: SupabaseClient,
  userId: string,
  table: string,
  id: string,
): Promise<string> {
  if (!isUuid(id)) throw new AppError("invalid_id", "That link is not valid.", 400);
  const { data, error } = await supabase.from(table).select("care_plan_id").eq("id", id).eq("user_id", userId).maybeSingle();
  if (error) throw dbError("find that item");
  if (!data) throw new AppError("not_found", "That item was not found.", 404);
  return data.care_plan_id as string;
}

/**
 * Writes the difference between two versions of a bundle. Rows are compared by value; only changed
 * rows are upserted. Corrections are append-only.
 */
export async function persistDiff(
  supabase: SupabaseClient,
  userId: string,
  before: PlanBundle,
  after: PlanBundle,
): Promise<void> {
  if (JSON.stringify(before.plan) !== JSON.stringify(after.plan)) {
    const { id, title, diagnosis, procedure, admission_date, discharge_date, facility, clinician, encounter_evidence, status } = after.plan;
    const { error } = await supabase
      .from("care_plans")
      .update({ title, diagnosis, procedure, admission_date, discharge_date, facility, clinician, encounter_evidence, status })
      .eq("id", id)
      .eq("user_id", userId);
    if (error) throw dbError("save your care plan");
  }

  const diff = (key: CollectionKey) => {
    const prev = new Map((before[key] as Array<{ id: string }>).map((r) => [r.id, JSON.stringify(r)]));
    const next = after[key] as Array<{ id: string }>;
    const nextIds = new Set(next.map((r) => r.id));
    return {
      upserts: next.filter((r) => prev.get(r.id) !== JSON.stringify(r)).map((r) => ({ ...r, user_id: userId })),
      deletes: [...prev.keys()].filter((id) => !nextIds.has(id)),
    };
  };

  // Documents first (children reference them), deletions of documents last (cascade).
  const docs = diff("documents");
  if (docs.upserts.length) {
    const { error } = await supabase.from("documents").upsert(docs.upserts);
    if (error) throw dbError("save your documents");
  }
  for (const key of CHILD_ORDER) {
    const { upserts, deletes } = diff(key);
    if (deletes.length) {
      const { error } = await supabase.from(TABLES[key].table).delete().in("id", deletes).eq("user_id", userId);
      if (error) throw dbError("update your care plan");
    }
    if (upserts.length) {
      const { error } = await supabase.from(TABLES[key].table).upsert(upserts);
      if (error) throw dbError("save your care plan");
    }
  }
  if (docs.deletes.length) {
    const { error } = await supabase.from("documents").delete().in("id", docs.deletes).eq("user_id", userId);
    if (error) throw dbError("delete the document");
  }

  const known = new Set(before.corrections.map((c) => c.id));
  const added = after.corrections.filter((c) => !known.has(c.id)).map((c) => ({ ...c, user_id: userId }));
  if (added.length) {
    const { error } = await supabase.from("corrections").insert(added);
    if (error) throw dbError("record your correction");
  }
}
