// Promptfoo custom provider: the "prompt" is a synthetic document file name; output is the pipeline's JSON.
import { execFileSync } from "node:child_process";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "../../..");

export default class AftercareExtraction {
  id() {
    return "aftercare-extraction";
  }

  async callApi(prompt) {
    const file = resolve(root, "tests/fixtures/documents", prompt.trim());
    const out = execFileSync(process.execPath, ["--conditions=react-server", "--import", "tsx", "tests/ai/promptfoo/run-extraction.ts", file], {
      cwd: root,
      env: process.env,
      encoding: "utf8",
      timeout: 280_000,
      maxBuffer: 10 * 1024 * 1024,
    });
    const line = out.trim().split("\n").filter((l) => l.startsWith("{")).pop() ?? "{}";
    return { output: line };
  }
}
