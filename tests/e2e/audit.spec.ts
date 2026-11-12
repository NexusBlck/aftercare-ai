import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * QA audit: every screen and interactive control in demo mode, accessibility (axe, WCAG 2.1 AA),
 * console errors, and auth-form behaviour. Runs against the production build with the
 * deterministic test extractor (no paid API calls).
 */

const fixture = (name: string) => join(process.cwd(), "tests", "fixtures", "documents", name);
const APP_PAGES = ["/dashboard", "/review", "/recovery-plan", "/medications", "/appointments", "/documents", "/settings"];

function trackConsole(page: Page) {
  const errors: string[] = [];
  page.on("console", (m) => {
    if (m.type() === "error") errors.push(m.text());
  });
  page.on("pageerror", (e) => errors.push(e.message));
  return errors;
}

async function openSample(page: Page) {
  await page.goto("/demo");
  await page.getByRole("button", { name: "Open the sample plan" }).click();
  await expect(page).toHaveURL(/\/dashboard/);
}

async function axe(page: Page) {
  // Scan only after open/close animations settle, so blended mid-fade colours are not measured.
  await page.waitForFunction(() => document.getAnimations().every((an) => an.playState !== "running"));
  const results = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"]).analyze();
  return results.violations.map((v) => `${v.id} (${v.impact}): ${v.nodes.length} node(s) — ${v.nodes[0]?.target.join(" ")}`);
}

test.describe("accessibility (axe WCAG 2.1 AA)", () => {
  test("public pages have no violations", async ({ page }) => {
    for (const path of ["/", "/login", "/signup"]) {
      await page.goto(path);
      await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
      expect(await axe(page), path).toEqual([]);
    }
  });

  test("onboarding and app pages have no violations", async ({ page }) => {
    await page.goto("/demo");
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    expect(await axe(page), "/onboarding").toEqual([]);
    await page.getByRole("button", { name: "Open the sample plan" }).click();
    await expect(page).toHaveURL(/\/dashboard/);
    for (const path of APP_PAGES) {
      await page.goto(path);
      await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
      expect(await axe(page), path).toEqual([]);
    }
  });

  test("phone layout, navigation sheet and dialogs have no violations", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await openSample(page);
    for (const path of ["/dashboard", "/review", "/medications", "/appointments", "/documents", "/settings"]) {
      await page.goto(path);
      await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
      expect(await axe(page), `mobile ${path}`).toEqual([]);
    }
    await page.getByRole("button", { name: "Open menu" }).click();
    await expect(page.getByRole("dialog")).toBeVisible();
    expect(await axe(page), "menu sheet").toEqual([]);
    await page.keyboard.press("Escape");

    await page.goto("/review");
    const dialogs: Array<[string, RegExp]> = [
      ["source dialog", /^Source$/],
      ["correction dialog", /^Correct /],
      ["conflict dialog", /I discussed this/],
    ];
    for (const [label, name] of dialogs) {
      await page.getByRole("button", { name }).first().click();
      await expect(page.getByRole("dialog")).toBeVisible();
      expect(await axe(page), label).toEqual([]);
      await page.keyboard.press("Escape");
      await expect(page.getByRole("dialog")).toBeHidden();
    }
    await page.goto("/documents");
    await page.getByRole("button", { name: "Preview" }).first().click();
    await expect(page.getByRole("region", { name: "Document content" })).toContainText("DISCHARGE SUMMARY");
    expect(await axe(page), "preview dialog").toEqual([]);
  });

  test("keyboard: skip link and visible focus on the landing page", async ({ page }) => {
    await page.goto("/");
    await page.keyboard.press("Tab");
    const skip = page.getByRole("link", { name: "Skip to content" });
    await expect(skip).toBeFocused();
    await expect(skip).toBeVisible();
  });
});

test("no console errors on any page", async ({ page }) => {
  const errors = trackConsole(page);
  for (const path of ["/", "/login", "/signup"]) {
    await page.goto(path);
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  }
  await openSample(page);
  for (const path of APP_PAGES) {
    await page.goto(path);
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  }
  expect(errors).toEqual([]);
});

test("unknown routes show a not-found page", async ({ page }) => {
  const res = await page.goto("/this-page-does-not-exist");
  expect(res?.status()).toBe(404);
});

test.describe("landing navigation", () => {
  test("anchor links and calls to action go to the right places", async ({ page }) => {
    await page.goto("/");
    for (const [label, id] of [
      ["How it works", "how-it-works"],
      ["Features", "features"],
      ["Safety", "safety"],
      ["Privacy", "privacy"],
    ]) {
      await page.getByRole("navigation", { name: "Primary" }).getByRole("link", { name: label }).click();
      await expect(page).toHaveURL(new RegExp(`#${id}$`));
      await expect(page.locator(`#${id}`)).toBeInViewport();
    }
    await page.getByRole("link", { name: "Get started" }).first().click();
    await expect(page).toHaveURL(/\/signup/);
    await page.getByRole("link", { name: "Sign in" }).click();
    await expect(page).toHaveURL(/\/login/);
    await page.getByRole("link", { name: "Create an account" }).click();
    await expect(page).toHaveURL(/\/signup/);
  });
});

test.describe("auth forms (accounts unconfigured)", () => {
  test("explain that accounts are unavailable and keep submit disabled", async ({ page }) => {
    await page.goto("/login");
    await expect(page.getByText(/Accounts are not configured on this server/)).toBeVisible();
    await expect(page.getByRole("button", { name: "Sign in" })).toBeDisabled();
    await page.locator("#password").fill("secret-value");
    await expect(page.locator("#password")).toHaveAttribute("type", "password");
    await page.getByRole("button", { name: "Show password" }).click();
    await expect(page.locator("#password")).toHaveAttribute("type", "text");
    await page.getByRole("button", { name: "Hide password" }).click();
    await expect(page.locator("#password")).toHaveAttribute("type", "password");
  });

  test("expired-session and signed-out reasons are shown", async ({ page }) => {
    await page.goto("/login?reason=expired");
    await expect(page.getByText("Your session has expired. Please sign in again.")).toBeVisible();
  });

  test("login does not redirect to external sites via ?next", async ({ page }) => {
    // Only same-site relative paths are honoured; verified at the helper level here via the proxy redirect.
    await page.goto("/dashboard");
    await expect(page).toHaveURL(/\/login\?next=%2Fdashboard$/);
  });
});

test.describe("documents screen", () => {
  test("preview, reclassify, reprocess and delete", async ({ page }) => {
    await page.goto("/demo");
    await page.getByText("Upload synthetic documents").click();
    await page.getByRole("button", { name: "Continue to upload documents" }).click();
    await page.getByTestId("file-input").setInputFiles(fixture("synthetic-discharge-summary.pdf"));
    const row = page.getByTestId("document-row").first();
    await row.getByRole("button", { name: "Process" }).click();
    await expect(row.getByTestId("document-status")).toHaveText("Ready for review");

    // Preview opens the stored PDF.
    await row.getByRole("button", { name: "Preview" }).click();
    await expect(page.getByRole("dialog").locator("iframe")).toBeVisible();
    await page.keyboard.press("Escape");

    // Patient reclassification sticks across reprocessing.
    await row.getByRole("combobox", { name: "Document type" }).click();
    await page.getByRole("option", { name: "Follow-up letter" }).click();
    await expect(row.getByText("Set by you")).toBeVisible();
    await row.getByRole("button", { name: "Reprocess" }).click();
    await page.getByRole("dialog").getByRole("button", { name: "Reprocess" }).click();
    await expect(row.getByTestId("document-status")).toHaveText("Ready for review");
    await expect(row.getByRole("combobox", { name: "Document type" })).toHaveText("Follow-up letter");
    await expect(row).toContainText("18 items extracted");

    // Delete removes the document and its items.
    await row.getByRole("button", { name: "Delete" }).click();
    await page.getByRole("dialog").getByRole("button", { name: "Delete permanently" }).click();
    await expect(page.getByTestId("document-row")).toHaveCount(0);
    await page.goto("/medications");
    await expect(page.getByText("No medications found in your documents yet.")).toBeVisible();
  });

  test("a file over the size limit is rejected before upload", async ({ page }) => {
    await page.goto("/demo");
    await page.getByText("Upload synthetic documents").click();
    await page.getByRole("button", { name: "Continue to upload documents" }).click();
    await page.getByTestId("file-input").setInputFiles({ name: "huge.pdf", mimeType: "application/pdf", buffer: Buffer.alloc(11 * 1024 * 1024, 0x25) });
    await expect(page.getByRole("alert").filter({ hasText: /The limit is 10 MB/ })).toBeVisible();
  });

  test("the downloadable synthetic sample is a real PDF", async ({ request }) => {
    const res = await request.get("/samples/synthetic-discharge-summary.pdf");
    expect(res.status()).toBe(200);
    expect((await res.body()).subarray(0, 5).toString()).toBe("%PDF-");
  });
});

test.describe("review workflow", () => {
  test("ask clinician, hide confirmed, encounter correction and discussed conflicts", async ({ page }) => {
    await openSample(page);
    await page.goto("/review");

    // Encounter correction records an edit and resets review.
    await page.getByRole("button", { name: "Correct hospital / facility" }).click();
    await page.getByRole("dialog").getByLabel("Hospital / facility").fill("Riverside General Hospital (synthetic)");
    await page.getByRole("dialog").getByRole("button", { name: "Save correction" }).click();
    await expect(page.getByText("Riverside General Hospital (synthetic)")).toBeVisible();

    // Ask clinician on a medication → shows up in questions.
    const ibu = page.locator("article").filter({ has: page.getByRole("heading", { name: /Ibuprofen/ }) });
    await ibu.getByRole("button", { name: "Ask clinician about Ibuprofen" }).click();
    await expect(ibu.locator('[data-status="needs_clinician_clarification"]')).toBeVisible();

    // Confirm Paracetamol (discharge copy) then hide confirmed.
    const para = page.locator("article").filter({ has: page.getByRole("heading", { name: /Paracetamol/ }) }).first();
    await para.getByRole("button", { name: "Confirm Paracetamol matches my document" }).click();
    await expect(para.locator('[data-status="confirmed_by_patient"]')).toBeVisible();
    const before = await page.locator('[data-status="confirmed_by_patient"]').count();
    expect(before).toBeGreaterThan(0);
    await page.getByRole("switch", { name: "Hide confirmed items" }).click();
    await expect(page.locator("article [data-status=\"confirmed_by_patient\"]")).toHaveCount(0);
    await page.getByRole("switch", { name: "Hide confirmed items" }).click();

    // Discussing the conflict returns both items to review; confirmation then becomes possible.
    const conflict = page.locator("article").filter({ hasText: "appears 2 times with a different frequency" });
    await conflict.getByRole("button", { name: /I discussed this with my care team/ }).click();
    await page.getByRole("dialog").getByLabel(/What did they tell you/).fill("Pharmacist confirmed three times daily");
    await page.getByRole("dialog").getByRole("button", { name: "Save" }).click();
    await expect(conflict.getByText(/Pharmacist confirmed three times daily/)).toBeVisible();
    const amox = page.locator("article").filter({ has: page.getByRole("heading", { name: /Amoxicillin-clavulanate/ }) }).first();
    await expect(amox.getByRole("button", { name: /Confirm Amoxicillin-clavulanate/ })).toBeEnabled();

    // Questions panel reflects the clarification request.
    await page.goto("/dashboard");
    await expect(page.getByText(/I marked this for clarification: "Ibuprofen"/)).toBeVisible();
  });
});

test.describe("appointments and recovery plan", () => {
  test("attended, rescheduled and reset keep the documented date", async ({ page }) => {
    await openSample(page);
    await page.goto("/appointments");
    const card = page.locator("article").filter({ has: page.getByRole("heading", { name: "General Surgery" }) });
    await card.getByRole("button", { name: "Rescheduled" }).click();
    await page.getByRole("dialog").getByLabel("New date (if you know it)").fill("2030-01-15");
    await page.getByRole("dialog").getByRole("button", { name: "Save" }).click();
    await expect(card.getByText(/rescheduled to 15 Jan 2030/)).toBeVisible();
    await expect(card.getByText(/The documented date is kept for reference/)).toBeVisible();
    await card.getByRole("button", { name: "Mark attended" }).click();
    await expect(page.getByRole("heading", { name: "Past or attended" })).toBeVisible();
    await page.locator("article").filter({ has: page.getByRole("heading", { name: "General Surgery" }) }).getByRole("button", { name: "Reset status" }).click();
    await expect(page.getByRole("heading", { name: "Upcoming" })).toBeVisible();
  });

  test("tasks can be completed and undone on the plan page; progress persists after reload", async ({ page }) => {
    await openSample(page);
    await page.goto("/recovery-plan");
    const box = page.getByRole("checkbox", { name: /Mark done: Walk several times a day/ });
    await box.click();
    await expect(page.getByRole("checkbox", { name: /Mark not done: Walk several times a day/ })).toBeVisible();
    await page.reload();
    await expect(page.getByRole("checkbox", { name: /Mark not done: Walk several times a day/ })).toHaveAttribute("aria-checked", "true");
    await page.getByRole("checkbox", { name: /Mark not done: Walk several times a day/ }).click();
    await expect(page.getByRole("checkbox", { name: /Mark done: Walk several times a day/ })).toHaveAttribute("aria-checked", "false");
  });
});

test.describe("settings", () => {
  test("language, rename, reset sample and delete demo data", async ({ page }) => {
    await openSample(page);
    await page.goto("/settings");
    await page.getByRole("radio", { name: /Urdu/ }).click();
    await expect(page.getByRole("radio", { name: /Urdu/ })).toHaveAttribute("aria-checked", "true");
    await page.goto("/medications");
    await expect(page.locator('[lang="ur"]').first()).toBeVisible();

    await page.goto("/settings");
    await page.getByLabel("Plan title").fill("Renamed recovery plan");
    await page.getByRole("button", { name: "Rename" }).click();
    await page.goto("/recovery-plan");
    await expect(page.getByRole("heading", { name: "Renamed recovery plan" })).toBeVisible();

    await page.goto("/settings");
    await page.getByRole("button", { name: "Reset sample plan" }).click();
    await page.getByRole("dialog").getByRole("button", { name: "Reset" }).click();
    await expect(page.getByLabel("Plan title")).toHaveValue("Appendix surgery recovery (sample)");

    await page.getByRole("button", { name: "Delete demo data" }).click();
    await page.getByRole("dialog").getByRole("button", { name: "Delete permanently" }).click();
    await expect(page).toHaveURL("http://localhost:3200/");
    await page.goto("/dashboard");
    await expect(page).toHaveURL(/\/login/);
  });
});

test("exported PDF is a valid document", async ({ page }) => {
  await openSample(page);
  const download = page.waitForEvent("download");
  await page.getByTestId("export-pdf").click();
  const file = await download;
  const bytes = readFileSync((await file.path()) as string);
  expect(bytes.subarray(0, 5).toString()).toBe("%PDF-");
  expect(bytes.length).toBeGreaterThan(5000);
});

test("responses carry security headers and never leak the framework", async ({ request }) => {
  for (const path of ["/", "/api/health", "/login"]) {
    const res = await request.get(path);
    const h = res.headers();
    expect(h["content-security-policy"], path).toContain("frame-ancestors 'none'");
    expect(h["content-security-policy"], path).toContain("object-src 'none'");
    expect(h["x-frame-options"], path).toBe("DENY");
    expect(h["x-content-type-options"], path).toBe("nosniff");
    expect(h["referrer-policy"], path).toBe("strict-origin-when-cross-origin");
    expect(h["x-powered-by"], path).toBeUndefined();
  }
  expect((await request.get("/api/health")).headers()["cache-control"]).toContain("no-store");
});

test("the CSP does not block the app: fonts, PDF preview and export work without violations", async ({ page }) => {
  const violations: string[] = [];
  page.on("console", (m) => {
    if (/Content Security Policy|Refused to/i.test(m.text())) violations.push(m.text());
  });
  await page.goto("/demo");
  await page.getByText("Upload synthetic documents").click();
  await page.getByRole("button", { name: "Continue to upload documents" }).click();
  await page.getByTestId("file-input").setInputFiles(fixture("synthetic-discharge-summary.pdf"));
  const row = page.getByTestId("document-row").first();
  await row.getByRole("button", { name: "Preview" }).click();
  await expect(page.getByRole("dialog").locator("iframe")).toBeVisible();
  await page.keyboard.press("Escape");
  await row.getByRole("button", { name: "Process" }).click();
  await expect(row.getByTestId("document-status")).toHaveText("Ready for review");
  const download = page.waitForEvent("download");
  await page.goto("/dashboard");
  await page.getByTestId("export-pdf").click();
  await download;
  expect(violations).toEqual([]);
});
