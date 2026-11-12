/**
 * Whether documents are processed by free-tier AI providers through the FreeLLMAPI router. The legal
 * pages read this so what they say always matches how the server is configured.
 */
export function freeTierAiEnabled(env: Record<string, string | undefined> = process.env): boolean {
  return env.AFTERCARE_AI_PROVIDER === "freellmapi" && !!env.FREELLMAPI_BASE_URL && !!env.FREELLMAPI_API_KEY;
}
