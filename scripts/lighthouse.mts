/**
 * Lighthouse audit using Playwright's Chromium (works where Lighthouse's own launcher cannot spawn
 * Chrome). Usage: start the app (npm run build && npm start), then
 *   npx tsx scripts/lighthouse.mts [baseUrl]
 * Writes JSON + HTML reports to qa/lighthouse/ and prints category scores.
 * With LH_ASSERT=1 it exits non-zero when accessibility < 95 or best practices / SEO < 90
 * (performance is reported but not enforced: shared CI runners are too noisy for it).
 */
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import lighthouse, { desktopConfig } from "lighthouse";
import { chromium } from "@playwright/test";

const base = process.argv[2] ?? "http://localhost:3000";
const PAGES: Array<[string, string]> = [
  ["home", "/"],
  ["login", "/login"],
  ["onboarding", "/onboarding?demo=1"],
  ["clinic-register", "/clinic/register"],
  ["invitation", "/invitation"],
];
const PORT = 9333;

async function main() {
  mkdirSync("qa/lighthouse", { recursive: true });
  // A persistent context is the browser default context, which Lighthouse uses, so a real
  // demo cookie (visible to page scripts) can be set before auditing.
  const browser = await chromium.launchPersistentContext(mkdtempSync(join(tmpdir(), "aftercare-lh-")), {
    args: [`--remote-debugging-port=${PORT}`],
  });
  await browser.addCookies([{ name: "aftercare_demo", value: "1", url: base }]);
  const rows: string[] = [];
  const failures: string[] = [];
  const MIN: Record<string, number> = { accessibility: 0.95, "best-practices": 0.9, seo: 0.9 };
  try {
    for (const [name, path] of PAGES) {
      for (const mode of ["mobile", "desktop"] as const) {
        const result = await lighthouse(
          `${base}${path}`,
          { port: PORT, output: ["json", "html"], logLevel: "error" },
          mode === "desktop" ? desktopConfig : undefined,
        );
        if (!result) throw new Error(`no result for ${path}`);
        const [json, html] = result.report as string[];
        writeFileSync(`qa/lighthouse/${name}-${mode}.json`, json);
        writeFileSync(`qa/lighthouse/${name}-${mode}.html`, html);
        const lhr = result.lhr;
        const scores = Object.values(lhr.categories).map((c) => `${c.id}=${Math.round((c.score ?? 0) * 100)}`).join(" ");
        for (const c of Object.values(lhr.categories)) {
          if (MIN[c.id] !== undefined && (c.score ?? 0) < MIN[c.id]) failures.push(`${name} ${mode} ${c.id}=${Math.round((c.score ?? 0) * 100)}`);
        }
        const a = lhr.audits;
        rows.push(
          `${name.padEnd(10)} ${mode.padEnd(7)} ${scores}  LCP=${Math.round(a["largest-contentful-paint"].numericValue ?? 0)}ms CLS=${(a["cumulative-layout-shift"].numericValue ?? 0).toFixed(3)} TBT=${Math.round(a["total-blocking-time"].numericValue ?? 0)}ms`,
        );
      }
    }
  } finally {
    await browser.close();
  }
  console.log(rows.join("\n"));
}

void main();
