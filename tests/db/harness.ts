import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { PGlite } from "@electric-sql/pglite";
import { pgcrypto } from "@electric-sql/pglite/contrib/pgcrypto";

/**
 * In-process PostgreSQL (PGlite) with the parts of Supabase the migrations rely on: the `anon`,
 * `authenticated` and `service_role` roles with Supabase's default grants, `auth.users` + `auth.uid()`,
 * and `storage.buckets/objects` + `storage.foldername()`. All migrations are applied in order, so RLS,
 * triggers and SECURITY DEFINER functions are tested exactly as written. Nothing leaves the process.
 */

const SUPABASE_STUBS = `
  create role anon nologin;
  create role authenticated nologin;
  create role service_role nologin bypassrls;
  grant usage on schema public to anon, authenticated, service_role;
  alter default privileges in schema public grant all on tables to anon, authenticated, service_role;
  alter default privileges in schema public grant all on sequences to anon, authenticated, service_role;
  alter default privileges in schema public grant all on functions to anon, authenticated, service_role;

  create schema auth;
  create table auth.users (
    id uuid primary key default gen_random_uuid(),
    email text unique,
    raw_user_meta_data jsonb default '{}'::jsonb,
    created_at timestamptz default now()
  );
  create function auth.uid() returns uuid language sql stable as $$
    select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid
  $$;
  -- Session claims (Supabase's auth.jwt()); "aal" says whether two-factor was completed.
  create function auth.jwt() returns jsonb language sql stable as $$
    select coalesce(nullif(current_setting('request.jwt.claims', true), ''), '{}')::jsonb
  $$;
  create table auth.mfa_factors (
    id uuid primary key default gen_random_uuid(),
    user_id uuid not null references auth.users (id) on delete cascade,
    factor_type text not null default 'totp',
    status text not null default 'unverified'
  );
  grant usage on schema auth to anon, authenticated, service_role;
  grant execute on function auth.uid(), auth.jwt() to anon, authenticated, service_role;

  create schema storage;
  create table storage.buckets (
    id text primary key, name text not null, public boolean default false,
    file_size_limit bigint, allowed_mime_types text[]
  );
  create table storage.objects (
    id uuid primary key default gen_random_uuid(),
    bucket_id text references storage.buckets (id),
    name text not null,
    owner uuid,
    created_at timestamptz default now(),
    unique (bucket_id, name)
  );
  create function storage.foldername(name text) returns text[] language plpgsql immutable as $$
  declare _parts text[];
  begin
    select string_to_array(name, '/') into _parts;
    return _parts[1:array_length(_parts, 1) - 1];
  end $$;
  alter table storage.objects enable row level security;
  grant usage on schema storage to anon, authenticated, service_role;
  grant all on storage.objects to anon, authenticated, service_role;
  grant all on storage.buckets to service_role;
  grant execute on function storage.foldername(text) to anon, authenticated, service_role;
`;

function migrationSql(): string {
  const dir = join(process.cwd(), "supabase", "migrations");
  return readdirSync(dir)
    .filter((f) => f.endsWith(".sql"))
    .sort()
    .map((f) => readFileSync(join(dir, f), "utf8"))
    .join("\n")
    // pg_cron is a hosted-only extension; the scheduled job itself is not under test.
    .replace(/create extension if not exists pg_cron;/g, "")
    .replace(/select cron\.schedule\([^;]*\);/g, "");
}

export interface TestDb {
  db: PGlite;
  /** Runs `fn` as the signed-in user (role `authenticated`, auth.uid() = userId); `aal` defaults to aal1. */
  as<T>(userId: string | null, fn: () => Promise<T>, opts?: { aal?: "aal1" | "aal2" }): Promise<T>;
  /** Gives the user a verified (or unverified) two-factor method. */
  addFactor(userId: string, status?: "verified" | "unverified"): Promise<void>;
  /** Creates an auth user (as the trigger-owning superuser) and returns its id. */
  createUser(email: string): Promise<string>;
  /** Query as the current role; returns rows. */
  q<T = Record<string, unknown>>(sql: string, params?: unknown[]): Promise<T[]>;
  close(): Promise<void>;
}

export async function createTestDb(): Promise<TestDb> {
  const db = new PGlite({ extensions: { pgcrypto } });
  await db.exec(SUPABASE_STUBS);
  await db.exec(migrationSql());

  const q = async <T,>(sql: string, params: unknown[] = []) => (await db.query<T>(sql, params)).rows;

  return {
    db,
    q,
    async as(userId, fn, opts) {
      await db.exec(userId ? "set role authenticated" : "set role anon");
      await db.query("select set_config('request.jwt.claim.sub', $1, false)", [userId ?? ""]);
      await db.query("select set_config('request.jwt.claims', $1, false)", [userId ? JSON.stringify({ sub: userId, aal: opts?.aal ?? "aal1" }) : ""]);
      try {
        return await fn();
      } finally {
        await db.exec("reset role");
        await db.query("select set_config('request.jwt.claim.sub', '', false)");
        await db.query("select set_config('request.jwt.claims', '', false)");
      }
    },
    async addFactor(userId, status = "verified") {
      await q("insert into auth.mfa_factors (user_id, status) values ($1, $2)", [userId, status]);
    },
    async createUser(email) {
      const [row] = await q<{ id: string }>("insert into auth.users (email) values ($1) returning id", [email]);
      return row.id;
    },
    close: () => db.close(),
  };
}

/** Expects `promise` to reject with a Postgres error whose message contains `text`. */
export async function rejects(promise: Promise<unknown>, text: string | RegExp = /./): Promise<string> {
  try {
    await promise;
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    if (typeof text === "string" ? !message.includes(text) : !text.test(message)) {
      throw new Error(`expected error matching ${String(text)}, got: ${message}`);
    }
    return message;
  }
  throw new Error(`expected an error matching ${String(text)}, but the statement succeeded`);
}
