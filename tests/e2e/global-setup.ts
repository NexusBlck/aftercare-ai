import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { LEGAL_DOCUMENTS, LEGAL_VERSIONS } from "../../src/lib/legal";

/**
 * Browser state for tests that are not about consent: current legal versions already accepted
 * in demo mode and the cookie notice dismissed. tests/e2e/legal.spec.ts starts without it.
 */
export default function globalSetup() {
  const accepted = LEGAL_DOCUMENTS.map((document) => ({
    document,
    version: LEGAL_VERSIONS[document],
    accepted_at: "2026-11-12T00:00:00.000Z",
    source: "in_app",
  }));
  const state = {
    cookies: [],
    origins: [
      {
        origin: "http://localhost:3200",
        localStorage: [
          { name: "aftercare.demo.legal.v1", value: JSON.stringify(accepted) },
          { name: "aftercare.cookie-notice", value: "1" },
        ],
      },
    ],
  };
  const dir = join(process.cwd(), "tests", "e2e", ".auth");
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, "consented.json"), JSON.stringify(state, null, 2));
}
