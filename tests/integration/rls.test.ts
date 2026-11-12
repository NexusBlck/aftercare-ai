import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { describe, expect, it } from "vitest";

/**
 * LIVE cross-user isolation tests against a Supabase project with the migration applied.
 * Runs only when these are set (use a disposable test project and two test users):
 *   SUPABASE_TEST_URL, SUPABASE_TEST_ANON_KEY,
 *   SUPABASE_TEST_USER_A_EMAIL, SUPABASE_TEST_USER_A_PASSWORD,
 *   SUPABASE_TEST_USER_B_EMAIL, SUPABASE_TEST_USER_B_PASSWORD
 */
const env = process.env;
const configured = [
  "SUPABASE_TEST_URL",
  "SUPABASE_TEST_ANON_KEY",
  "SUPABASE_TEST_USER_A_EMAIL",
  "SUPABASE_TEST_USER_A_PASSWORD",
  "SUPABASE_TEST_USER_B_EMAIL",
  "SUPABASE_TEST_USER_B_PASSWORD",
].every((k) => !!env[k]);

async function signIn(email: string, password: string): Promise<{ client: SupabaseClient; id: string }> {
  const client = createClient(env.SUPABASE_TEST_URL!, env.SUPABASE_TEST_ANON_KEY!, { auth: { persistSession: false } });
  const { data, error } = await client.auth.signInWithPassword({ email, password });
  if (error || !data.user) throw new Error(`sign-in failed for ${email}`);
  return { client, id: data.user.id };
}

describe.skipIf(!configured)("RLS cross-user isolation (live Supabase)", () => {
  it("user B cannot read, modify or attach to user A's records or files", async () => {
    const a = await signIn(env.SUPABASE_TEST_USER_A_EMAIL!, env.SUPABASE_TEST_USER_A_PASSWORD!);
    const b = await signIn(env.SUPABASE_TEST_USER_B_EMAIL!, env.SUPABASE_TEST_USER_B_PASSWORD!);

    const { data: plan, error: planErr } = await a.client.from("care_plans").insert({ user_id: a.id, title: "RLS test plan" }).select("id").single();
    expect(planErr).toBeNull();
    const planId = plan!.id as string;
    const { data: med } = await a.client
      .from("medications")
      .insert({ care_plan_id: planId, user_id: a.id, name: "Synthetic test medicine" })
      .select("id")
      .single();
    const path = `${a.id}/${planId}/${crypto.randomUUID()}.pdf`;
    const upload = await a.client.storage.from("medical-documents").upload(path, new Blob(["%PDF-1.4 synthetic"], { type: "application/pdf" }));
    expect(upload.error).toBeNull();

    try {
      // Read
      expect((await b.client.from("care_plans").select("id").eq("id", planId)).data).toEqual([]);
      expect((await b.client.from("medications").select("id").eq("id", med!.id)).data).toEqual([]);
      // Modify
      await b.client.from("medications").update({ name: "tampered" }).eq("id", med!.id);
      const { data: still } = await a.client.from("medications").select("name").eq("id", med!.id).single();
      expect(still!.name).toBe("Synthetic test medicine");
      // Delete
      await b.client.from("care_plans").delete().eq("id", planId);
      expect((await a.client.from("care_plans").select("id").eq("id", planId)).data).toHaveLength(1);
      // Attach a child row to A's plan, even with B's own user_id
      const attach = await b.client.from("medications").insert({ care_plan_id: planId, user_id: b.id, name: "intruder" });
      expect(attach.error).not.toBeNull();
      // Impersonate A's user_id
      const spoof = await b.client.from("care_plans").insert({ user_id: a.id, title: "spoof" });
      expect(spoof.error).not.toBeNull();
      // Storage
      expect((await b.client.storage.from("medical-documents").download(path)).error).not.toBeNull();
      const anon = createClient(env.SUPABASE_TEST_URL!, env.SUPABASE_TEST_ANON_KEY!, { auth: { persistSession: false } });
      expect((await anon.storage.from("medical-documents").download(path)).error).not.toBeNull();
      expect(anon.storage.from("medical-documents").getPublicUrl(path).data.publicUrl).toBeTruthy(); // URL exists but bucket is private:
      const res = await fetch(anon.storage.from("medical-documents").getPublicUrl(path).data.publicUrl);
      expect(res.ok).toBe(false);
    } finally {
      await a.client.storage.from("medical-documents").remove([path]);
      await a.client.from("care_plans").delete().eq("id", planId);
    }
  });
});

describe.runIf(!configured)("RLS cross-user isolation (live Supabase)", () => {
  it.skip("skipped: set SUPABASE_TEST_* variables to run against a disposable Supabase project", () => {});
});
