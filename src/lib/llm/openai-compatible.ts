import "server-only";
import { AppError } from "@/lib/api/errors";

/**
 * Minimal client for an OpenAI-compatible chat endpoint (used for the FreeLLMAPI router). The router
 * already fails over between providers on 429/5xx, so this client retries only once on a transient
 * error. Document contents are never logged.
 */

export type ContentPart = { type: "text"; text: string } | { type: "image_url"; image_url: { url: string } };

export interface ChatJsonOptions {
  baseUrl: string;
  apiKey: string;
  model: string;
  system: string;
  content: ContentPart[];
  timeoutMs: number;
  maxRetries?: number;
  fetchImpl?: typeof fetch;
  /** Named in error messages; omitted for the FreeLLMAPI router. */
  service?: string;
}

export interface ChatJsonResult {
  text: string;
  /** Which upstream served the call (`platform/model`), from the router's X-Routed-Via header. */
  routedVia: string | null;
}

const RETRYABLE = new Set([429, 500, 502, 503, 504]);

/** Removes Markdown fences and surrounding prose that many free models add around JSON. */
export function extractJsonText(raw: string): string {
  const trimmed = raw.trim();
  const fenced = /```(?:json)?\s*([\s\S]*?)```/i.exec(trimmed);
  const body = fenced ? fenced[1].trim() : trimmed;
  if (body.startsWith("{") || body.startsWith("[")) return body;
  const start = body.indexOf("{");
  const end = body.lastIndexOf("}");
  return start >= 0 && end > start ? body.slice(start, end + 1) : body;
}

function mapStatus(status: number, code: string | undefined, service?: string): AppError {
  if (status === 429) return new AppError("ai_rate_limited", "All free AI providers are busy or over their limits right now. Please wait a minute and try again.", 429, true);
  if (status === 401 || status === 403) return new AppError("ai_unconfigured", service ? `${service} rejected the server's API key. The administrator needs to check it.` : "The AI router rejected the server's credentials. The administrator needs to check FREELLMAPI_API_KEY.", 503);
  if (status === 422 && code === "no_vision_model") {
    return new AppError("ai_unavailable", "No image-capable AI model is enabled in the AI router, so photos cannot be read. Upload a text PDF, or enable a vision model in FreeLLMAPI.", 422);
  }
  if (status === 404) return new AppError("ai_unconfigured", "The configured AI model was not found in the router. The administrator needs to check FREELLMAPI_MODEL.", 503);
  if (status === 400 || status === 413 || status === 422) return new AppError("ai_unavailable", "The AI service could not read this document. It may be too long or in an unsupported format.", 422);
  return new AppError("ai_unavailable", "The AI service is temporarily unavailable. Please try again shortly.", 503, true);
}

export async function chatJson(opts: ChatJsonOptions): Promise<ChatJsonResult> {
  const doFetch = opts.fetchImpl ?? fetch;
  const maxRetries = opts.maxRetries ?? 1;
  for (let attempt = 0; ; attempt++) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), opts.timeoutMs);
    let response: Response;
    try {
      response = await doFetch(`${opts.baseUrl}/chat/completions`, {
        method: "POST",
        headers: { Authorization: `Bearer ${opts.apiKey}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          model: opts.model,
          temperature: 0,
          response_format: { type: "json_object" },
          messages: [
            { role: "system", content: opts.system },
            { role: "user", content: opts.content },
          ],
        }),
        signal: controller.signal,
      });
    } catch {
      clearTimeout(timer);
      if (controller.signal.aborted) {
        throw new AppError("ai_timeout", "The AI service took too long to read this document. Try again, or try a smaller or clearer file.", 504, true);
      }
      if (attempt < maxRetries) continue;
      throw new AppError("ai_unavailable", opts.service ? `${opts.service} could not be reached.` : "The AI router could not be reached. The administrator needs to check that FreeLLMAPI is running.", 503, true);
    }
    clearTimeout(timer);

    if (!response.ok) {
      let code: string | undefined;
      try {
        const body = (await response.json()) as { error?: { code?: string } };
        code = body.error?.code;
      } catch {
        // non-JSON error body
      }
      if (RETRYABLE.has(response.status) && attempt < maxRetries) {
        await new Promise((r) => setTimeout(r, 1500));
        continue;
      }
      throw mapStatus(response.status, code, opts.service);
    }

    let data: { choices?: Array<{ message?: { content?: string | null }; finish_reason?: string }> };
    try {
      data = await response.json();
    } catch {
      throw new AppError("invalid_model_response", "The AI service returned an unreadable response.", 502, true);
    }
    const text = data.choices?.[0]?.message?.content;
    if (!text) throw new AppError("invalid_model_response", "The AI service returned an empty response.", 502, true);
    return { text: extractJsonText(text), routedVia: response.headers.get("x-routed-via") };
  }
}
