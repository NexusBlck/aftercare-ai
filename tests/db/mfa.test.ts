import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createTestDb, rejects, type TestDb } from "./harness";

/**
 * Two-factor rules for clinic staff, enforced by the database (migration 0004): RLS, the clinic RPCs
 * and the clinic setting. Synthetic data only.
 */

let t: TestDb;
let owner: string;
let nurse: string;
let patientUser: string;
let org: string;

async function patientsVisibleTo(userId: string, aal: "aal1" | "aal2" = "aal1") {
  return t.as(userId, () => t.q("select id from clinic_patients where organization_id = $1", [org]), { aal });
}

beforeAll(async () => {
  t = await createTestDb();
  owner = await t.createUser("owner@mfa-clinic.test");
  nurse = await t.createUser("nurse@mfa-clinic.test");
  patientUser = await t.createUser("patient@example.test");
  org = (await t.as(owner, () => t.q<{ id: string }>("select create_organization('MFA Clinic', 'mfa-clinic', 'clinic', null, null, 'Lahore', 'Dr Owner', true) as id")))[0].id;
  const inv = (await t.as(owner, () => t.q<{ token: string }>("select * from create_staff_invitation($1, 'nurse@mfa-clinic.test', 'nurse', false)", [org])))[0];
  await t.as(nurse, () => t.q("select accept_staff_invitation($1, 'Nurse')", [inv.token]));
  await (t.as(nurse, () => t.q<{ id: string }>("insert into clinic_patients (organization_id, full_name, date_of_birth) values ($1, 'Synthetic Patient', '1980-05-01') returning id", [org])));
}, 120_000);

afterAll(async () => {
  await t?.close();
});

describe("two-factor for clinic staff", () => {
  it("staff without two-factor keep working while the clinic does not require it", async () => {
    expect(await patientsVisibleTo(nurse)).toHaveLength(1);
  });

  it("an unverified (abandoned) set-up does not lock anyone out", async () => {
    await t.addFactor(nurse, "unverified");
    expect(await patientsVisibleTo(nurse)).toHaveLength(1);
  });

  it("requiring two-factor for the clinic needs a two-factor session first", async () => {
    await rejects(t.as(owner, () => t.q("update organizations set require_mfa = true where id = $1", [org])), "mfa_required_first");
  });

  it("once a factor is verified, a password-only session sees nothing and cannot act", async () => {
    await t.addFactor(owner, "verified");
    expect(await patientsVisibleTo(owner, "aal1")).toHaveLength(0);
    await rejects(t.as(owner, () => t.q("select * from create_staff_invitation($1, 'x@mfa-clinic.test', 'nurse', false)", [org])));
    const changed = await t.as(owner, () => t.q("update organizations set city = 'Elsewhere' where id = $1 returning id", [org]));
    expect(changed).toHaveLength(0);
    // ...but can still see which clinic they belong to, to be told why.
    expect(await t.as(owner, () => t.q("select name from organizations where id = $1", [org]))).toEqual([{ name: "MFA Clinic" }]);
    expect(await t.as(owner, () => t.q("select role from organization_memberships where user_id = $1", [owner]))).toEqual([{ role: "owner" }]);
  });

  it("after completing two-factor (aal2) everything works again, including requiring it for all staff", async () => {
    expect(await patientsVisibleTo(owner, "aal2")).toHaveLength(1);
    await t.as(owner, () => t.q("update organizations set require_mfa = true where id = $1", [org]), { aal: "aal2" });
    expect((await t.q<{ require_mfa: boolean }>("select require_mfa from organizations where id = $1", [org]))[0].require_mfa).toBe(true);
  });

  it("when the clinic requires it, staff without a factor are locked out until they set one up", async () => {
    expect(await patientsVisibleTo(nurse)).toHaveLength(0);
    await rejects(t.as(nurse, () => t.q("insert into clinic_patients (organization_id, full_name, date_of_birth) values ($1, 'Another', '1990-01-01')", [org])));
    await t.addFactor(nurse, "verified");
    expect(await patientsVisibleTo(nurse, "aal1")).toHaveLength(0);
    expect(await patientsVisibleTo(nurse, "aal2")).toHaveLength(1);
  });

  it("people outside the clinic still see nothing", async () => {
    expect(await t.as(patientUser, () => t.q("select name from organizations where id = $1", [org]), { aal: "aal2" })).toEqual([]);
    expect(await patientsVisibleTo(patientUser, "aal2")).toHaveLength(0);
  });
});
