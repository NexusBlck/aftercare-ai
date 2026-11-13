import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createTestDb, rejects, type TestDb } from "./harness";

/**
 * Multi-tenant security tests against the real migrations (RLS, triggers, SECURITY DEFINER functions)
 * running in in-process PostgreSQL. Every check runs as the `authenticated` (or `anon`) role with
 * auth.uid() set, exactly like a PostgREST request from that user.
 *
 * Synthetic data only.
 */

let t: TestDb;
const u = {} as Record<"ownerA" | "clinicianA" | "nurseA" | "adminA" | "ownerB" | "patientA" | "patientB" | "outsider", string>;
let orgA: string;
let orgB: string;
let patientA: string; // clinic_patients id in clinic A
let patientB: string; // clinic_patients id in clinic B
let episodeA: string;
let episodeB: string;
let planA: string;
let versionA1: string;
let planB: string;
let docA: string;
let nurseMembership: string;

const BUNDLE = JSON.stringify({ plan: { title: "Synthetic plan" }, medications: [], tasks: [], follow_ups: [{ id: "fu-1" }], warning_signs: [] });

async function rpcRow<T = Record<string, unknown>>(userId: string, sql: string, params: unknown[] = []): Promise<T> {
  return t.as(userId, async () => (await t.q<T>(sql, params))[0]);
}

async function acceptStaff(org: string, inviter: string, email: string, role: string, reviewer: boolean): Promise<string> {
  const userId = await t.createUser(email);
  const inv = await rpcRow<{ token: string }>(inviter, "select * from create_staff_invitation($1, $2, $3, $4)", [org, email, role, reviewer]);
  await t.as(userId, () => t.q("select accept_staff_invitation($1, $2)", [inv.token, `Synthetic ${role}`]));
  return userId;
}

async function makeDocument(userId: string, org: string, patient: string, episode: string): Promise<string> {
  const id = crypto.randomUUID();
  await t.as(userId, () =>
    t.q(
      `insert into clinic_documents (id, organization_id, patient_id, episode_id, file_path, original_filename, mime_type, file_size)
       values ($1, $2, $3, $4, $5, 'discharge.pdf', 'application/pdf', 1000)`,
      [id, org, patient, episode, `clinic/${org}/${patient}/${id}.pdf`],
    ),
  );
  return id;
}

beforeAll(async () => {
  t = await createTestDb();
  u.ownerA = await t.createUser("owner@clinic-a.test");
  u.ownerB = await t.createUser("owner@clinic-b.test");
  u.patientA = await t.createUser("patient-a@example.test");
  u.patientB = await t.createUser("patient-b@example.test");
  u.outsider = await t.createUser("outsider@example.test");

  orgA = (await rpcRow<{ id: string }>(u.ownerA, "select create_organization('Clinic A', 'clinic-a', 'clinic', null, null, 'Lahore', 'Dr Owner A', true) as id")).id;
  orgB = (await rpcRow<{ id: string }>(u.ownerB, "select create_organization('Clinic B', 'clinic-b', 'hospital', null, null, 'Karachi', 'Owner B', false) as id")).id;

  u.clinicianA = await acceptStaff(orgA, u.ownerA, "clinician@clinic-a.test", "clinician", true);
  u.nurseA = await acceptStaff(orgA, u.ownerA, "nurse@clinic-a.test", "nurse", false);
  u.adminA = await acceptStaff(orgA, u.ownerA, "admin@clinic-a.test", "admin", false);
  nurseMembership = (await t.q<{ id: string }>("select id from organization_memberships where user_id = $1", [u.nurseA]))[0].id;

  patientA = (await rpcRow<{ id: string }>(u.nurseA, "insert into clinic_patients (organization_id, full_name, date_of_birth, mrn) values ($1, 'Synthetic Patient A', '1980-05-01', 'A-001') returning id", [orgA])).id;
  patientB = (await rpcRow<{ id: string }>(u.ownerB, "insert into clinic_patients (organization_id, full_name, date_of_birth) values ($1, 'Synthetic Patient B', '1975-02-02') returning id", [orgB])).id;
  episodeA = (await rpcRow<{ id: string }>(u.nurseA, "insert into care_episodes (organization_id, patient_id, title, discharge_date) values ($1, $2, 'Appendectomy', '2026-11-01') returning id", [orgA, patientA])).id;
  episodeB = (await rpcRow<{ id: string }>(u.ownerB, "insert into care_episodes (organization_id, patient_id, title) values ($1, $2, 'Knee surgery') returning id", [orgB, patientB])).id;
  docA = await makeDocument(u.nurseA, orgA, patientA, episodeA);

  const created = await rpcRow<{ plan_id: string; version_id: string }>(u.nurseA, "select * from create_recovery_plan($1, 'Recovery plan', $2::jsonb)", [episodeA, BUNDLE]);
  planA = created.plan_id;
  versionA1 = created.version_id;
  planB = (await rpcRow<{ plan_id: string }>(u.ownerB, "select * from create_recovery_plan($1, 'Plan B', $2::jsonb)", [episodeB, BUNDLE])).plan_id;
}, 120_000);

afterAll(async () => {
  await t?.close();
});

describe("organizations and staff", () => {
  it("creates the owner membership and a trial subscription atomically", async () => {
    const rows = await t.as(u.ownerA, () => t.q<{ role: string; clinical_reviewer: boolean }>("select role, clinical_reviewer from organization_memberships where organization_id = $1 and user_id = $2", [orgA, u.ownerA]));
    expect(rows).toEqual([{ role: "owner", clinical_reviewer: true }]);
    const sub = await t.as(u.ownerA, () => t.q<{ plan: string; status: string }>("select plan, status from subscriptions where organization_id = $1", [orgA]));
    expect(sub).toEqual([{ plan: "starter", status: "trialing" }]);
  });

  it("nobody can join a clinic by knowing its id: no direct inserts into memberships", async () => {
    await rejects(
      t.as(u.outsider, () => t.q("insert into organization_memberships (organization_id, user_id, role) values ($1, $2, 'owner')", [orgA, u.outsider])),
      /row-level security|violates/,
    );
    await rejects(t.as(u.outsider, () => t.q("insert into organizations (name, slug) values ('Fake', 'fake-org')")), /row-level security/);
  });

  it("staff invitations: email must match, are single-use and expire", async () => {
    const inv = await rpcRow<{ token: string }>(u.ownerA, "select * from create_staff_invitation($1, 'second-nurse@clinic-a.test', 'nurse', false)", [orgA]);
    await rejects(t.as(u.outsider, () => t.q("select accept_staff_invitation($1, null)", [inv.token])), "invitation_email_mismatch");
    const nurse2 = await t.createUser("second-nurse@clinic-a.test");
    await t.as(nurse2, () => t.q("select accept_staff_invitation($1, null)", [inv.token]));
    await rejects(t.as(nurse2, () => t.q("select accept_staff_invitation($1, null)", [inv.token])), "invitation_used");

    const expiring = await rpcRow<{ token: string; invitation_id: string }>(u.ownerA, "select * from create_staff_invitation($1, 'late@clinic-a.test', 'nurse', false)", [orgA]);
    await t.q("update staff_invitations set expires_at = now() - interval '1 minute' where id = $1", [expiring.invitation_id]);
    const late = await t.createUser("late@clinic-a.test");
    await rejects(t.as(late, () => t.q("select accept_staff_invitation($1, null)", [expiring.token])), "invitation_expired");
    await rejects(t.as(late, () => t.q("select accept_staff_invitation($1, null)", ["not-a-real-token"])), "invitation_invalid");
  });

  it("stores only a SHA-256 hash of invitation tokens", async () => {
    const inv = await rpcRow<{ token: string; invitation_id: string }>(u.ownerA, "select * from create_staff_invitation($1, 'hash-check@clinic-a.test', 'nurse', false)", [orgA]);
    const [row] = await t.q<{ token_hash: string }>("select token_hash from staff_invitations where id = $1", [inv.invitation_id]);
    expect(row.token_hash).toMatch(/^[0-9a-f]{64}$/);
    expect(row.token_hash).not.toContain(inv.token);
    expect(inv.token).toMatch(/^[0-9a-f]{64}$/);
  });

  it("a nurse cannot perform administrator operations", async () => {
    await rejects(t.as(u.nurseA, () => t.q("select * from create_staff_invitation($1, 'x@clinic-a.test', 'nurse', false)", [orgA])), "forbidden");
    await rejects(t.as(u.nurseA, () => t.q("select update_member($1, 'admin', null, null)", [nurseMembership])), "not_found");
    await rejects(t.as(u.nurseA, () => t.q("update clinic_patients set status = 'archived' where id = $1", [patientA])), "forbidden");
    expect(await t.as(u.nurseA, () => t.q("select id from audit_logs where organization_id = $1", [orgA]))).toEqual([]);
    expect(await t.as(u.nurseA, () => t.q("select id from staff_invitations where organization_id = $1", [orgA]))).toEqual([]);
    const updated = await t.as(u.nurseA, () => t.q("update organizations set name = 'Hijacked' where id = $1 returning id", [orgA]));
    expect(updated).toEqual([]);
  });

  it("an admin cannot promote anyone to admin or touch the owner; only the owner can", async () => {
    const clinicianMembership = (await t.q<{ id: string }>("select id from organization_memberships where user_id = $1", [u.clinicianA]))[0].id;
    await rejects(t.as(u.adminA, () => t.q("select update_member($1, 'admin', null, null)", [clinicianMembership])), "forbidden");
    const ownerMembership = (await t.q<{ id: string }>("select id from organization_memberships where user_id = $1 and organization_id = $2", [u.ownerA, orgA]))[0].id;
    await rejects(t.as(u.adminA, () => t.q("select update_member($1, null, null, 'revoked')", [ownerMembership])), "forbidden");
    await rejects(t.as(u.ownerA, () => t.q("select update_member($1, null, null, 'revoked')", [ownerMembership])), "cannot_change_self");
  });
});

describe("tenant isolation (Clinic A vs Clinic B)", () => {
  it("Clinic A cannot list Clinic B patients", async () => {
    const rows = await t.as(u.ownerA, () => t.q<{ id: string }>("select id from clinic_patients"));
    expect(rows.map((r) => r.id)).toEqual([patientA]);
    expect(await t.as(u.nurseA, () => t.q("select id from clinic_patients where id = $1", [patientB]))).toEqual([]);
  });

  it("Clinic A cannot retrieve Clinic B documents, episodes, plans or versions", async () => {
    const docB = await makeDocument(u.ownerB, orgB, patientB, episodeB);
    for (const [table, id] of [["clinic_documents", docB], ["care_episodes", episodeB], ["recovery_plans", planB]] as const) {
      expect(await t.as(u.clinicianA, () => t.q(`select id from ${table} where id = $1`, [id])), table).toEqual([]);
    }
    expect(await t.as(u.ownerA, () => t.q("select id from plan_versions where plan_id = $1", [planB]))).toEqual([]);
  });

  it("Clinic A cannot modify Clinic B patient records (0 rows affected)", async () => {
    const res = await t.as(u.ownerA, () => t.q("update clinic_patients set full_name = 'Tampered' where id = $1 returning id", [patientB]));
    expect(res).toEqual([]);
    expect((await t.q<{ full_name: string }>("select full_name from clinic_patients where id = $1", [patientB]))[0].full_name).toBe("Synthetic Patient B");
  });

  it("Clinic A cannot create records inside Clinic B or point at B's patients", async () => {
    await rejects(t.as(u.nurseA, () => t.q("insert into clinic_patients (organization_id, full_name, date_of_birth) values ($1, 'Intruder', '1990-01-01')", [orgB])), /row-level security/);
    // Composite foreign keys: an A-owned episode cannot reference a B patient.
    await rejects(t.as(u.nurseA, () => t.q("insert into care_episodes (organization_id, patient_id, title) values ($1, $2, 'Cross-tenant')", [orgA, patientB])), /foreign key|violates/);
    await rejects(t.as(u.nurseA, () => t.q("select * from create_recovery_plan($1, 'x', '{}'::jsonb)", [episodeB])), "not_found");
  });

  it("Clinic A cannot approve Clinic B recovery plans", async () => {
    const vB = (await t.q<{ id: string }>("select id from plan_versions where plan_id = $1", [planB]))[0].id;
    await t.as(u.ownerB, () => t.q("select submit_plan_version($1)", [vB]));
    await rejects(t.as(u.clinicianA, () => t.q("select decide_plan_version($1, 'approved', null)", [vB])), "not_found");
    expect((await t.q<{ status: string }>("select status from plan_versions where id = $1", [vB]))[0].status).toBe("pending_review");
  });

  it("tenant columns cannot be moved to another organization", async () => {
    await rejects(t.as(u.ownerA, () => t.q("update clinic_patients set organization_id = $1 where id = $2", [orgB, patientA])), "immutable_column");
    await rejects(t.as(u.nurseA, () => t.q("update clinic_documents set patient_id = $1 where id = $2", [patientB, docA])), "immutable_column");
  });

  it("storage: staff can only write and read objects under their own clinic folder", async () => {
    const bucket = "medical-documents";
    const ownPath = `clinic/${orgA}/${patientA}/${docA}.pdf`;
    const foreignPath = `clinic/${orgB}/${patientB}/${crypto.randomUUID()}.pdf`;
    await t.as(u.nurseA, () => t.q("insert into storage.objects (bucket_id, name) values ($1, $2)", [bucket, ownPath]));
    await rejects(t.as(u.nurseA, () => t.q("insert into storage.objects (bucket_id, name) values ($1, $2)", [bucket, foreignPath])), /row-level security/);
    await t.q("insert into storage.objects (bucket_id, name) values ($1, $2)", [bucket, foreignPath]);
    expect(await t.as(u.ownerA, () => t.q("select name from storage.objects where name = $1", [foreignPath]))).toEqual([]);
    expect(await t.as(u.ownerB, () => t.q("select name from storage.objects where name = $1", [ownPath]))).toEqual([]);
    // Malformed paths never match (and never error).
    expect(await t.as(u.ownerA, () => t.q("select name from storage.objects where name = 'clinic/not-a-uuid/x.pdf'"))).toEqual([]);
    // Only owners/admins delete stored files.
    expect(await t.as(u.nurseA, () => t.q("delete from storage.objects where name = $1 returning name", [ownPath]))).toEqual([]);
  });
});

describe("clinical review", () => {
  it("only a clinical reviewer can approve; nurses and patients cannot", async () => {
    await t.as(u.nurseA, () => t.q("select submit_plan_version($1)", [versionA1]));
    await rejects(t.as(u.nurseA, () => t.q("select decide_plan_version($1, 'approved', null)", [versionA1])), "forbidden");
    await rejects(t.as(u.patientA, () => t.q("select decide_plan_version($1, 'approved', null)", [versionA1])), "not_found");
    await rejects(t.as(u.clinicianA, () => t.q("select decide_plan_version($1, 'rejected', '  ')", [versionA1])), "comment_required");
  });

  it("status cannot be forced by a direct update, and submitted versions are locked", async () => {
    await rejects(t.as(u.clinicianA, () => t.q("update plan_versions set status = 'approved' where id = $1", [versionA1])), "immutable_column");
    await rejects(t.as(u.clinicianA, () => t.q("update plan_versions set bundle = '{}'::jsonb where id = $1", [versionA1])), "version_locked");
    await rejects(t.as(u.clinicianA, () => t.q("update recovery_plans set approved_version_id = $1 where id = $2", [versionA1, planA])), "immutable_column");
  });

  it("approval is attributable and makes the version visible to the plan", async () => {
    await t.as(u.clinicianA, () => t.q("select decide_plan_version($1, 'approved', 'Checked against discharge summary')", [versionA1]));
    const [approval] = await t.as(u.ownerA, () =>
      t.q<{ clinician_user_id: string; decision: string; version: number; clinician_name: string }>("select clinician_user_id, decision, version, clinician_name from clinical_approvals where version_id = $1", [versionA1]),
    );
    expect(approval).toMatchObject({ clinician_user_id: u.clinicianA, decision: "approved", version: 1, clinician_name: "Synthetic clinician" });
    expect((await t.q<{ approved_version_id: string }>("select approved_version_id from recovery_plans where id = $1", [planA]))[0].approved_version_id).toBe(versionA1);
    await rejects(t.as(u.clinicianA, () => t.q("select decide_plan_version($1, 'approved', null)", [versionA1])), "invalid_transition");
  });

  it("approved versions are immutable even for the database owner role path", async () => {
    await rejects(t.q("update plan_versions set bundle = '{}'::jsonb where id = $1", [versionA1]), "version_locked");
  });
});

describe("patient invitations and access", () => {
  let token: string;

  it("an invitation needs an approved plan and stores only a hash", async () => {
    const otherPatient = (await rpcRow<{ id: string }>(u.nurseA, "insert into clinic_patients (organization_id, full_name, date_of_birth) values ($1, 'No Plan Yet', '1999-09-09') returning id", [orgA])).id;
    await rejects(t.as(u.nurseA, () => t.q("select * from create_patient_invitation($1)", [otherPatient])), "no_approved_plan");
    const inv = await rpcRow<{ token: string; invitation_id: string }>(u.nurseA, "select * from create_patient_invitation($1)", [patientA]);
    token = inv.token;
    const [row] = await t.q<{ token_hash: string }>("select token_hash from patient_invitations where id = $1", [inv.invitation_id]);
    expect(row.token_hash).not.toBe(token);
  });

  it("a patient cannot read anything before redeeming", async () => {
    expect(await t.as(u.patientA, () => t.q("select id from clinic_patients"))).toEqual([]);
    expect(await t.as(u.patientA, () => t.q("select id from plan_versions"))).toEqual([]);
  });

  it("identity verification: wrong date of birth fails and is counted", async () => {
    const res = await rpcRow<{ r: { ok: boolean; reason: string } }>(u.patientA, "select redeem_patient_invitation($1, '1980-05-02') as r", [token]);
    expect(res.r).toEqual({ ok: false, reason: "verification_failed" });
    expect((await t.q<{ failed_attempts: number }>("select failed_attempts from patient_invitations where token_hash = encode(sha256(convert_to($1, 'UTF8')), 'hex')", [token]))[0].failed_attempts).toBe(1);
  });

  it("redeems with the correct date of birth and links the account", async () => {
    const res = await rpcRow<{ r: { ok: boolean } }>(u.patientA, "select redeem_patient_invitation($1, '1980-05-01') as r", [token]);
    expect(res.r.ok).toBe(true);
    const again = await rpcRow<{ r: { ok: boolean; already: boolean } }>(u.patientA, "select redeem_patient_invitation($1, '1980-05-01') as r", [token]);
    expect(again.r).toMatchObject({ ok: true, already: true }); // idempotent retry, no duplicate access
  });

  it("a reused invitation cannot give a second account access", async () => {
    const res = await rpcRow<{ r: { ok: boolean; reason: string } }>(u.outsider, "select redeem_patient_invitation($1, '1980-05-01') as r", [token]);
    expect(res.r).toEqual({ ok: false, reason: "invitation_used" });
    expect(await t.as(u.outsider, () => t.q("select id from clinic_patients"))).toEqual([]);
  });

  it("expired invitations cannot be redeemed; five failures lock an invitation", async () => {
    const p = (await rpcRow<{ id: string }>(u.ownerB, "select id from clinic_patients where id = $1", [patientB])).id;
    const vB = (await t.q<{ id: string }>("select id from plan_versions where plan_id = $1", [planB]))[0].id;
    await t.q("update organization_memberships set clinical_reviewer = true where user_id = $1", [u.ownerB]);
    await t.as(u.ownerB, () => t.q("select decide_plan_version($1, 'approved', null)", [vB]));
    const inv = await rpcRow<{ token: string; invitation_id: string }>(u.ownerB, "select * from create_patient_invitation($1)", [p]);
    await t.q("update patient_invitations set expires_at = now() - interval '1 second' where id = $1", [inv.invitation_id]);
    expect((await rpcRow<{ r: { reason: string } }>(u.patientB, "select redeem_patient_invitation($1, '1975-02-02') as r", [inv.token])).r.reason).toBe("invitation_expired");

    const fresh = await rpcRow<{ token: string }>(u.ownerB, "select * from create_patient_invitation($1)", [p]);
    for (let i = 0; i < 4; i++) await t.as(u.patientB, () => t.q("select redeem_patient_invitation($1, '2000-01-01')", [fresh.token]));
    expect((await rpcRow<{ r: { reason: string } }>(u.patientB, "select redeem_patient_invitation($1, '2000-01-01') as r", [fresh.token])).r.reason).toBe("invitation_locked");
    expect((await rpcRow<{ r: { reason: string } }>(u.patientB, "select redeem_patient_invitation($1, '1975-02-02') as r", [fresh.token])).r.reason).toBe("invitation_invalid");

    const last = await rpcRow<{ token: string }>(u.ownerB, "select * from create_patient_invitation($1)", [p]);
    expect((await rpcRow<{ r: { ok: boolean } }>(u.patientB, "select redeem_patient_invitation($1, '1975-02-02') as r", [last.token])).r.ok).toBe(true);
  });

  it("a patient sees only their own approved plan, never drafts or other patients", async () => {
    const versions = await t.as(u.patientA, () => t.q<{ id: string }>("select id from plan_versions"));
    expect(versions.map((v) => v.id)).toEqual([versionA1]);
    expect((await t.as(u.patientA, () => t.q<{ id: string }>("select id from clinic_patients"))).map((r) => r.id)).toEqual([patientA]);
    expect(await t.as(u.patientA, () => t.q("select id from recovery_plans where id = $1", [planB]))).toEqual([]);
    expect(await t.as(u.patientB, () => t.q("select id from plan_versions where id = $1", [versionA1]))).toEqual([]);
    // Unshared documents stay hidden from the patient.
    expect(await t.as(u.patientA, () => t.q("select id from clinic_documents"))).toEqual([]);
    // The patient can read the clinic's contact details but not other clinics.
    expect((await t.as(u.patientA, () => t.q<{ id: string }>("select id from organizations"))).map((r) => r.id)).toEqual([orgA]);
  });

  it("a patient cannot modify approved instructions, their own record link, or plans", async () => {
    expect(await t.as(u.patientA, () => t.q("update plan_versions set bundle = '{}'::jsonb where id = $1 returning id", [versionA1]))).toEqual([]);
    expect(await t.as(u.patientA, () => t.q("update clinic_patients set full_name = 'X' where id = $1 returning id", [patientA]))).toEqual([]);
    await rejects(t.as(u.patientA, () => t.q("insert into plan_versions (organization_id, plan_id, version, bundle) values ($1, $2, 99, '{}')", [orgA, planA])), /row-level security/);
  });

  it("a patient can record completion only in their own approved version", async () => {
    await t.as(u.patientA, () =>
      t.q("insert into patient_progress (organization_id, patient_id, version_id, item_kind, item_id, action, user_id) values ($1, $2, $3, 'task', 't1', 'completed', $4)", [orgA, patientA, versionA1, u.patientA]),
    );
    await rejects(
      t.as(u.patientB, () =>
        t.q("insert into patient_progress (organization_id, patient_id, version_id, item_kind, item_id, action, user_id) values ($1, $2, $3, 'task', 't1', 'acknowledged', $4)", [orgA, patientA, versionA1, u.patientB]),
      ),
      /row-level security/,
    );
    expect((await t.as(u.nurseA, () => t.q("select id from patient_progress where patient_id = $1", [patientA]))).length).toBe(1);
  });

  it("documents are visible to the patient only once explicitly shared by a clinician or admin", async () => {
    await rejects(t.as(u.nurseA, () => t.q("update clinic_documents set shared_with_patient = true where id = $1", [docA])), "forbidden");
    await t.q("update clinic_documents set processing_status = 'processed' where id = $1", [docA]);
    await t.as(u.clinicianA, () => t.q("update clinic_documents set shared_with_patient = true where id = $1", [docA]));
    expect((await t.as(u.patientA, () => t.q<{ id: string }>("select id from clinic_documents"))).map((d) => d.id)).toEqual([docA]);
    const path = `clinic/${orgA}/${patientA}/${docA}.pdf`;
    expect((await t.as(u.patientA, () => t.q("select name from storage.objects where name = $1", [path]))).length).toBe(1);
    expect(await t.as(u.patientB, () => t.q("select name from storage.objects where name = $1", [path]))).toEqual([]);
  });

  it("follow-ups: patient reports, staff verifies, and the two stay distinct", async () => {
    await t.as(u.patientA, () => t.q("select report_follow_up($1, 'fu-1', 'reported_attended', 'I went')", [planA]));
    await rejects(t.as(u.patientA, () => t.q("select verify_follow_up($1, 'fu-1', 'verified_attended', null)", [planA])), "not_found");
    await rejects(t.as(u.patientB, () => t.q("select report_follow_up($1, 'fu-1', 'reported_missed', null)", [planA])), "not_found");
    await rejects(t.as(u.patientA, () => t.q("select report_follow_up($1, 'unknown-item', 'reported_missed', null)", [planA])), "not_found");
    let [row] = await t.as(u.nurseA, () => t.q<{ patient_status: string; staff_status: string }>("select patient_status, staff_status from follow_up_tracking where plan_id = $1", [planA]));
    expect(row).toEqual({ patient_status: "reported_attended", staff_status: "unverified" });
    await t.as(u.nurseA, () => t.q("select verify_follow_up($1, 'fu-1', 'verified_attended', null)", [planA]));
    [row] = await t.as(u.nurseA, () => t.q<{ patient_status: string; staff_status: string }>("select patient_status, staff_status from follow_up_tracking where plan_id = $1", [planA]));
    expect(row).toEqual({ patient_status: "reported_attended", staff_status: "verified_attended" });
  });
});

describe("versioning", () => {
  it("changing an approved plan creates a new draft; the patient keeps seeing the approved one until re-approval", async () => {
    const v2 = (await rpcRow<{ id: string }>(u.clinicianA, "select revise_plan($1) as id", [planA])).id;
    await rejects(t.as(u.clinicianA, () => t.q("select revise_plan($1)", [planA])), "version_in_progress");
    await t.as(u.clinicianA, () => t.q("update plan_versions set bundle = jsonb_set(bundle, '{plan,title}', '\"Revised\"') where id = $1", [v2]));
    expect((await t.as(u.patientA, () => t.q<{ id: string }>("select id from plan_versions"))).map((r) => r.id)).toEqual([versionA1]);

    await t.as(u.clinicianA, () => t.q("select submit_plan_version($1)", [v2]));
    await t.as(u.ownerA, () => t.q("select decide_plan_version($1, 'approved', null)", [v2])); // owner flagged as clinical reviewer
    expect((await t.as(u.patientA, () => t.q<{ id: string }>("select id from plan_versions"))).map((r) => r.id)).toEqual([v2]);
    expect((await t.q<{ status: string }>("select status from plan_versions where id = $1", [versionA1]))[0].status).toBe("superseded");
  });

  it("withdrawing approval hides the plan from the patient", async () => {
    await rejects(t.as(u.nurseA, () => t.q("select revoke_plan_approval($1, 'error found')", [planA])), "forbidden");
    await t.as(u.clinicianA, () => t.q("select revoke_plan_approval($1, 'Dose transcription error found')", [planA]));
    expect(await t.as(u.patientA, () => t.q("select id from plan_versions"))).toEqual([]);
  });
});

describe("questions", () => {
  it("patient asks, staff of the same clinic respond, other clinics see nothing", async () => {
    const q = (await rpcRow<{ id: string }>(u.patientB, "select submit_patient_question($1, null, 'Dressing question', 'When can I shower?', false) as id", [patientB])).id;
    await rejects(t.as(u.patientA, () => t.q("select submit_patient_question($1, null, 'Not mine', 'x', false)", [patientB])), "not_found");
    expect(await t.as(u.ownerA, () => t.q("select id from patient_questions where id = $1", [q]))).toEqual([]);
    await rejects(t.as(u.ownerA, () => t.q("select add_question_message($1, 'hello')", [q])), "not_found");
    await t.as(u.ownerB, () => t.q("select add_question_message($1, 'Please keep it dry for 48 hours as documented.')", [q]));
    const msgs = await t.as(u.patientB, () => t.q<{ author_kind: string }>("select author_kind from question_messages where question_id = $1 order by created_at", [q]));
    expect(msgs.map((m) => m.author_kind)).toEqual(["patient", "staff"]);
    expect((await t.q<{ status: string }>("select status from patient_questions where id = $1", [q]))[0].status).toBe("responded");
    expect(await t.as(u.patientA, () => t.q("select id from question_messages where question_id = $1", [q]))).toEqual([]);
  });
});

describe("draft edits are attributed (audit regression)", () => {
  it("a direct Data API edit by a nurse is stamped and audited, and the stamp cannot be forged", async () => {
    const ep = (await rpcRow<{ id: string }>(u.ownerA, "insert into care_episodes (organization_id, patient_id, title) values ($1, $2, 'Attribution episode') returning id", [orgA, patientA])).id;
    const v = (await rpcRow<{ version_id: string }>(u.ownerA, "select * from create_recovery_plan($1, 'Attribution plan', $2::jsonb)", [ep, BUNDLE])).version_id;
    const nurse2 = await acceptStaff(orgA, u.ownerA, `attr-nurse-${Date.now()}@clinic-a.test`, "nurse", false);
    await t.as(nurse2, () => t.q("update plan_versions set bundle = jsonb_set(bundle, '{plan,title}', '\"Edited by nurse\"') where id = $1", [v]));
    const [row] = await t.q<{ last_edited_by: string }>("select last_edited_by from plan_versions where id = $1", [v]);
    expect(row.last_edited_by).toBe(nurse2);
    const audit = await t.q<{ actor_user_id: string; metadata: { role: string } }>("select actor_user_id, metadata from audit_logs where action = 'plan.content_changed' and resource_id = $1", [v]);
    expect(audit.at(-1)).toMatchObject({ actor_user_id: nurse2, metadata: { role: "nurse" } });
    await rejects(t.as(nurse2, () => t.q("update plan_versions set last_edited_by = $1 where id = $2", [u.clinicianA, v])), "immutable_column");
  });
});

describe("account deletion (audit regression)", () => {
  it("a linked patient can delete their account; the clinic keeps the record, unlinked", async () => {
    const user = await t.createUser(`deleting-patient-${Date.now()}@example.test`);
    await t.q("update organization_memberships set clinical_reviewer = true where user_id = $1", [u.ownerB]);
    const p = (await rpcRow<{ id: string }>(u.ownerB, "insert into clinic_patients (organization_id, full_name, date_of_birth) values ($1, 'Deleting Patient', '1970-01-01') returning id", [orgB])).id;
    const ep = (await rpcRow<{ id: string }>(u.ownerB, "insert into care_episodes (organization_id, patient_id, title) values ($1, $2, 'Synthetic episode') returning id", [orgB, p])).id;
    const v = (await rpcRow<{ version_id: string }>(u.ownerB, "select * from create_recovery_plan($1, 'Plan', $2::jsonb)", [ep, BUNDLE])).version_id;
    await t.as(u.ownerB, () => t.q("select submit_plan_version($1)", [v]));
    await t.as(u.ownerB, () => t.q("select decide_plan_version($1, 'approved', null)", [v]));
    const inv = await rpcRow<{ token: string }>(u.ownerB, "select * from create_patient_invitation($1)", [p]);
    expect((await rpcRow<{ r: { ok: boolean } }>(user, "select redeem_patient_invitation($1, '1970-01-01') as r", [inv.token])).r.ok).toBe(true);

    await t.q("delete from auth.users where id = $1", [user]); // what auth.admin.deleteUser does
    const [row] = await t.q<{ user_id: string | null }>("select user_id from clinic_patients where id = $1", [p]);
    expect(row.user_id).toBeNull();
  });
});

describe("revocation, unauthenticated access, audit and entitlements", () => {
  it("a revoked staff member loses access immediately", async () => {
    await t.as(u.ownerA, () => t.q("select update_member($1, null, null, 'revoked')", [nurseMembership]));
    expect(await t.as(u.nurseA, () => t.q("select id from clinic_patients"))).toEqual([]);
    await rejects(t.as(u.nurseA, () => t.q("insert into clinic_patients (organization_id, full_name, date_of_birth) values ($1, 'After revoke', '1990-01-01')", [orgA])), /row-level security/);
    await rejects(t.as(u.nurseA, () => t.q("select * from create_patient_invitation($1)", [patientA])), "not_found");
  });

  it("an unauthenticated user cannot read or call anything", async () => {
    await rejects(t.as(null, () => t.q("select id from clinic_patients")), "permission denied");
    await rejects(t.as(null, () => t.q("select id from plan_versions")), "permission denied");
    await rejects(t.as(null, () => t.q("select create_organization('x', 'xx-x', 'clinic', null, null, null, null, false)")), "permission denied");
    await rejects(t.as(null, () => t.q("select redeem_patient_invitation('x', '2000-01-01')")), "permission denied");
  });

  it("audit logs record key events, are visible to owners/admins only, and cannot be altered", async () => {
    const actions = (await t.as(u.ownerA, () => t.q<{ action: string }>("select action from audit_logs where organization_id = $1", [orgA]))).map((r) => r.action);
    for (const a of ["organization.created", "staff.invited", "staff.joined", "plan.created", "plan.submitted", "plan.approved", "plan.revised", "invitation.created", "invitation.redeemed", "invitation.verification_failed", "staff.revoked", "plan.approval_revoked"]) {
      expect(actions, a).toContain(a);
    }
    expect(await t.as(u.ownerA, () => t.q("update audit_logs set action = 'x.y' where organization_id = $1 returning id", [orgA]))).toEqual([]);
    expect(await t.as(u.ownerA, () => t.q("delete from audit_logs where organization_id = $1 returning id", [orgA]))).toEqual([]);
    await rejects(t.as(u.ownerA, () => t.q("insert into audit_logs (organization_id, action, resource_type) values ($1, 'plan.approved', 'x')", [orgA])), /row-level security/);
    // The API may log only allow-listed operational events.
    await rejects(t.as(u.ownerA, () => t.q("select log_clinic_event($1, 'plan.approved', 'x', null, '{}')", [orgA])), "invalid_action");
    expect(await t.as(u.ownerB, () => t.q("select id from audit_logs where organization_id = $1", [orgA]))).toEqual([]);
  });

  it("notifications: recipients see their own, can mark read, but cannot rewrite them", async () => {
    const mine = await t.as(u.patientA, () => t.q<{ id: string; type: string }>("select id, type from notifications"));
    expect(mine.some((n) => n.type === "plan_approved")).toBe(true);
    await t.as(u.patientA, () => t.q("update notifications set read_at = now() where id = $1", [mine[0].id]));
    await rejects(t.as(u.patientA, () => t.q("update notifications set title = 'phish' where id = $1", [mine[0].id])), "immutable_column");
    expect(await t.as(u.patientB, () => t.q("select id from notifications where id = $1", [mine[0].id]))).toEqual([]);
  });

  it("subscription state is enforced in the database and cannot be changed by members", async () => {
    expect(await t.as(u.ownerA, () => t.q("update subscriptions set status = 'active', plan = 'enterprise' where organization_id = $1 returning plan", [orgA]))).toEqual([]);
    await t.q("update subscriptions set status = 'suspended' where organization_id = $1", [orgA]);
    await rejects(t.as(u.ownerA, () => t.q("insert into clinic_patients (organization_id, full_name, date_of_birth) values ($1, 'Blocked', '1990-01-01')", [orgA])), "subscription_inactive");
    await t.q("update subscriptions set status = 'trialing', trial_ends_at = now() - interval '1 day' where organization_id = $1", [orgA]);
    await rejects(t.as(u.ownerA, () => t.q("insert into clinic_patients (organization_id, full_name, date_of_birth) values ($1, 'Blocked', '1990-01-01')", [orgA])), "subscription_inactive");
    await t.q("update subscriptions set status = 'active', trial_ends_at = null where organization_id = $1", [orgA]);
    const ent = await rpcRow<{ e: { plan: string; active: boolean; usage: { active_patients: number } } }>(u.ownerA, "select organization_entitlements($1) as e", [orgA]);
    expect(ent.e).toMatchObject({ plan: "starter", active: true });
    expect(ent.e.usage.active_patients).toBeGreaterThan(0);
    await rejects(t.as(u.ownerB, () => t.q("select organization_entitlements($1)", [orgA])), "not_found");
  });

  it("plan limits are enforced", async () => {
    await t.q("update subscriptions set plan = 'starter' where organization_id = $1", [orgB]);
    const [{ n }] = await t.q<{ n: number }>("select count(*)::int as n from clinic_patients where organization_id = $1 and status = 'active'", [orgB]);
    await t.q(
      "insert into clinic_patients (organization_id, full_name, date_of_birth) select $1, 'Bulk ' || g, '1990-01-01' from generate_series(1, $2::int) g",
      [orgB, 50 - n],
    );
    await rejects(t.as(u.ownerB, () => t.q("insert into clinic_patients (organization_id, full_name, date_of_birth) values ($1, 'One too many', '1990-01-01')", [orgB])), "plan_limit_reached");
  });
});
