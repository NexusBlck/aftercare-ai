import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/** Static checks on the migration so RLS cannot silently regress. Live checks are in rls.test.ts. */
const dir = join(process.cwd(), "supabase", "migrations");
const sql = readdirSync(dir)
  .filter((f) => f.endsWith(".sql"))
  .sort()
  .map((f) => readFileSync(join(dir, f), "utf8"))
  .join("\n");
const tables = [...sql.matchAll(/create table public\.(\w+)/g)].map((m) => m[1]);

describe("database migration", () => {
  it("creates the core tables", () => {
    expect(tables).toEqual(
      expect.arrayContaining(["profiles", "care_plans", "documents", "medications", "recovery_tasks", "follow_ups", "extraction_runs"]),
    );
  });

  it("enables row level security on every table", () => {
    for (const t of tables) expect(sql, t).toContain(`alter table public.${t} enable row level security;`);
  });

  it("scopes every policy to the authenticated owner and never allows blanket access", () => {
    expect(sql).not.toMatch(/using\s*\(\s*true\s*\)/i);
    expect(sql).not.toMatch(/to\s+anon/i);
    const policies = sql.match(/create policy[\s\S]*?;/g) ?? [];
    expect(policies.length).toBeGreaterThan(5);
    for (const p of policies) expect(p).toMatch(/auth\.uid\(\)|%I_own/);
  });

  it("checks parent ownership when child rows are written", () => {
    expect(sql).toMatch(/with check \(user_id = auth\.uid\(\) and public\.owns_care_plan\(care_plan_id\) and public\.owns_document\(document_id\)\)/);
  });

  it("keeps the storage bucket private and folder-scoped to the user", () => {
    expect(sql).toMatch(/values \('medical-documents', 'medical-documents', false/);
    expect(sql).toMatch(/\(storage\.foldername\(name\)\)\[1\] = auth\.uid\(\)::text/);
  });

  it("stores clinical dates as date, not timestamps", () => {
    for (const col of ["admission_date date", "discharge_date date", "scheduled_date date", "due_date date", "patient_reschedule_date date"]) {
      expect(sql).toContain(col);
    }
    expect(sql).toContain("scheduled_time time");
  });

  it("records legal acceptances with a server timestamp and never lets users edit them", () => {
    expect(tables).toContain("legal_acceptances");
    expect(sql).toContain("new.accepted_at = now()");
    expect(sql).not.toMatch(/create policy \w+ on public\.legal_acceptances for (update|all)/);
    expect(sql).toContain("after insert on auth.users");
  });

  it("schedules retention clean-up and keeps marketing consent separate", () => {
    expect(sql).toContain("interval '90 days'");
    expect(sql).toContain("interval '24 hours'");
    expect(sql).toContain("cron.schedule('aftercare-retention'");
    expect(sql).toMatch(/marketing_opt_in boolean not null default false/);
  });

  it("makes corrections append-only", () => {
    expect(sql).not.toMatch(/create policy \w+ on public\.corrections for (update|delete|all)/);
  });
});
