import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";
import { readFileSync } from "node:fs";

/** Legal pages, cookie notice, consent capture and data rights. Starts from a fresh browser. */
test.use({ storageState: { cookies: [], origins: [] } });

const axe = async (page: import("@playwright/test").Page) => {
  await page.waitForFunction(() => document.getAnimations().every((a) => a.playState !== "running"));
  const r = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"]).analyze();
  return r.violations.map((v) => `${v.id}: ${v.nodes[0]?.target.join(" ")}`);
};

test("legal pages are published, linked from the footer and accessible", async ({ page }) => {
  await page.goto("/");
  const footer = page.getByRole("contentinfo");
  for (const [label, heading] of [
    ["Privacy", "Privacy policy"],
    ["Terms", "Terms of service"],
    ["Subprocessors", "Subprocessors"],
    ["Contact", "Contact"],
  ]) {
    await page.goto("/");
    await footer.getByRole("link", { name: label, exact: true }).click();
    await expect(page.getByRole("heading", { level: 1, name: heading })).toBeVisible();
    expect(await axe(page), heading).toEqual([]);
  }
  await page.goto("/privacy");
  for (const section of ["retention", "cookies", "ai", "rights", "children"]) {
    await expect(page.locator(`#${section}`)).toBeVisible();
  }
  await expect(page.getByText(/not used to train Google/)).toBeVisible();
  await page.goto("/terms");
  await expect(page.getByText(/There are no charges, hidden fees, subscriptions or automatic renewals/)).toBeVisible();
  await expect(page.getByText(/we do not promise any particular uptime/)).toBeVisible();
});

test("cookie notice explains essential-only storage and stays dismissed", async ({ page }) => {
  await page.goto("/");
  const notice = page.getByRole("region", { name: "Cookie notice" });
  await expect(notice).toContainText("No analytics, ads or tracking");
  await notice.getByRole("button", { name: "OK" }).click();
  await expect(notice).toBeHidden();
  await page.reload();
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  await expect(page.getByRole("region", { name: "Cookie notice" })).toBeHidden();
});

test("no third-party requests are made before or after consent", async ({ page }) => {
  const external: string[] = [];
  page.on("request", (r) => {
    const u = new URL(r.url());
    if (u.hostname !== "localhost") external.push(u.href);
  });
  await page.goto("/");
  await page.goto("/login");
  await page.goto("/privacy");
  expect(external).toEqual([]);
});

test("demo visitors must accept terms, privacy and health-data consent before using the app", async ({ page }) => {
  await page.goto("/demo");
  await expect(page.getByRole("heading", { name: "Before you continue" })).toBeVisible();
  expect(await axe(page), "consent gate").toEqual([]);
  const agree = page.getByRole("button", { name: "Agree and continue" });
  await expect(agree).toBeDisabled();
  await page.getByTestId("consent-agree").check();
  await agree.click();
  await expect(page.getByRole("button", { name: "Open the sample plan" })).toBeVisible();
  await page.getByRole("button", { name: "Open the sample plan" }).click();
  await expect(page).toHaveURL(/\/dashboard/);

  // Acceptance is recorded with document and version, and survives a reload.
  await page.reload();
  await expect(page.getByRole("heading", { name: "Before you continue" })).toBeHidden();
  await page.goto("/settings");
  const list = page.getByTestId("agreements-list");
  await expect(list).toContainText("Terms of service");
  await expect(list).toContainText("Privacy policy");
  await expect(list).toContainText("Health-data consent");

  // Data download contains the plan and the agreement records.
  const download = page.waitForEvent("download");
  await page.getByTestId("download-my-data").click();
  const file = await download;
  const json = JSON.parse(readFileSync((await file.path()) as string, "utf8"));
  expect(json.export_format).toBe("aftercare-ai-data-export/1");
  expect(json.agreements.accepted).toHaveLength(3);
  expect(json.care_plan.plan.title).toContain("sample");
});

test("declining the agreement leaves the app", async ({ page }) => {
  await page.goto("/demo");
  await page.getByRole("button", { name: "No thanks, leave" }).click();
  await expect(page).toHaveURL("http://localhost:3200/");
  await page.goto("/dashboard");
  await expect(page).toHaveURL(/\/login/);
});

test("sign-up form has one required agreement (marked *) and an unticked, optional marketing box", async ({ page }) => {
  await page.goto("/signup");
  await expect(page.locator('input[type="checkbox"]')).toHaveCount(2);
  const terms = page.getByLabel(/I agree to the Terms of Service and Privacy Policy/);
  await expect(terms).not.toBeChecked();
  await expect(page.locator("label[for=consent-terms] .text-danger")).toHaveText("*");
  const marketing = page.getByLabel(/Send me product updates and offers by email/);
  await expect(marketing).not.toBeChecked();
  await expect(page.locator("label[for=consent-marketing] .text-danger")).toHaveCount(0);
  expect(await axe(page), "signup").toEqual([]);
});

test("account data endpoints require authentication", async ({ request }) => {
  for (const [method, url] of [
    ["GET", "/api/legal"],
    ["GET", "/api/account/export"],
  ] as const) {
    const res = await request.fetch(url, { method });
    expect(res.status(), url).toBe(503);
    expect((await res.json()).error.code).toBe("accounts_unconfigured");
  }
  const post = await request.post("/api/legal", { data: { documents: ["terms"] } });
  expect(post.status()).toBe(503);
});
