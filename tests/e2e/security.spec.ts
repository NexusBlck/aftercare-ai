import { expect, test } from "@playwright/test";

/** Security protections, tested against the production build. */

const EVIL = "https://evil.example";

test.describe("CSRF and CORS", () => {
  test("cross-site state-changing requests are rejected before reaching any handler", async ({ request }) => {
    for (const [method, url] of [
      ["POST", "/api/auth/login"],
      ["POST", "/api/legal"],
      ["PATCH", "/api/medications/11111111-1111-4111-8111-111111111111"],
      ["DELETE", "/api/account"],
      ["POST", "/demo/exit"],
    ] as const) {
      const res = await request.fetch(url, { method, headers: { Origin: EVIL, "Content-Type": "application/json" }, data: "{}" });
      expect(res.status(), `${method} ${url}`).toBe(403);
      expect((await res.json()).error.code).toBe("forbidden");
    }
    const sfs = await request.post("/api/auth/login", { headers: { "Sec-Fetch-Site": "cross-site" }, data: {} });
    expect(sfs.status()).toBe(403);
  });

  test("same-origin requests pass the CSRF check", async ({ request, baseURL }) => {
    const res = await request.post("/api/auth/login", {
      headers: { Origin: baseURL as string },
      data: { email: "someone@example.com", password: "irrelevant" },
    });
    expect(res.status()).not.toBe(403); // reaches the handler (503: accounts not configured in this test build)
  });

  test("no CORS access is granted to other origins", async ({ request }) => {
    const preflight = await request.fetch("/api/care-plans/current", {
      method: "OPTIONS",
      headers: { Origin: EVIL, "Access-Control-Request-Method": "PATCH", "Access-Control-Request-Headers": "content-type" },
    });
    expect(preflight.headers()["access-control-allow-origin"]).toBeUndefined();
    const get = await request.get("/api/health", { headers: { Origin: EVIL } });
    expect(get.headers()["access-control-allow-origin"]).toBeUndefined();
    expect(get.headers()["access-control-allow-credentials"]).toBeUndefined();
  });
});

test("API rate limit returns 429 with Retry-After", async ({ request }) => {
  // A unique client address isolates this test's bucket from the rest of the suite.
  const headers = { "X-Forwarded-For": "203.0.113.77" };
  let limited = null;
  for (let i = 0; i < 320 && !limited; i++) {
    const res = await request.get("/api/health", { headers });
    if (res.status() === 429) limited = res;
  }
  expect(limited, "expected a 429 within 320 requests").not.toBeNull();
  expect(Number(limited!.headers()["retry-after"])).toBeGreaterThan(0);
  expect((await limited!.json()).error.code).toBe("rate_limited");
});

test("sensitive files are never served", async ({ request }) => {
  for (const path of [
    "/.env",
    "/.env.local",
    "/.env.backup",
    "/.env.production",
    "/.git/config",
    "/.git/HEAD",
    "/db-dump.sql",
    "/package.json",
    "/package-lock.json",
    "/next.config.ts",
    "/supabase/migrations/0001_init.sql",
    "/src/lib/config.ts",
    "/.vercel/project.json",
    "/.strix/instructions.md",
    "/tests/e2e/.auth/consented.json",
  ]) {
    const res = await request.get(path);
    expect(res.status(), path).toBe(404);
    expect(await res.text(), path).not.toMatch(/SUPABASE|GEMINI|\[core\]|create table/);
  }
});

test("server-side validation rejects malformed and out-of-range input", async ({ request }) => {
  const bad = [
    ["/api/auth/login", { email: "not-an-email", password: "x" }],
    ["/api/auth/signup", { email: "a@b.co", password: "short", consents: { age: true, terms: true, health_data: true, marketing: false } }],
    ["/api/auth/signup", { email: "a@b.co", password: "x".repeat(73), consents: { age: true, terms: true, health_data: true, marketing: false } }],
    ["/api/auth/signup", { email: "a@b.co", password: "long-enough-1", consents: { age: true, terms: false, health_data: true, marketing: false } }],
    ["/api/auth/reset", { email: "<script>alert(1)</script>" }],
  ] as const;
  for (const [url, data] of bad) {
    const res = await request.post(url, { data, headers: { "X-Forwarded-For": "203.0.113.78" } });
    expect(res.status(), `${url} ${JSON.stringify(data).slice(0, 60)}`).toBe(400);
    const body = await res.json();
    expect(body.error.code).toBe("invalid_request");
    expect(JSON.stringify(body)).not.toMatch(/at \w+ \(|node_modules|stack/i);
  }
});

test("XSS: script and HTML in user input render as plain text", async ({ page }) => {
  let dialog = false;
  page.on("dialog", async (d) => {
    dialog = true;
    await d.dismiss();
  });
  await page.goto("/demo");
  await page.getByRole("button", { name: "Open the sample plan" }).click();
  await expect(page).toHaveURL(/\/dashboard/);
  await page.goto("/medications");
  const card = page.locator("article").filter({ has: page.getByRole("heading", { name: /Ibuprofen/ }) });
  await card.getByRole("button", { name: "Correct Ibuprofen" }).click();
  const payload = `<script>window.__xss=1;alert(1)</script><img src=x onerror="window.__xss=2;alert(2)">`;
  await page.getByRole("dialog").getByLabel("Special instructions").fill(payload);
  await page.getByRole("dialog").getByRole("button", { name: "Save correction" }).click();
  await expect(card.getByText(payload)).toBeVisible();
  expect(await page.evaluate(() => (window as unknown as { __xss?: number }).__xss)).toBeUndefined();
  expect(await card.locator("script, img[src='x']").count()).toBe(0);
  expect(dialog).toBe(false);
});

test("auth pages and links fail safely", async ({ page }) => {
  await page.goto("/forgot-password");
  await expect(page.getByRole("heading", { name: "Reset your password" })).toBeVisible();
  await page.goto("/reset-password");
  await expect(page.getByRole("heading", { name: "Choose a new password" })).toBeVisible();
  await page.goto("/auth/callback?code=forged-or-expired&next=https://evil.example");
  await expect(page).toHaveURL(/\/login\?reason=link-invalid/);
  await expect(page.getByText(/invalid, expired or has already been used/)).toBeVisible();
  await page.goto("/login");
  await expect(page.getByRole("link", { name: "Forgot password?" })).toBeVisible();
});

test("unknown pages show a generic not-found page", async ({ page }) => {
  const res = await page.goto("/definitely-not-a-page");
  expect(res?.status()).toBe(404);
  await expect(page.getByRole("heading", { name: "Page not found" })).toBeVisible();
});
