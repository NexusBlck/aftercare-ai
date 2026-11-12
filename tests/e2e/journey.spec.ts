import { expect, test, type Page } from "@playwright/test";
import { join } from "node:path";

const fixture = (name: string) => join(process.cwd(), "tests", "fixtures", "documents", name);

async function startEmptyDemoPlan(page: Page) {
  await page.goto("/");
  await page.getByRole("link", { name: "Try the demo" }).first().click();
  await expect(page).toHaveURL(/\/onboarding/);
  await page.getByLabel("What should we call you? (optional)").fill("Jordan");
  await page.getByText("Upload synthetic documents").click();
  await page.getByLabel("Name your recovery plan (optional)").fill("E2E recovery plan");
  await page.getByRole("button", { name: "Continue to upload documents" }).click();
  await expect(page).toHaveURL(/\/documents/);
}

async function uploadAndProcess(page: Page, file: string) {
  await page.getByTestId("file-input").setInputFiles(fixture(file));
  const row = page.getByTestId("document-row").filter({ hasText: file });
  await expect(row.getByTestId("document-status")).toHaveText("Ready to process");
  await row.getByRole("button", { name: "Process" }).click();
  await expect(row.getByTestId("document-status")).toHaveText("Ready for review", { timeout: 30_000 });
  return row;
}

test("complete patient journey: upload → extract → review → correct → confirm → track → export", async ({ page }) => {
  await startEmptyDemoPlan(page);
  await expect(page.getByText("Test extractor active — not AI output")).toBeVisible();

  // Upload + process the synthetic discharge summary.
  const row = await uploadAndProcess(page, "synthetic-discharge-summary.pdf");
  await expect(row.getByRole("combobox", { name: "Document type" })).toHaveText("Discharge summary");
  await expect(row).toContainText("18 items extracted");

  // Review: everything starts as needing review.
  await page.getByRole("link", { name: "Review results" }).click();
  await expect(page).toHaveURL(/\/review/);
  await expect(page.getByText(/0 of \d+ items reviewed/)).toBeVisible();

  // Correct an extracted field.
  const ibuprofen = page.locator("article").filter({ has: page.getByRole("heading", { name: /Ibuprofen/ }) });
  await ibuprofen.getByRole("button", { name: "Correct Ibuprofen" }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByLabel("Timing").fill("After breakfast, lunch and dinner");
  await dialog.getByLabel("Why are you correcting this? (optional)").fill("Clearer for me");
  await dialog.getByRole("button", { name: "Save correction" }).click();
  await expect(ibuprofen.getByText("Edited by you")).toBeVisible();
  await expect(ibuprofen.getByText("After breakfast, lunch and dinner")).toBeVisible();

  // Confirm an instruction.
  await ibuprofen.getByRole("button", { name: "Confirm Ibuprofen matches my document" }).click();
  await expect(ibuprofen.locator('[data-status="confirmed_by_patient"]')).toBeVisible();

  // Source evidence is available for the item.
  await ibuprofen.getByRole("button", { name: "Source" }).click();
  await expect(page.getByRole("dialog")).toContainText("take 1 tablet by mouth three times a day after food for 3 days");
  await page.keyboard.press("Escape");

  // Dashboard + task completion.
  await page.goto("/dashboard");
  await expect(page.getByText("Medications confirmed")).toBeVisible();
  await expect(page.getByText("1 of 3")).toBeVisible();
  const firstTask = page.getByRole("checkbox", { name: /Mark done: Keep the wounds clean and dry/ });
  await firstTask.click();
  await expect(page.getByRole("checkbox", { name: /Mark not done: Keep the wounds clean and dry/ })).toHaveAttribute("aria-checked", "true");
  await expect(page.getByText(/1 of \d+ done/)).toBeVisible();

  // Medication details.
  await page.getByRole("link", { name: "Medications" }).first().click();
  await expect(page.getByRole("heading", { name: /Amoxicillin-clavulanate/ })).toBeVisible();
  await expect(page.getByText("After breakfast, lunch and dinner")).toBeVisible();

  // Follow-up information.
  await page.goto("/appointments");
  await expect(page.getByRole("heading", { name: "General Surgery" })).toBeVisible();
  await expect(page.getByText(/22 Nov 2026 · 10:30/)).toBeVisible();

  // Export PDF.
  await page.goto("/dashboard");
  const download = page.waitForEvent("download");
  await page.getByTestId("export-pdf").click();
  const file = await download;
  expect(file.suggestedFilename()).toMatch(/^aftercare-summary-.*\.pdf$/);
  const path = await file.path();
  expect(path).toBeTruthy();
});

test("a second document with a different schedule raises a conflict that blocks confirmation", async ({ page }) => {
  await startEmptyDemoPlan(page);
  await uploadAndProcess(page, "synthetic-discharge-summary.pdf");
  await uploadAndProcess(page, "synthetic-prescription.pdf");

  await page.goto("/review#flags");
  await expect(page.getByText(/Amoxicillin-clavulanate appears 2 times with a different frequency/)).toBeVisible();

  const amox = page.locator("article").filter({ has: page.getByRole("heading", { name: /Amoxicillin-clavulanate/ }) }).first();
  await expect(amox.locator('[data-status="conflicting"]')).toBeVisible();
  await expect(amox.getByRole("button", { name: /Confirm Amoxicillin-clavulanate/ })).toBeDisabled();

  // The missing duration becomes a neutral question for the care team.
  await page.goto("/dashboard");
  await expect(page.getByText(/Which one should I follow\?/)).toBeVisible();
});

test("unsupported and disguised files are rejected with a clear message", async ({ page }) => {
  await startEmptyDemoPlan(page);
  await page.getByTestId("file-input").setInputFiles(fixture("unsupported-notes.txt"));
  await expect(page.getByRole("alert").filter({ hasText: "Only PDF, JPG and PNG files are supported." })).toBeVisible();
  await page.getByTestId("file-input").setInputFiles(fixture("disguised-text.pdf"));
  await expect(page.getByRole("alert").filter({ hasText: /not a valid PDF, JPEG or PNG/ })).toBeVisible();
  await expect(page.getByTestId("document-row")).toHaveCount(0);
});

test("the sample plan is clearly labelled and exits cleanly", async ({ page }) => {
  await page.goto("/demo");
  await page.getByRole("button", { name: "Open the sample plan" }).click();
  await expect(page).toHaveURL(/\/dashboard/);
  await expect(page.getByText("Sample data").first()).toBeVisible();
  await expect(page.getByText(/Demo mode: synthetic data for a fictional patient/)).toBeVisible();

  await page.goto("/review");
  await expect(page.getByText("This is precomputed sample data from synthetic documents, not a live AI extraction.")).toBeVisible();

  // Direct navigation keeps demo mode (regression: prefetch must not clear the cookie).
  await page.goto("/medications");
  await expect(page).toHaveURL(/\/medications/);

  await page.getByRole("button", { name: "Exit demo" }).first().click();
  await expect(page).toHaveURL("http://localhost:3200/");
  await page.goto("/dashboard");
  await expect(page).toHaveURL(/\/login/);
});

test("protected pages redirect to sign-in without a session", async ({ page }) => {
  await page.goto("/medications");
  await expect(page).toHaveURL(/\/login\?next=%2Fmedications/);
  await expect(page.getByText(/Accounts are not configured on this server/)).toBeVisible();
});

test.describe("API safety", () => {
  test("account endpoints refuse requests without configured auth", async ({ request }) => {
    for (const url of ["/api/care-plans/current", "/api/profile", "/api/export/11111111-1111-4111-8111-111111111111"]) {
      const res = await request.get(url);
      expect(res.status(), url).toBe(503);
      expect((await res.json()).error.code).toBe("accounts_unconfigured");
    }
    const patch = await request.patch("/api/medications/11111111-1111-4111-8111-111111111111", { data: { action: "set_status", status: "confirmed_by_patient" } });
    expect(patch.status()).toBe(503);
  });

  test("stateless extraction rejects files whose bytes are not PDF/JPEG/PNG", async ({ request }) => {
    const res = await request.post("/api/extract", {
      multipart: { file: { name: "fake.pdf", mimeType: "application/pdf", buffer: Buffer.from("not really a pdf") } },
    });
    expect(res.status()).toBe(400);
    const body = await res.json();
    expect(body.error.code).toBe("unsupported_type");
    expect(JSON.stringify(body)).not.toMatch(/at \w+ \(|node_modules/); // no stack traces
  });

  test("health endpoint reports configuration without secrets", async ({ request }) => {
    const body = await (await request.get("/api/health")).json();
    expect(body).toEqual({ accounts: false, ai: "mock", model: "aftercare-test-extractor", maxUploadMb: 10 });
  });
});
