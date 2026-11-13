import { createHmac } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import { expect, test, type APIRequest, type APIRequestContext } from "@playwright/test";
import { LEGAL_VERSIONS } from "../../src/lib/legal";

/**
 * Two-factor authentication for clinic staff, end to end against the disposable Supabase TEST project
 * (migration 0004 applied). Codes are generated here from the set-up secret (RFC 6238).
 */

const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "";
test.skip(!url || !anon || /qfpaoqacngcfstdchdqj/.test(url), "Live tests need a separate Supabase TEST project (never production).");

const RUN = `${Date.now().toString(36)}${crypto.randomUUID().replace(/-/g, "").slice(0, 8)}`;
const PASSWORD = `Synthetic-${RUN}-pw!`;
const email = (who: string) => `${who}.mfa.${RUN}@example.com`;
const BASE = "http://localhost:3300";

function base32(secret: string): Buffer {
  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
  let bits = "";
  for (const c of secret.replace(/=+$/, "").toUpperCase()) bits += alphabet.indexOf(c).toString(2).padStart(5, "0");
  const bytes = [];
  for (let i = 0; i + 8 <= bits.length; i += 8) bytes.push(parseInt(bits.slice(i, i + 8), 2));
  return Buffer.from(bytes);
}

let lastWindow = -1;

/** A code from a 30-second window not used before (servers refuse a code twice). */
async function freshCode(secret: string): Promise<string> {
  if (Math.floor(Date.now() / 30_000) <= lastWindow) await new Promise((r) => setTimeout(r, 30_500 - (Date.now() % 30_000)));
  lastWindow = Math.floor(Date.now() / 30_000);
  return totp(secret);
}

function totp(secret: string, at = Date.now()): string {
  const counter = Buffer.alloc(8);
  counter.writeBigUInt64BE(BigInt(Math.floor(at / 30_000)));
  const hmac = createHmac("sha1", base32(secret)).update(counter).digest();
  const offset = hmac[hmac.length - 1] & 0xf;
  return String((hmac.readUInt32BE(offset) & 0x7fffffff) % 1_000_000).padStart(6, "0");
}

async function json(ctx: APIRequestContext, method: string, path: string, data?: unknown) {
  const res = await ctx.fetch(path, { method, data });
  return { status: res.status(), body: (await res.json().catch(() => null)) as Record<string, unknown> & { error?: { code: string } } };
}

async function signedIn(request: APIRequest, who: string) {
  const ctx = await request.newContext({ baseURL: BASE });
  const login = await json(ctx, "POST", "/api/auth/login", { email: email(who), password: PASSWORD });
  expect(login.status).toBe(200);
  return { ctx, login: login.body };
}

test.describe.serial("two-factor authentication for clinic staff", () => {
  let secret = "";
  let inviteLink = "";

  test.beforeAll(async () => {
    const supabase = createClient(url, anon, { auth: { persistSession: false } });
    for (const who of ["owner", "nurse"]) {
      const { error } = await supabase.auth.signUp({
        email: email(who),
        password: PASSWORD,
        options: { data: { legal: LEGAL_VERSIONS, age_confirmed: true, marketing_opt_in: false } },
      });
      if (error) throw new Error(`sign-up failed: ${error.message}`);
    }
  });

  test("an owner sets up an authenticator app; the next sign-in needs a code", async ({ playwright }) => {
    const { ctx } = await signedIn(playwright.request, "owner");
    expect((await json(ctx, "POST", "/api/clinic/organization", { name: `MFA Clinic ${RUN}`, org_type: "clinic", owner_name: "Dr Owner", owner_is_clinician: true })).status).toBe(201);
    const staff = await json(ctx, "POST", "/api/clinic/staff", { email: email("nurse"), role: "nurse" });
    expect(staff.status).toBe(201);
    inviteLink = String(staff.body.link);

    const status = await json(ctx, "GET", "/api/auth/mfa");
    expect(status.body).toMatchObject({ enabled: false, verified_this_session: false });
    const setup = await json(ctx, "POST", "/api/auth/mfa");
    expect(setup.status).toBe(201);
    expect(String(setup.body.qr_code)).toMatch(/^data:image\/svg/);
    secret = String(setup.body.secret);
    expect((await json(ctx, "POST", "/api/auth/mfa/verify", { code: "000000", factor_id: setup.body.factor_id })).body.error?.code).toBe("mfa_invalid_code");
    expect((await json(ctx, "POST", "/api/auth/mfa/verify", { code: await freshCode(secret), factor_id: setup.body.factor_id })).status).toBe(200);
    expect((await json(ctx, "GET", "/api/auth/mfa")).body).toMatchObject({ enabled: true, verified_this_session: true });
    expect((await json(ctx, "GET", "/api/clinic/patients")).status).toBe(200);
    await ctx.dispose();

    // A fresh password sign-in is only the first step.
    const second = await signedIn(playwright.request, "owner");
    expect(second.login.mfa_required).toBe(true);
    const blocked = await json(second.ctx, "GET", "/api/clinic/patients");
    expect(blocked.status).toBe(401);
    expect(blocked.body.error?.code).toBe("mfa_required");
    expect((await json(second.ctx, "GET", "/api/clinic/me")).body.error?.code).toBe("mfa_required");
    expect((await json(second.ctx, "POST", "/api/auth/mfa/verify", { code: await freshCode(secret) })).status).toBe(200);
    expect((await json(second.ctx, "GET", "/api/clinic/patients")).status).toBe(200);
    await second.ctx.dispose();
  });

  test("the database also refuses a password-only session (not just the app)", async () => {
    const supabase = createClient(url, anon, { auth: { persistSession: false } });
    const { error } = await supabase.auth.signInWithPassword({ email: email("owner"), password: PASSWORD });
    expect(error).toBeNull();
    const { data } = await supabase.from("clinic_patients").select("id");
    expect(data).toEqual([]);
    const { data: orgs } = await supabase.from("organizations").select("name, require_mfa");
    expect(orgs).toEqual([{ name: `MFA Clinic ${RUN}`, require_mfa: false }]);
  });

  test("an owner requires it for all staff; a nurse without it is told to set it up", async ({ playwright }) => {
    const nurse = await signedIn(playwright.request, "nurse");
    expect((await json(nurse.ctx, "POST", "/api/clinic/join", { token: new URL(inviteLink).hash.replace("#t=", ""), display_name: "Nurse" })).status).toBe(200);
    expect((await json(nurse.ctx, "GET", "/api/clinic/patients")).status).toBe(200);

    const owner = await signedIn(playwright.request, "owner");
    // Password-only sessions cannot change clinic settings at all.
    expect((await json(owner.ctx, "PATCH", "/api/clinic/organization", { require_mfa: true })).status).toBe(401);
    expect((await json(owner.ctx, "POST", "/api/auth/mfa/verify", { code: await freshCode(secret) })).status).toBe(200);
    expect((await json(owner.ctx, "PATCH", "/api/clinic/organization", { require_mfa: true })).status).toBe(200);

    const locked = await json(nurse.ctx, "GET", "/api/clinic/patients");
    expect(locked.status).toBe(403);
    expect(locked.body.error?.code).toBe("mfa_setup_required");
    const status = await json(nurse.ctx, "GET", "/api/auth/mfa");
    expect(status.body.required_by).toEqual([`MFA Clinic ${RUN}`]);
    await nurse.ctx.dispose();

    // The owner cannot turn off their only factor while the clinic requires it.
    const factors = (await json(owner.ctx, "GET", "/api/auth/mfa")).body.factors as Array<{ id: string }>;
    expect((await json(owner.ctx, "DELETE", "/api/auth/mfa", { factor_id: factors[0].id })).status).toBe(403);
    await owner.ctx.dispose();
  });

  test("in the browser: sign-in asks for the code; a nurse sets up two-factor when the clinic requires it", async ({ browser }) => {
    const context = await browser.newContext();
    await context.addInitScript(() => localStorage.setItem("aftercare.cookie-notice", "1"));
    const page = await context.newPage();

    await page.goto("/login");
    await page.getByRole("textbox", { name: "Email" }).fill(email("owner"));
    await page.getByLabel("Password", { exact: true }).fill(PASSWORD);
    await page.getByRole("button", { name: "Sign in" }).click();
    await expect(page).toHaveURL(/\/security\/verify\?next=%2Fclinic%2Fdashboard/);
    await page.getByLabel("6-digit code").fill("123456");
    await page.getByRole("button", { name: "Continue" }).click();
    await expect(page.getByText(/That code is not correct/)).toBeVisible();
    await page.getByLabel("6-digit code").fill(await freshCode(secret));
    await page.getByRole("button", { name: "Continue" }).click();
    await expect(page).toHaveURL(/\/clinic\/dashboard/, { timeout: 15_000 });
    await expect(page.getByText(`MFA Clinic ${RUN}`).first()).toBeVisible({ timeout: 15_000 });
    await page.screenshot({ path: "test-results/live/mfa-owner-dashboard.png" });
    await context.close();

    const nurseContext = await browser.newContext();
    await nurseContext.addInitScript(() => localStorage.setItem("aftercare.cookie-notice", "1"));
    const nursePage = await nurseContext.newPage();
    await nursePage.goto("/login");
    await nursePage.getByRole("textbox", { name: "Email" }).fill(email("nurse"));
    await nursePage.getByLabel("Password", { exact: true }).fill(PASSWORD);
    await nursePage.getByRole("button", { name: "Sign in" }).click();
    await expect(nursePage.getByText("Your clinic requires two-factor authentication.")).toBeVisible({ timeout: 15_000 });
    await nursePage.getByRole("link", { name: "Set up two-factor" }).click();
    await expect(nursePage).toHaveURL(/\/security\?next=/);
    await nursePage.getByRole("button", { name: "Set up an authenticator app" }).click();
    await expect(nursePage.getByRole("img", { name: "QR code for your authenticator app" })).toBeVisible();
    await nursePage.screenshot({ path: "test-results/live/mfa-setup.png" });
    const nurseSecret = (await nursePage.locator("code").innerText()).trim();
    await nursePage.getByLabel("6-digit code").fill(totp(nurseSecret));
    await nursePage.getByRole("button", { name: "Turn on" }).click();
    await expect(nursePage).toHaveURL(/\/clinic\/dashboard/, { timeout: 15_000 });
    await expect(nursePage.getByText(`MFA Clinic ${RUN}`).first()).toBeVisible({ timeout: 15_000 });
    await nurseContext.close();
  });
});
