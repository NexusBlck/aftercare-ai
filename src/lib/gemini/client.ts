import "server-only";
import { ApiError, GoogleGenAI, ThinkingLevel, type Part } from "@google/genai";
import { AppError } from "@/lib/api/errors";

let client: { key: string; ai: GoogleGenAI } | null = null;

function getClient(apiKey: string): GoogleGenAI {
  if (!client || client.key !== apiKey) client = { key: apiKey, ai: new GoogleGenAI({ apiKey }) };
  return client.ai;
}

export interface GenerateJsonOptions {
  apiKey: string;
  model: string;
  systemInstruction: string;
  parts: Part[];
  jsonSchema: Record<string, unknown>;
  timeoutMs: number;
  maxRetries?: number;
  /** Applied to Gemini 3+ models only; older models use their default thinking behaviour. */
  thinkingLevel?: "minimal" | "low" | "medium" | "high";
}

const RETRYABLE = new Set([429, 500, 502, 503, 504]);

const THINKING: Record<NonNullable<GenerateJsonOptions["thinkingLevel"]>, ThinkingLevel> = {
  minimal: ThinkingLevel.MINIMAL,
  low: ThinkingLevel.LOW,
  medium: ThinkingLevel.MEDIUM,
  high: ThinkingLevel.HIGH,
};

function supportsThinkingLevel(model: string): boolean {
  const m = /gemini-(\d+)/.exec(model);
  return !!m && Number(m[1]) >= 3;
}

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

/**
 * Calls Gemini with structured JSON output and returns the raw text. Transient failures
 * (rate limits, 5xx) are retried with backoff; timeouts and client errors are not.
 * Document contents are never logged.
 */
export async function generateJson(opts: GenerateJsonOptions): Promise<string> {
  const ai = getClient(opts.apiKey);
  const maxRetries = opts.maxRetries ?? 2;
  let attempt = 0;

  for (;;) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), opts.timeoutMs);
    try {
      const response = await ai.models.generateContent({
        model: opts.model,
        contents: [{ role: "user", parts: opts.parts }],
        config: {
          systemInstruction: opts.systemInstruction,
          responseMimeType: "application/json",
          responseJsonSchema: opts.jsonSchema,
          temperature: 0,
          abortSignal: controller.signal,
          ...(opts.thinkingLevel && supportsThinkingLevel(opts.model)
            ? { thinkingConfig: { thinkingLevel: THINKING[opts.thinkingLevel] } }
            : {}),
        },
      });
      const text = response.text;
      if (!text) {
        const reason = response.candidates?.[0]?.finishReason;
        throw new AppError(
          "invalid_model_response",
          reason === "SAFETY" || reason === "PROHIBITED_CONTENT"
            ? "The AI service declined to process this document."
            : "The AI service returned an empty response.",
          502,
          true,
        );
      }
      return text;
    } catch (err) {
      if (err instanceof AppError) throw err;
      if (controller.signal.aborted) {
        throw new AppError("ai_timeout", "The AI service took too long to read this document. Try again, or try a smaller or clearer file.", 504, true);
      }
      const status = err instanceof ApiError ? err.status : undefined;
      if (status !== undefined && RETRYABLE.has(status) && attempt < maxRetries) {
        attempt += 1;
        await sleep(1500 * 2 ** (attempt - 1));
        continue;
      }
      throw mapGeminiError(status);
    } finally {
      clearTimeout(timer);
    }
  }
}

function mapGeminiError(status: number | undefined): AppError {
  if (status === 429) {
    return new AppError("ai_rate_limited", "The AI service is busy right now (rate limit reached). Please wait a minute and try again.", 429, true);
  }
  if (status === 401 || status === 403) {
    return new AppError("ai_unconfigured", "The AI service rejected the server's credentials. The administrator needs to check GEMINI_API_KEY.", 503);
  }
  if (status === 404) {
    return new AppError("ai_unconfigured", "The configured Gemini model was not found. The administrator needs to check GEMINI_MODEL.", 503);
  }
  if (status === 400) {
    return new AppError("ai_unavailable", "The AI service could not read this file. It may be damaged, password-protected or too large.", 422);
  }
  return new AppError("ai_unavailable", "The AI service is temporarily unavailable. Please try again shortly.", 503, true);
}
