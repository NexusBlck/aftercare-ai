import "server-only";
import { AppError } from "@/lib/api/errors";
import { serverConfig } from "@/lib/config";
import { buildSyntheticDocuments, FIXTURE_MARKER_PREFIX, type FixtureKey } from "@/lib/demo/synthetic-documents";
import type { ExplainableItem } from "@/lib/domain/explanations";
import { sanitizeExtraction, type SanitizerIssue } from "@/lib/domain/sanitize";
import type { SupportedMime } from "@/lib/security/file-validation";
import {
  EXTRACTION_SCHEMA_VERSION,
  ExplanationSchema,
  explanationJsonSchema,
  extractionJsonSchema,
  type Extraction,
  type ExplanationResponse,
} from "@/schemas/extraction";
import { generateJson } from "./client";
import { EXPLANATION_SYSTEM_INSTRUCTION, EXTRACTION_SYSTEM_INSTRUCTION, EXTRACTION_USER_PROMPT } from "./prompts";
import { parseModelJson } from "./parse";

export type PipelineStage = "reading" | "extracting" | "validating" | "explaining" | "saving";

export interface ExtractionResult {
  extraction: Extraction;
  issues: SanitizerIssue[];
  model: string;
  provider: "gemini" | "mock";
  schemaVersion: string;
}

export function requireAi() {
  const ai = serverConfig().ai;
  if (!ai) {
    throw new AppError(
      "ai_unconfigured",
      "AI document processing is not configured on this server (GEMINI_API_KEY is missing). You can explore the labelled sample plan in demo mode instead.",
      503,
    );
  }
  return ai;
}

/** Runs the model (or the deterministic test extractor), validates and sanitizes the result. */
export async function extractDocument(
  bytes: Uint8Array,
  mime: SupportedMime,
  onStage: (stage: PipelineStage) => void = () => {},
): Promise<ExtractionResult> {
  const ai = requireAi();
  onStage("extracting");

  let raw: string;
  if (ai.provider === "mock") {
    raw = JSON.stringify(mockExtraction(bytes));
  } else {
    raw = await generateJson({
      apiKey: ai.apiKey,
      model: ai.model,
      timeoutMs: ai.timeoutMs,
      thinkingLevel: ai.thinkingLevel,
      systemInstruction: EXTRACTION_SYSTEM_INSTRUCTION,
      jsonSchema: extractionJsonSchema(),
      parts: [{ inlineData: { mimeType: mime, data: Buffer.from(bytes).toString("base64") } }, { text: EXTRACTION_USER_PROMPT }],
    });
  }

  onStage("validating");
  const extraction = parseModelJson(raw);
  const sanitized = sanitizeExtraction(extraction);
  return { ...sanitized, model: ai.model, provider: ai.provider, schemaVersion: EXTRACTION_SCHEMA_VERSION };
}

/**
 * Plain-language layer. Failures are non-fatal: the caller keeps the original wording.
 * The test extractor returns no explanations rather than inventing any.
 */
export async function explainItems(items: ExplainableItem[]): Promise<ExplanationResponse | null> {
  const ai = serverConfig().ai;
  if (!ai || ai.provider === "mock" || items.length === 0) return null;
  try {
    const raw = await generateJson({
      apiKey: ai.apiKey,
      model: ai.model,
      timeoutMs: ai.timeoutMs,
      thinkingLevel: ai.thinkingLevel,
      maxRetries: 1,
      systemInstruction: EXPLANATION_SYSTEM_INSTRUCTION,
      jsonSchema: explanationJsonSchema(),
      parts: [{ text: `Rewrite each item. Input (JSON):\n${JSON.stringify({ items: items.slice(0, 60) })}` }],
    });
    const parsed = ExplanationSchema.safeParse(JSON.parse(raw));
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}

/** Deterministic TEST extractor: recognises synthetic fixtures by a marker in the PDF metadata. */
function mockExtraction(bytes: Uint8Array): Extraction {
  const text = Buffer.from(bytes.subarray(0, Math.min(bytes.length, 200_000))).toString("latin1");
  const docs = buildSyntheticDocuments();
  const match = /aftercare-fixture:([a-z-]+)/.exec(text);
  const key = match?.[1] as FixtureKey | undefined;
  const doc = key && key in docs ? docs[key] : undefined;
  if (doc?.extraction && text.includes(`${FIXTURE_MARKER_PREFIX}${doc.key}`)) return doc.extraction;
  return docs["no-clinical-content"].extraction as Extraction;
}
