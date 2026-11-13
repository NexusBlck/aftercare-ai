import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/** Scans the production client bundle (after `npm run build`) for server-only secrets. */
const staticDir = join(process.cwd(), ".next", "static");
const built = existsSync(staticDir);

function files(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const p = join(dir, name);
    return statSync(p).isDirectory() ? files(p) : p.endsWith(".js") ? [p] : [];
  });
}

describe.skipIf(!built)("client bundle", () => {
  const bundle = built ? files(staticDir).map((f) => readFileSync(f, "utf8")).join("\n") : "";

  it("does not reference server-only secret variable names", () => {
    for (const name of ["GEMINI_API_KEY", "SUPABASE_SERVICE_ROLE_KEY", "AFTERCARE_AI_PROVIDER", "SMTP_PASS", "SMTP_USER", "GROQ_API_KEY", "GOOGLE_AI_STUDIO_API_KEY", "OPENROUTER_API_KEY", "FREELLMAPI_API_KEY"]) {
      expect(bundle.includes(name), name).toBe(false);
    }
  });

  it("does not contain secret values from the environment", () => {
    for (const name of ["GEMINI_API_KEY", "SUPABASE_SERVICE_ROLE_KEY", "SMTP_PASS", "GROQ_API_KEY", "GOOGLE_AI_STUDIO_API_KEY", "OPENROUTER_API_KEY", "FREELLMAPI_API_KEY"]) {
      const value = process.env[name];
      if (value && value.length > 8) expect(bundle.includes(value), name).toBe(false);
    }
  });

  it("does not ship the Gemini SDK or server prompts to the browser", () => {
    expect(bundle.includes("You are a clinical document transcription component")).toBe(false);
    expect(bundle.includes("generativelanguage.googleapis.com")).toBe(false);
  });
});
