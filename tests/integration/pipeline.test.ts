import { readFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { buildSyntheticDocuments } from "@/lib/demo/synthetic-documents";

const fixture = (name: string) => new Uint8Array(readFileSync(join(process.cwd(), "tests", "fixtures", "documents", name)));

// Controls the fake Gemini SDK below.
const generateContent = vi.fn();
vi.mock("@google/genai", () => {
  class ApiError extends Error {
    status: number;
    constructor({ message, status }: { message: string; status: number }) {
      super(message);
      this.status = status;
    }
  }
  class GoogleGenAI {
    models = { generateContent };
  }
  const ThinkingLevel = { MINIMAL: "MINIMAL", LOW: "LOW", MEDIUM: "MEDIUM", HIGH: "HIGH" };
  return { ApiError, GoogleGenAI, ThinkingLevel };
});

async function loadPipeline(env: Record<string, string>) {
  vi.resetModules();
  for (const [k, v] of Object.entries(env)) vi.stubEnv(k, v);
  return import("@/lib/gemini/pipeline");
}

beforeEach(() => {
  generateContent.mockReset();
  vi.stubEnv("GEMINI_API_KEY", "");
  vi.stubEnv("AFTERCARE_AI_PROVIDER", "");
  vi.stubEnv("GEMINI_PAID_TIER", "true");
});
afterEach(() => vi.unstubAllEnvs());

describe("deterministic test extractor (AFTERCARE_AI_PROVIDER=mock)", () => {
  it("returns the expected extraction for a recognised synthetic fixture", async () => {
    const { extractDocument } = await loadPipeline({ AFTERCARE_AI_PROVIDER: "mock" });
    const stages: string[] = [];
    const result = await extractDocument(fixture("synthetic-discharge-summary.pdf"), "application/pdf", (s) => stages.push(s));
    expect(result.provider).toBe("mock");
    expect(stages).toEqual(["extracting", "validating"]);
    expect(result.extraction).toEqual(buildSyntheticDocuments()["clear-discharge-summary"].extraction);
    expect(result.issues).toEqual([]);
  });

  it("does not invent content for unrecognised documents", async () => {
    const { extractDocument } = await loadPipeline({ AFTERCARE_AI_PROVIDER: "mock" });
    const result = await extractDocument(new TextEncoder().encode("%PDF-1.7 unknown"), "application/pdf");
    expect(result.extraction.has_clinical_content).toBe(false);
    expect(result.extraction.medications).toEqual([]);
  });

  it("reports the prompt-injection fixture without adding the injected medication", async () => {
    const { extractDocument } = await loadPipeline({ AFTERCARE_AI_PROVIDER: "mock" });
    const result = await extractDocument(fixture("synthetic-prompt-injection.pdf"), "application/pdf");
    expect(result.extraction.embedded_instructions_detected).toBe(true);
    expect(result.extraction.medications.map((m) => m.name)).toEqual(["Paracetamol"]);
    expect(result.issues.some((i) => i.description.includes("instructions aimed at software"))).toBe(true);
  });
});

describe("unconfigured AI", () => {
  it("raises a clear configuration error instead of fabricating a result", async () => {
    const { extractDocument } = await loadPipeline({});
    await expect(extractDocument(fixture("synthetic-discharge-summary.pdf"), "application/pdf")).rejects.toMatchObject({ code: "ai_unconfigured" });
  });

  it("refuses to send documents through a Gemini key not confirmed as paid tier (no training on user data)", async () => {
    const { extractDocument } = await loadPipeline({ GEMINI_API_KEY: "free-tier-key", GEMINI_PAID_TIER: "" });
    await expect(extractDocument(fixture("synthetic-discharge-summary.pdf"), "application/pdf")).rejects.toMatchObject({ code: "ai_unconfigured" });
    expect(generateContent).not.toHaveBeenCalled();
  });
});

describe("Gemini integration (SDK mocked)", () => {
  const valid = JSON.stringify(buildSyntheticDocuments()["clear-discharge-summary"].extraction);

  it("sends the document inline with the safety prompt and structured-output schema", async () => {
    generateContent.mockResolvedValue({ text: valid });
    const { extractDocument } = await loadPipeline({ GEMINI_API_KEY: "test-key", GEMINI_MODEL: "gemini-test" });
    const result = await extractDocument(fixture("synthetic-discharge-summary.pdf"), "application/pdf");
    expect(result.provider).toBe("gemini");
    expect(result.model).toBe("gemini-test");
    const call = generateContent.mock.calls[0][0];
    expect(call.model).toBe("gemini-test");
    expect(call.config.responseMimeType).toBe("application/json");
    expect(call.config.temperature).toBe(0);
    expect(call.config.responseJsonSchema.properties.medications).toBeDefined();
    expect(call.config.systemInstruction).toMatch(/untrusted data/);
    expect(call.contents[0].parts[0].inlineData.mimeType).toBe("application/pdf");
    // Thinking level is only sent to Gemini 3+ models.
    expect(call.config.thinkingConfig).toBeUndefined();
  });

  it("sends a low thinking level to Gemini 3+ models", async () => {
    generateContent.mockResolvedValue({ text: valid });
    const { extractDocument } = await loadPipeline({ GEMINI_API_KEY: "test-key", GEMINI_MODEL: "gemini-3.5-flash" });
    await extractDocument(fixture("synthetic-discharge-summary.pdf"), "application/pdf");
    expect(generateContent.mock.calls[0][0].config.thinkingConfig).toEqual({ thinkingLevel: "LOW" });
  });

  it("rejects malformed model output and saves nothing", async () => {
    generateContent.mockResolvedValue({ text: '{"document_type":"discharge_summary","medications":[' });
    const { extractDocument } = await loadPipeline({ GEMINI_API_KEY: "test-key" });
    await expect(extractDocument(fixture("synthetic-discharge-summary.pdf"), "application/pdf")).rejects.toMatchObject({ code: "invalid_model_response" });
  });

  it("rejects output with missing properties", async () => {
    const partial = JSON.parse(valid);
    delete partial.warning_signs;
    generateContent.mockResolvedValue({ text: JSON.stringify(partial) });
    const { extractDocument } = await loadPipeline({ GEMINI_API_KEY: "test-key" });
    await expect(extractDocument(fixture("synthetic-discharge-summary.pdf"), "application/pdf")).rejects.toMatchObject({ code: "invalid_model_response" });
  });

  it("treats an empty or safety-blocked response as invalid", async () => {
    generateContent.mockResolvedValue({ text: undefined, candidates: [{ finishReason: "SAFETY" }] });
    const { extractDocument } = await loadPipeline({ GEMINI_API_KEY: "test-key" });
    await expect(extractDocument(fixture("synthetic-discharge-summary.pdf"), "application/pdf")).rejects.toMatchObject({
      code: "invalid_model_response",
      message: expect.stringMatching(/declined/),
    });
  });

  it("retries a transient rate limit, then succeeds", async () => {
    const { ApiError } = await import("@google/genai");
    generateContent.mockRejectedValueOnce(new ApiError({ message: "busy", status: 429 })).mockResolvedValueOnce({ text: valid });
    vi.resetModules();
    vi.stubEnv("GEMINI_API_KEY", "test-key");
    const { generateJson } = await import("@/lib/gemini/client");
    const text = await generateJson({ apiKey: "k", model: "m", systemInstruction: "s", parts: [], jsonSchema: {}, timeoutMs: 5000, maxRetries: 1 });
    expect(text).toBe(valid);
    expect(generateContent).toHaveBeenCalledTimes(2);
  });

  it("maps persistent errors to patient-readable codes", async () => {
    const { ApiError } = await import("@google/genai");
    vi.resetModules();
    const { generateJson } = await import("@/lib/gemini/client");
    const call = () => generateJson({ apiKey: "k", model: "m", systemInstruction: "s", parts: [], jsonSchema: {}, timeoutMs: 5000, maxRetries: 0 });

    generateContent.mockRejectedValue(new ApiError({ message: "x", status: 429 }));
    await expect(call()).rejects.toMatchObject({ code: "ai_rate_limited", retryable: true });
    generateContent.mockRejectedValue(new ApiError({ message: "x", status: 404 }));
    await expect(call()).rejects.toMatchObject({ code: "ai_unconfigured" });
    generateContent.mockRejectedValue(new ApiError({ message: "x", status: 503 }));
    await expect(call()).rejects.toMatchObject({ code: "ai_unavailable" });
  });

  it("aborts slow requests with a timeout error", async () => {
    generateContent.mockImplementation(
      ({ config }: { config: { abortSignal: AbortSignal } }) =>
        new Promise((_, reject) => config.abortSignal.addEventListener("abort", () => reject(new Error("aborted")))),
    );
    vi.resetModules();
    const { generateJson } = await import("@/lib/gemini/client");
    await expect(
      generateJson({ apiKey: "k", model: "m", systemInstruction: "s", parts: [], jsonSchema: {}, timeoutMs: 50, maxRetries: 2 }),
    ).rejects.toMatchObject({ code: "ai_timeout" });
    expect(generateContent).toHaveBeenCalledTimes(1);
  });

  it("explanations failing validation are discarded, not shown", async () => {
    generateContent.mockResolvedValue({ text: '{"items":"nope"}' });
    const { explainItems } = await loadPipeline({ GEMINI_API_KEY: "test-key" });
    await expect(explainItems([{ id: "a", text: "Take 1 tablet" }])).resolves.toBeNull();
  });
});
