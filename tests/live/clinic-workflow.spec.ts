import { readFileSync } from "node:fs";
import { join } from "node:path";
import { createClient } from "@supabase/supabase-js";
import { expect, test, type APIRequestContext, type Browser } from "@playwright/test";
import { LEGAL_VERSIONS } from "../../src/lib/legal";

/**
 * Full signed-in workflow against a disposable Supabase TEST project (see playwright.live.config.ts).
 * Synthetic accounts: Clinic A owner, clinician, nurse; Clinic B owner; Patient A; Patient B; an outsider.
 * Every run uses fresh, uniquely named accounts and clinics.
 */

const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "";
test.skip(!url || !anon || /qfpaoqacngcfstdchdqj/.test(url), "Live tests need a separate Supabase TEST project (never production).");

const RUN = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
const PASSWORD = `Synthetic-${RUN}-pw!`;
const PEOPLE = ["owner-a", "clinician-a", "nurse-a", "owner-b", "patient-a", "patient-b", "outsider"] as const;
type Person = (typeof PEOPLE)[number];
const email = (p: Person) => `${p}.${RUN}@example.com`;
const BASE = "http://localhost:3300";

interface Res<T = Record<string, unknown>> {
  status: number;
  body: T;
}

const ctx = {} as Record<Person, APIRequestContext>;
const ids = {} as Record<string, string>;

async function call<T = Record<string, unknown>>(who: Person | APIRequestContext, method: string, path: string, data?: unknown): Promise<Res<T>> {
  const c = typeof who === "string" ? ctx[who] : who;
  const res = await c.fetch(path, { method, data: data === undefined ? undefined : data });
  let body: unknown = null;
  try {
    body = await res.json();
  } catch {
    body = null;
  }
  return { status: res.status(), body: body as T };
}

const tokenOf = (link: string) => new URL(link).hash.replace("#t=", "");

async function browserAs(browser: Browser, who: Person) {
  const state = await ctx[who].storageState();
  state.origins = [{ origin: BASE, localStorage: [{ name: "aftercare.cookie-notice", value: "1" }] }];
  return browser.newContext({ storageState: state, viewport: { width: 1440, height: 900 } });
}

test.describe.serial("clinic portal — live signed-in workflow", () => {
  test.beforeAll(async ({ playwright }) => {
    const supabase = createClient(url, anon, { auth: { persistSession: false } });
    for (const p of PEOPLE) {
      const { data, error } = await supabase.auth.signUp({
        email: email(p),
        password: PASSWORD,
        options: { data: { legal: LEGAL_VERSIONS, age_confirmed: true, marketing_opt_in: false } },
      });
      if (error) throw new Error(`sign-up failed for ${p}: ${error.message}`);
      if (!data.session) throw new Error("The test project still requires email confirmation; turn it off for the test project.");
      ctx[p] = await playwright.request.newContext({ baseURL: BASE });
      const login = await call(p, "POST", "/api/auth/login", { email: email(p), password: PASSWORD });
      if (login.status !== 200) throw new Error(`login failed for ${p}: ${login.status} ${JSON.stringify(login.body)}`);
    }
  });

  test.afterAll(async () => {
    for (const c of Object.values(ctx)) await c.dispose();
  });

  test("1. clinic onboarding: owners create their clinics (A through the API, B through the UI)", async ({ browser }) => {
    expect((await call("owner-a", "GET", "/api/clinic/me")).body).toMatchObject({ memberships: [], active: null });
    const a = await call<{ organization_id: string }>("owner-a", "POST", "/api/clinic/organization", {
      name: `Synthetic Clinic A ${RUN}`,
      org_type: "clinic",
      city: "Lahore",
      owner_name: "Owner A (synthetic)",
      owner_is_clinician: false,
    });
    expect(a.status).toBe(201);
    ids.orgA = a.body.organization_id;

    const page = await (await browserAs(browser, "owner-b")).newPage();
    await page.goto("/clinic/register");
    await expect(page.getByRole("heading", { name: /Your clinic/ })).toBeVisible();
    await page.getByLabel(/Clinic or hospital name/).fill(`Synthetic Hospital B ${RUN}`);
    await page.getByLabel(/^Your name/).fill("Dr Owner B (synthetic)");
    await page.getByText("I am a licensed clinician").click();
    await page.getByRole("button", { name: "Create clinic" }).click();
    await expect(page).toHaveURL(/\/clinic\/dashboard/);
    await expect(page.getByRole("heading", { name: "Dashboard" })).toBeVisible();
    await expect(page.getByText(`Synthetic Hospital B ${RUN}`).first()).toBeVisible();
    await page.context().close();
    const meB = await call<{ active: { organization: { id: string }; member: { role: string; clinical_reviewer: boolean }; entitlements: { plan: string; status: string } } }>("owner-b", "GET", "/api/clinic/me");
    expect(meB.body.active.member).toMatchObject({ role: "owner", clinical_reviewer: true });
    expect(meB.body.active.entitlements).toMatchObject({ plan: "starter", status: "trialing" });
    ids.orgB = meB.body.active.organization.id;
  });

  test("2. staff management: invitations are email-bound and single use; roles are enforced", async () => {
    const clin = await call<{ link: string }>("owner-a", "POST", "/api/clinic/staff", { email: email("clinician-a"), role: "clinician", clinical_reviewer: true });
    const nurse = await call<{ link: string }>("owner-a", "POST", "/api/clinic/staff", { email: email("nurse-a"), role: "nurse", clinical_reviewer: false });
    expect(clin.status).toBe(201);
    expect(clin.body.link).toMatch(/\/clinic\/join#t=[0-9a-f]{64}$/);

    expect((await call("outsider", "POST", "/api/clinic/join", { token: tokenOf(clin.body.link) })).status).toBe(403);
    expect((await call("clinician-a", "POST", "/api/clinic/join", { token: tokenOf(clin.body.link), display_name: "Dr Clinician A" })).status).toBe(200);
    expect((await call("clinician-a", "POST", "/api/clinic/join", { token: tokenOf(clin.body.link) })).status).toBe(400);
    expect((await call("nurse-a", "POST", "/api/clinic/join", { token: tokenOf(nurse.body.link), display_name: "Nurse A" })).status).toBe(200);

    expect((await call("nurse-a", "POST", "/api/clinic/staff", { email: "x@example.com", role: "nurse" })).status).toBe(403);
    const staff = await call<{ members: Array<{ id: string; role: string; display_name: string }> }>("owner-a", "GET", "/api/clinic/staff");
    expect(staff.body.members.map((m) => m.role).sort()).toEqual(["clinician", "nurse", "owner"]);
    ids.nurseMembership = staff.body.members.find((m) => m.role === "nurse")!.id;
    expect((await call("nurse-a", "GET", "/api/clinic/audit")).status).toBe(403);
  });

  test("3. patient registration with duplicate detection", async () => {
    const patient = {
      full_name: "Synthetic Patient Alpha",
      date_of_birth: "1980-05-01",
      mrn: `A-${RUN}`,
      preferred_language: "en",
      consent_status: "written",
      episode: { title: "Laparoscopic appendectomy", department: "General surgery", discharge_date: "2026-11-10" },
    };
    const created = await call<{ patient: { id: string }; episode_id: string }>("nurse-a", "POST", "/api/clinic/patients", patient);
    expect(created.status).toBe(201);
    ids.patientA = created.body.patient.id;
    ids.episodeA = created.body.episode_id;
    const dup = await call<{ duplicate: boolean }>("nurse-a", "POST", "/api/clinic/patients", { ...patient, mrn: undefined, episode: undefined });
    expect(dup.status).toBe(409);
    expect(dup.body.duplicate).toBe(true);

    const b = await call<{ patient: { id: string }; episode_id: string }>("owner-b", "POST", "/api/clinic/patients", {
      full_name: "Synthetic Patient Beta",
      date_of_birth: "1975-02-02",
      episode: { title: "Knee arthroscopy" },
    });
    ids.patientB = b.body.patient.id;
    ids.episodeB = b.body.episode_id;
    const list = await call<{ patients: Array<{ id: string }>; total: number }>("clinician-a", "GET", "/api/clinic/patients?q=Alpha");
    expect(list.status, JSON.stringify(list.body)).toBe(200);
    expect(list.body.patients.map((p) => p.id)).toEqual([ids.patientA]);
  });

  test("4–5. secure upload, byte verification and AI extraction into a draft plan", async () => {
    const pdf = readFileSync(join(process.cwd(), "tests", "fixtures", "documents", "synthetic-discharge-summary.pdf"));
    const up = await call<{ document: { id: string }; uploadUrl: string; contentType: string }>("nurse-a", "POST", "/api/clinic/documents/upload", {
      episode_id: ids.episodeA,
      filename: "synthetic-discharge-summary.pdf",
      size: pdf.length,
      document_type: "discharge_summary",
    });
    expect(up.status).toBe(201);
    const put = await ctx["nurse-a"].put(up.body.uploadUrl, { data: pdf, headers: { "Content-Type": up.body.contentType, "x-upsert": "false" } });
    expect(put.ok()).toBe(true);
    expect((await call("nurse-a", "POST", `/api/clinic/documents/${up.body.document.id}/finalize`)).status).toBe(200);
    ids.docA = up.body.document.id;

    // A file whose bytes do not match its extension is rejected.
    const fake = Buffer.from("this is not a pdf");
    const bad = await call<{ document: { id: string }; uploadUrl: string; contentType: string }>("nurse-a", "POST", "/api/clinic/documents/upload", { episode_id: ids.episodeA, filename: "fake.pdf", size: fake.length });
    await ctx["nurse-a"].put(bad.body.uploadUrl, { data: fake, headers: { "Content-Type": "application/pdf", "x-upsert": "false" } });
    expect((await call("nurse-a", "POST", `/api/clinic/documents/${bad.body.document.id}/finalize`)).status).toBe(400);

    const processed = await call<{ plan_id: string; version_id: string }>("nurse-a", "POST", `/api/clinic/documents/${ids.docA}/process`);
    expect(processed.status).toBe(200);
    ids.planA = processed.body.plan_id;
    ids.versionA1 = processed.body.version_id;

    const plan = await call<{ current: { status: string; bundle: { medications: Array<{ document_id: string; source_excerpt: string | null }>; flags: Array<{ status: string }> } } }>("clinician-a", "GET", `/api/clinic/plans/${ids.planA}`);
    expect(plan.body.current.status).toBe("draft");
    expect(plan.body.current.bundle.medications.length).toBeGreaterThan(0);
    expect(plan.body.current.bundle.medications.every((m) => m.document_id === ids.docA)).toBe(true);
    // Staff can open the source document; patients and other clinics cannot.
    const file = await ctx["clinician-a"].get(`/api/clinic/documents/${ids.docA}/file`);
    expect(file.status()).toBe(200);
    expect(file.headers()["content-type"]).toBe("application/pdf");
  });

  test("6. clinical review: only reviewers edit and approve; flags must be resolved; approval is attributable", async ({ browser }) => {
    const before = await call<{ current: { updated_at: string; bundle: { flags: Array<{ id: string; status: string }> } }; readiness: unknown[] }>("clinician-a", "GET", `/api/clinic/plans/${ids.planA}`);
    // Nurses cannot edit plan content.
    expect((await call("nurse-a", "PATCH", `/api/clinic/versions/${ids.versionA1}`, { expected_updated_at: before.body.current.updated_at, edit: { op: "title", value: "x" } })).status).toBe(403);

    // A clinician adds a documented item and resolves every open flag (chained concurrency tokens).
    let token = before.body.current.updated_at;
    const add = await call<{ version: { updated_at: string } }>("clinician-a", "PATCH", `/api/clinic/versions/${ids.versionA1}`, {
      expected_updated_at: token,
      edit: { op: "add", kind: "warning_sign", fields: { sign: "Fever above 38°C (synthetic)", action: "Contact the surgical ward" } },
    });
    expect(add.status).toBe(200);
    token = add.body.version.updated_at;
    // A stale token is refused instead of overwriting.
    expect((await call("clinician-a", "PATCH", `/api/clinic/versions/${ids.versionA1}`, { expected_updated_at: before.body.current.updated_at, edit: { op: "title", value: "stale" } })).status).toBe(409);
    for (const f of before.body.current.bundle.flags.filter((x) => x.status === "open")) {
      const r = await call<{ version: { updated_at: string } }>("clinician-a", "PATCH", `/api/clinic/versions/${ids.versionA1}`, {
        expected_updated_at: token,
        edit: { op: "resolve_flag", id: f.id, note: "Checked against the synthetic source document" },
      });
      expect(r.status).toBe(200);
      token = r.body.version.updated_at;
    }

    expect((await call("nurse-a", "POST", `/api/clinic/versions/${ids.versionA1}/submit`)).status).toBe(200);
    expect((await call("nurse-a", "POST", `/api/clinic/versions/${ids.versionA1}/decision`, { decision: "approved", attest: true })).status).toBe(403);
    expect((await call("owner-a", "POST", `/api/clinic/versions/${ids.versionA1}/decision`, { decision: "approved", attest: true })).status).toBe(403); // owner is not a reviewer
    expect((await call("clinician-a", "POST", `/api/clinic/versions/${ids.versionA1}/decision`, { decision: "approved" })).status).toBe(400); // attestation required
    expect((await call("clinician-a", "POST", `/api/clinic/versions/${ids.versionA1}/decision`, { decision: "approved", attest: true, comments: "Matches discharge summary" })).status).toBe(200);

    const after = await call<{ plan: { approved_version_id: string }; approvals: Array<{ decision: string; clinician_name: string; version: number }> }>("owner-a", "GET", `/api/clinic/plans/${ids.planA}`);
    expect(after.body.plan.approved_version_id).toBe(ids.versionA1);
    expect(after.body.approvals[0]).toMatchObject({ decision: "approved", clinician_name: "Dr Clinician A", version: 1 });

    const page = await (await browserAs(browser, "clinician-a")).newPage();
    await page.goto(`/clinic/plans/${ids.planA}`);
    await expect(page.getByText("Patient sees an approved version")).toBeVisible();
    await expect(page.getByRole("button", { name: "Start a revision" })).toBeVisible();
    await page.screenshot({ path: "test-results/live/clinician-plan-approved.png", fullPage: true });
    await page.goto("/clinic/dashboard");
    await expect(page.getByText("Approved recovery plans")).toBeVisible();
    await page.screenshot({ path: "test-results/live/clinic-dashboard.png", fullPage: true });
    await page.context().close();
  });

  test("7. patient invitation: hashed one-time token + date-of-birth check", async () => {
    const inv = await call<{ link: string; delivery: string }>("nurse-a", "POST", `/api/clinic/patients/${ids.patientA}/invitations`);
    expect(inv.status).toBe(201);
    expect(inv.body.delivery).toBe("manual");
    const token = tokenOf(inv.body.link);
    expect((await call("patient-a", "POST", "/api/invitations/redeem", { token, date_of_birth: "1980-05-02" })).status).toBe(400);
    expect((await call("patient-a", "POST", "/api/invitations/redeem", { token, date_of_birth: "1980-05-01" })).status).toBe(200);
    expect((await call("outsider", "POST", "/api/invitations/redeem", { token, date_of_birth: "1980-05-01" })).status).toBe(400);
    expect((await call("patient-a", "POST", "/api/invitations/redeem", { token: "f".repeat(64), date_of_birth: "1980-05-01" })).status).toBe(400);
  });

  test("8–9. patient access: only their approved plan; acknowledge, complete, report attendance", async ({ browser }) => {
    const team = await call<{ clinics: Array<{ patient_id: string; plans: Array<{ id: string; version_id: string; approved_by: string; bundle: { tasks: Array<{ id: string }>; follow_ups: Array<{ id: string }> } }> }> }>("patient-a", "GET", "/api/care-team");
    expect(team.status).toBe(200);
    expect(team.body.clinics).toHaveLength(1);
    const plan = team.body.clinics[0].plans[0];
    expect(plan.version_id).toBe(ids.versionA1);
    expect(plan.approved_by).toBe("Dr Clinician A");

    if (plan.bundle.tasks[0]) {
      expect((await call("patient-a", "POST", "/api/care-team/progress", { version_id: plan.version_id, item_kind: "task", item_id: plan.bundle.tasks[0].id, action: "completed", done: true })).status).toBe(200);
    }
    expect((await call("patient-a", "POST", "/api/care-team/progress", { version_id: plan.version_id, item_kind: "warning_signs", item_id: "all", action: "acknowledged", done: true })).status).toBe(200);
    if (plan.bundle.follow_ups[0]) {
      ids.followUp = plan.bundle.follow_ups[0].id;
      expect((await call("patient-a", "POST", "/api/care-team/follow-ups", { plan_id: ids.planA, item_id: ids.followUp, status: "reported_attended" })).status).toBe(200);
    }

    // Patient B (not linked) sees nothing; patients cannot use clinic APIs.
    expect((await call<{ clinics: unknown[] }>("patient-b", "GET", "/api/care-team")).body.clinics).toEqual([]);
    expect((await call("patient-a", "GET", `/api/clinic/plans/${ids.planA}`)).status).toBe(403);
    expect((await call("patient-a", "POST", `/api/clinic/versions/${ids.versionA1}/decision`, { decision: "approved", attest: true })).status).toBe(403);
    expect((await call("patient-a", "GET", `/api/care-team/documents/${ids.docA}`)).status).toBe(404); // not shared yet

    const page = await (await browserAs(browser, "patient-a")).newPage();
    await page.goto("/care-team");
    await expect(page.getByText(/Approved by Dr Clinician A/)).toBeVisible();
    await expect(page.getByText("Fever above 38°C (synthetic)")).toBeVisible();
    await page.screenshot({ path: "test-results/live/patient-care-team.png", fullPage: true });
    await page.context().close();
  });

  test("10. clinic monitoring, questions and urgent-symptom screening", async () => {
    const q = await call<{ question_id: string; urgent: boolean }>("patient-a", "POST", "/api/care-team/questions", {
      patient_id: ids.patientA,
      subject: "Wound question",
      body: "The wound is bleeding heavily and won't stop",
    });
    expect(q.status).toBe(201);
    expect(q.body.urgent).toBe(true);
    expect((await call("clinician-a", "POST", `/api/clinic/questions/${q.body.question_id}`, { body: "Please follow the emergency guidance and call 1122 now." })).status).toBe(201);
    const thread = await call<{ messages: Array<{ author_kind: string }> }>("patient-a", "GET", `/api/care-team/questions/${q.body.question_id}`);
    expect(thread.body.messages.map((m) => m.author_kind)).toEqual(["patient", "staff"]);

    const dash = await call<{ metrics: Record<string, number> }>("nurse-a", "GET", "/api/clinic/dashboard");
    expect(dash.body.metrics).toMatchObject({ patients: 1, linked: 1, approvedPlans: 1, pendingReview: 0 });
    const detail = await call<{ progress: unknown[]; followUps: Array<{ patient_status: string; staff_status: string }> }>("nurse-a", "GET", `/api/clinic/patients/${ids.patientA}`);
    expect(detail.body.progress.length).toBeGreaterThan(0);
    if (ids.followUp) {
      expect(detail.body.followUps[0]).toMatchObject({ patient_status: "reported_attended", staff_status: "unverified" });
      expect((await call("nurse-a", "POST", "/api/clinic/follow-ups", { plan_id: ids.planA, item_id: ids.followUp, status: "verified_attended" })).status).toBe(200);
    }
    const notes = await call<{ items: Array<{ title: string }> }>("patient-a", "GET", "/api/notifications");
    expect(notes.body.items.map((n) => n.title)).toEqual(expect.arrayContaining(["Your care team replied to your question"]));
  });

  test("11. tenant isolation through the API", async () => {
    for (const path of [
      `/api/clinic/patients/${ids.patientA}`,
      `/api/clinic/plans/${ids.planA}`,
      `/api/clinic/documents/${ids.docA}/file`,
    ]) {
      expect((await call("owner-b", "GET", path)).status, path).toBe(404);
    }
    expect((await call("owner-b", "POST", `/api/clinic/versions/${ids.versionA1}/decision`, { decision: "rejected", comments: "x" })).status).toBe(404);
    expect((await call("owner-b", "PATCH", `/api/clinic/patients/${ids.patientA}`, { full_name: "Tampered" })).status).toBe(404);
    expect((await call("owner-b", "POST", "/api/clinic/documents/upload", { episode_id: ids.episodeA, filename: "x.pdf", size: 10 })).status).toBe(404);
    const listB = await call<{ patients: Array<{ id: string }> }>("owner-b", "GET", "/api/clinic/patients?status=all");
    expect(listB.body.patients.map((p) => p.id)).toEqual([ids.patientB]);
    expect((await call("owner-a", "GET", `/api/clinic/patients/${ids.patientB}`)).status).toBe(404);
    // Clinic B's audit log contains nothing from clinic A.
    const auditB = await call<{ items: Array<{ resource_id: string | null }> }>("owner-b", "GET", "/api/clinic/audit");
    expect(auditB.body.items.some((e) => e.resource_id === ids.planA || e.resource_id === ids.versionA1)).toBe(false);
  });

  test("12. versioning: a revision needs re-approval while the patient keeps the approved version", async () => {
    const rev = await call<{ version_id: string }>("clinician-a", "POST", `/api/clinic/plans/${ids.planA}/revise`);
    expect(rev.status).toBe(201);
    const team = await call<{ clinics: Array<{ plans: Array<{ version_id: string }> }> }>("patient-a", "GET", "/api/care-team");
    expect(team.body.clinics[0].plans[0].version_id).toBe(ids.versionA1);
    expect((await call("clinician-a", "POST", `/api/clinic/plans/${ids.planA}/revise`)).status).toBe(409);
  });

  test("13. revocation and unauthenticated access", async ({ playwright }) => {
    expect((await call("owner-a", "PATCH", `/api/clinic/staff/members/${ids.nurseMembership}`, { status: "revoked" })).status).toBe(200);
    expect((await call("nurse-a", "GET", "/api/clinic/patients")).status).toBe(403);
    expect((await call("nurse-a", "GET", `/api/clinic/patients/${ids.patientA}`)).status).toBe(403);

    const anonymous = await playwright.request.newContext({ baseURL: BASE });
    for (const path of ["/api/clinic/patients", `/api/clinic/plans/${ids.planA}`, "/api/care-team", `/api/clinic/documents/${ids.docA}/file`]) {
      expect((await call(anonymous, "GET", path)).status, path).toBe(401);
    }
    await anonymous.dispose();

    const audit = await call<{ items: Array<{ action: string }> }>("owner-a", "GET", "/api/clinic/audit");
    const actions = audit.body.items.map((e) => e.action);
    for (const a of ["organization.created", "staff.joined", "patient.created", "document.uploaded", "document.processed", "document.viewed", "plan.approved", "invitation.redeemed", "staff.revoked"]) {
      expect(actions, a).toContain(a);
    }
  });
});
