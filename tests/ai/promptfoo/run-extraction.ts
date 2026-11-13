/**
 * Runs the app's real extraction pipeline (prompt → model → Zod → sanitizer) on one file, merges the
 * result into an empty plan (which adds rule-based conflict flags) and prints JSON for Promptfoo.
 * Synthetic documents only.
 *   node --conditions=react-server --import tsx tests/ai/promptfoo/run-extraction.ts <file>
 */
import { readFileSync } from "node:fs";
import { applyExtraction } from "@/lib/domain/apply-extraction";
import { createEmptyBundle } from "@/lib/domain/plan";
import { extractDocument } from "@/lib/gemini/pipeline";
import { checkFileContent } from "@/lib/security/file-validation";

const path = process.argv[2];
const bytes = new Uint8Array(readFileSync(path));
const check = checkFileContent(bytes, 10 * 1024 * 1024);
let n = 0;
const ctx = { now: new Date().toISOString(), newId: () => `id-${++n}` };

if (!check.ok) {
  console.log(JSON.stringify({ error: { code: check.code, message: check.message } }));
} else {
  extractDocument(bytes, check.mime)
    .then((r) => {
      const empty = createEmptyBundle("plan", "eval", ctx);
      const doc = {
        id: "doc", care_plan_id: "plan", file_path: null, original_filename: path, mime_type: check.mime, file_size: bytes.length,
        document_type: "unknown" as const, classification_source: "none" as const, processing_status: "processing" as const,
        processing_error: null, sample_text: null, created_at: ctx.now, updated_at: ctx.now,
      };
      const plan = applyExtraction({ ...empty, documents: [doc] }, { documentId: "doc", extraction: r.extraction, issues: r.issues }, ctx);
      const flags = plan.flags.map((f) => ({ kind: f.kind, category: f.category, origin: f.origin, rule_key: f.rule_key }));
      console.log(JSON.stringify({ model: r.model, provider: r.provider, extraction: r.extraction, issues: r.issues, flags }));
    })
    .catch((e: { code?: string; message?: string }) => console.log(JSON.stringify({ error: { code: e.code ?? "error", message: e.message ?? String(e) } })));
}
