/**
 * Whether documents are processed by free-tier AI providers, and which ones. The legal pages read this
 * so what they say always matches how the server is configured.
 */

export interface FreeTierProvider {
  name: string;
  location: string;
  terms: string;
}

const DIRECT: Record<string, FreeTierProvider & { env: string }> = {
  groq: { env: "GROQ_API_KEY", name: "Groq, Inc. (free tier)", location: "United States", terms: "https://groq.com/terms-of-use" },
  google: { env: "GOOGLE_AI_STUDIO_API_KEY", name: "Google LLC — Gemini API free tier (Google AI Studio)", location: "Google global infrastructure", terms: "https://ai.google.dev/gemini-api/terms" },
  openrouter: {
    env: "OPENROUTER_API_KEY",
    name: "OpenRouter, Inc. (free models) and the model hosts it routes to",
    location: "United States and the countries of the model hosts",
    terms: "https://openrouter.ai/terms",
  },
};

export type FreeTierAi = { mode: "free"; providers: FreeTierProvider[] } | { mode: "freellmapi"; providers: [] } | null;

export function freeTierAi(env: Record<string, string | undefined> = process.env): FreeTierAi {
  if (env.AFTERCARE_AI_PROVIDER === "freellmapi" && env.FREELLMAPI_BASE_URL && env.FREELLMAPI_API_KEY) return { mode: "freellmapi", providers: [] };
  if (env.AFTERCARE_AI_PROVIDER === "free") {
    const providers = Object.values(DIRECT)
      .filter((p) => !!env[p.env]?.trim())
      .map(({ name, location, terms }) => ({ name, location, terms }));
    if (providers.length) return { mode: "free", providers };
  }
  return null;
}

export function freeTierAiEnabled(env: Record<string, string | undefined> = process.env): boolean {
  return freeTierAi(env) !== null;
}
