import { createClient } from "@supabase/supabase-js";
import { expect, test, type Page } from "@playwright/test";
import { LEGAL_VERSIONS } from "../../src/lib/legal";

/**
 * One browser, two people: nothing the first person typed or loaded may appear for the next one.
 * Cache Components keeps recent routes alive across client navigations, so sign-in/out must reload.
 * Runs against the disposable Supabase TEST project (see playwright.live.config.ts).
 */

const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "";
test.skip(!url || !anon || /qfpaoqacngcfstdchdqj/.test(url), "Live tests need a separate Supabase TEST project (never production).");

const RUN = `${Date.now().toString(36)}${crypto.randomUUID().replace(/-/g, "").slice(0, 8)}`;
const PASSWORD = `Synthetic-${RUN}-pw!`;
const email = (who: string) => `${who}.${RUN}@example.com`;

async function credentials(page: Page, who: string) {
  await page.getByRole("textbox", { name: "Email" }).fill(email(who));
  await page.getByLabel("Password", { exact: true }).fill(PASSWORD);
}

test("the next person on the same browser starts clean", async ({ page }) => {
  // The second person already has an account but has not finished set-up.
  const supabase = createClient(url, anon, { auth: { persistSession: false } });
  const { error } = await supabase.auth.signUp({
    email: email("second-person"),
    password: PASSWORD,
    options: { data: { legal: LEGAL_VERSIONS, age_confirmed: true, marketing_opt_in: false } },
  });
  if (error) throw new Error(`sign-up failed: ${error.message}`);

  await page.addInitScript(() => localStorage.setItem("aftercare.cookie-notice", "1"));
  await page.goto("/signup");
  await credentials(page, "first-person");
  for (const box of await page.locator('input[type="checkbox"][aria-required="true"]').all()) await box.check();
  await page.getByRole("button", { name: "Create account" }).click();
  await expect(page).toHaveURL(/\/onboarding/, { timeout: 30_000 });
  const name = page.getByLabel("What should we call you? (optional)");
  await name.fill("FirstPersonName");
  await page.getByRole("button", { name: /Continue to upload documents/ }).click();
  await expect(page).toHaveURL(/\/documents/, { timeout: 30_000 });
  await page.getByRole("link", { name: "Settings" }).filter({ visible: true }).first().click();
  await expect(page).toHaveURL(/\/settings/);
  await expect(page.getByText("FirstPersonName").or(page.locator('input[value="FirstPersonName"]')).first()).toBeVisible();

  await page.getByRole("button", { name: "Sign out" }).filter({ visible: true }).first().click();
  await expect(page).toHaveURL(/\/login\?reason=signed-out/);

  await credentials(page, "second-person");
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page).toHaveURL(/\/dashboard/, { timeout: 30_000 });
  await page.getByRole("link", { name: "Set up my plan" }).click();
  await expect(page).toHaveURL(/\/onboarding/);
  await expect(name).toBeVisible();
  // Give any late profile load time to land, then check nothing of the first person remains.
  await page.waitForLoadState("networkidle");
  await expect(name).toHaveValue("");
  expect(await page.content()).not.toContain("FirstPersonName");
});
