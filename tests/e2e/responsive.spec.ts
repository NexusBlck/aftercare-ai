import { expect, test } from "@playwright/test";

/** Mobile (Pixel 7): every primary screen fits without horizontal scrolling. */
const PAGES = ["/dashboard", "/review", "/recovery-plan", "/medications", "/appointments", "/documents", "/settings"];

test("landing page and all app screens fit a phone screen", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);

  await page.goto("/demo");
  await page.getByRole("button", { name: "Open the sample plan" }).click();
  await expect(page).toHaveURL(/\/dashboard/);

  for (const path of PAGES) {
    await page.goto(path);
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    expect(overflow, `${path} overflows by ${overflow}px`).toBeLessThanOrEqual(0);
  }

  // Bottom navigation is reachable and has touch-sized targets.
  const nav = page.getByRole("navigation", { name: "Quick navigation" });
  await expect(nav).toBeVisible();
  const box = await nav.getByRole("link", { name: "Review" }).boundingBox();
  expect(box?.height ?? 0).toBeGreaterThanOrEqual(44);
});
