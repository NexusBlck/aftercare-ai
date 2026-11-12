import { defineConfig, devices } from "@playwright/test";

/**
 * E2E tests run against a production build with the deterministic TEST extractor
 * (AFTERCARE_AI_PROVIDER=mock), which is labelled in the UI as not being AI output.
 * Run: npm run build && npm run test:e2e
 */
const PORT = 3200;

export default defineConfig({
  testDir: "tests/e2e",
  timeout: 60_000,
  fullyParallel: false,
  workers: 1,
  reporter: [["list"]],
  globalSetup: "./tests/e2e/global-setup.ts",
  use: { baseURL: `http://localhost:${PORT}`, trace: "retain-on-failure", storageState: "tests/e2e/.auth/consented.json" },
  projects: [
    { name: "desktop", use: { ...devices["Desktop Chrome"], viewport: { width: 1440, height: 900 } }, testIgnore: /responsive.spec.ts/ },
    { name: "mobile", use: { ...devices["Pixel 7"] }, testMatch: /responsive\.spec\.ts/ },
  ],
  webServer: {
    command: `npx next start -p ${PORT}`,
    url: `http://localhost:${PORT}`,
    reuseExistingServer: false,
    timeout: 120_000,
    env: {
      AFTERCARE_AI_PROVIDER: "mock",
      NEXT_PUBLIC_SUPABASE_URL: "",
      NEXT_PUBLIC_SUPABASE_ANON_KEY: "",
      GEMINI_API_KEY: "",
    },
  },
});
