import { existsSync } from "node:fs";
import { defineConfig, devices } from "@playwright/test";

/**
 * LIVE workflow tests: a local production build connected to a separate, disposable Supabase TEST project
 * (never production). Configure `.env.test-project.local` (gitignored) with
 *   NEXT_PUBLIC_SUPABASE_URL=https://<test-ref>.supabase.co
 *   NEXT_PUBLIC_SUPABASE_ANON_KEY=<test anon key>
 * then: build with those variables and run `npx playwright test --config playwright.live.config.ts`.
 * The deterministic test extractor is used (no AI costs) and SMTP points at localhost (no email is sent).
 */
const ENV_FILE = ".env.test-project.local";
if (existsSync(ENV_FILE)) process.loadEnvFile(ENV_FILE);
const PORT = 3300;

export default defineConfig({
  testDir: "tests/live",
  timeout: 180_000,
  fullyParallel: false,
  workers: 1,
  reporter: [["list"]],
  use: { baseURL: `http://localhost:${PORT}`, trace: "retain-on-failure", ...devices["Desktop Chrome"], viewport: { width: 1440, height: 900 } },
  webServer: {
    command: `npx next start -p ${PORT}`,
    url: `http://localhost:${PORT}`,
    reuseExistingServer: false,
    timeout: 120_000,
    env: {
      NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL ?? "",
      NEXT_PUBLIC_SUPABASE_ANON_KEY: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "",
      SUPABASE_SERVICE_ROLE_KEY: "",
      AFTERCARE_AI_PROVIDER: "mock",
      SMTP_HOST: "",
    },
  },
});
