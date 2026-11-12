import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";

/**
 * Clinic portal and patient invitation pages, against the production build. The E2E server runs
 * without Supabase (see playwright.config.ts), so these tests cover routing, access control,
 * token handling, accessibility and API hardening. Database-level authorization (RLS, tenant
 * isolation, approvals, invitations) is tested against the real migrations in tests/db.
 */

const axe = async (page: Page) => {
  await page.waitForFunction(() => document.getAnimations().every((a) => a.playState !== "running"));
  const r = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"]).analyze();
  return r.violations.map((v) => `${v.id}: ${v.nodes[0]?.target.join(" ")}`);
};

test.describe("signed-out visitor", () => {
  test.use({ storageState: { cookies: [], origins: [] } });

  test("clinic portal pages require sign-in", async ({ page }) => {
    for (const path of ["/clinic/dashboard", "/clinic/patients", "/clinic/review", "/clinic/plans/11111111-1111-4111-8111-111111111111", "/clinic/audit", "/care-team"]) {
      await page.goto(path);
      await expect(page, path).toHaveURL(new RegExp(`/login\\?next=${encodeURIComponent(path).replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}`));
    }
    await page.goto("/clinic");
    await expect(page).toHaveURL(/\/login\?next=/);
  });

  test("clinic registration is public, explains the workflow and is accessible", async ({ page }) => {
    await page.goto("/clinic/register");
    await expect(page.getByRole("heading", { name: "Create your clinic account" })).toBeVisible();
    await expect(page.getByLabel(/Work email/)).toBeVisible();
    // Two consent boxes: required terms (red asterisk), optional marketing.
    await expect(page.locator("#consent-terms")).toBeVisible();
    await expect(page.locator("#consent-marketing")).toBeVisible();
    await page.getByRole("button", { name: "Continue" }).click();
    await expect(page.getByText("Please agree to the Terms of Service and Privacy Policy.")).toBeVisible();
    await expect(page.getByText("Enter a valid email address.")).toBeVisible();
    expect(await axe(page)).toEqual([]);
  });

  test("patient invitation: token is read from the fragment, removed from the URL, and never sent to the server", async ({ page }) => {
    const token = "a".repeat(64);
    const requested: string[] = [];
    page.on("request", (r) => requested.push(r.url()));
    await page.goto(`/invitation#t=${token}`);
    await expect(page.getByRole("heading", { name: "Your care team invited you" })).toBeVisible();
    await expect(page.getByRole("link", { name: "Sign in" })).toHaveAttribute("href", "/login?next=/invitation");
    await expect.poll(() => page.url()).not.toContain("#t=");
    expect(requested.some((u) => u.includes(token))).toBe(false);
    expect(await page.evaluate(() => sessionStorage.getItem("aftercare_patient_invite"))).toBe(token);
    expect(await axe(page)).toEqual([]);
  });

  test("invitation links without a valid token are rejected without revealing anything", async ({ page }) => {
    await page.goto("/invitation#t=not-a-token");
    await expect(page.getByText(/invitation link is incomplete/)).toBeVisible();
    await page.goto("/clinic/join");
    await expect(page.getByText(/invitation link is incomplete/)).toBeVisible();
  });

  test("clinic and care-team APIs reject cross-site writes and malformed input", async ({ request }) => {
    for (const [method, url] of [
      ["POST", "/api/clinic/organization"],
      ["POST", "/api/clinic/patients"],
      ["POST", "/api/clinic/versions/11111111-1111-4111-8111-111111111111/decision"],
      ["POST", "/api/clinic/join"],
      ["POST", "/api/invitations/redeem"],
      ["POST", "/api/care-team/questions"],
      ["PATCH", "/api/clinic/staff/members/11111111-1111-4111-8111-111111111111"],
    ] as const) {
      const res = await request.fetch(url, { method, headers: { Origin: "https://evil.example", "Content-Type": "application/json" }, data: "{}" });
      expect(res.status(), `${method} ${url}`).toBe(403);
    }
    // Without accounts configured, protected APIs fail closed with a generic error and no stack traces.
    for (const url of ["/api/clinic/me", "/api/clinic/patients", "/api/clinic/dashboard", "/api/care-team", "/api/notifications"]) {
      const res = await request.get(url);
      expect([401, 503], url).toContain(res.status());
      expect(JSON.stringify(await res.json())).not.toMatch(/at \w+ \(|node_modules|stack/i);
    }
  });
});

// Uses the default consented storage state from global-setup, like the rest of the patient-app suite.
test("existing patient demo still works and shows the care-team area", async ({ page }) => {
  await page.goto("/demo");
  await page.getByRole("button", { name: "Open the sample plan" }).click();
  await expect(page).toHaveURL(/\/dashboard/);
  await page.goto("/care-team");
  await expect(page.getByRole("heading", { name: "Care team" })).toBeVisible();
  await expect(page.getByText(/demo does not include a clinic/)).toBeVisible();
});
