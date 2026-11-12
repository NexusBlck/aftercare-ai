import "server-only";
import { z } from "zod";

/**
 * Server-side environment validation. Secrets are read only here and never exposed through
 * NEXT_PUBLIC_ variables. Missing optional integrations put the app in a clearly labelled state
 * instead of crashing.
 */

const EnvSchema = z.object({
  NEXT_PUBLIC_SUPABASE_URL: z.url().optional().or(z.literal("")),
  NEXT_PUBLIC_SUPABASE_ANON_KEY: z.string().optional(),
  SUPABASE_SERVICE_ROLE_KEY: z.string().optional(),
  SUPABASE_STORAGE_BUCKET: z.string().min(1).default("medical-documents"),
  GEMINI_API_KEY: z.string().optional(),
  GEMINI_MODEL: z.string().min(1).default("gemini-3.5-flash"),
  GEMINI_TIMEOUT_MS: z.coerce.number().int().min(5_000).max(300_000).default(90_000),
  GEMINI_THINKING_LEVEL: z.enum(["minimal", "low", "medium", "high"]).default("low"),
  MAX_UPLOAD_MB: z.coerce.number().min(1).max(50).default(10),
  AFTERCARE_AI_PROVIDER: z.enum(["gemini", "mock", ""]).optional(),
});

export type ServerConfig = {
  supabase: { url: string; anonKey: string; serviceRoleKey: string | null; bucket: string } | null;
  ai:
    | { provider: "gemini"; apiKey: string; model: string; timeoutMs: number; thinkingLevel: "minimal" | "low" | "medium" | "high" }
    | { provider: "mock"; model: string; timeoutMs: number }
    | null;
  maxUploadBytes: number;
};

let cached: ServerConfig | null = null;

export function serverConfig(): ServerConfig {
  if (cached) return cached;
  const env = EnvSchema.parse({
    ...process.env,
    NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL || undefined,
    GEMINI_MODEL: process.env.GEMINI_MODEL || undefined,
    GEMINI_TIMEOUT_MS: process.env.GEMINI_TIMEOUT_MS || undefined,
    MAX_UPLOAD_MB: process.env.MAX_UPLOAD_MB || undefined,
    GEMINI_THINKING_LEVEL: process.env.GEMINI_THINKING_LEVEL || undefined,
    SUPABASE_STORAGE_BUCKET: process.env.SUPABASE_STORAGE_BUCKET || undefined,
  });

  const supabase =
    env.NEXT_PUBLIC_SUPABASE_URL && env.NEXT_PUBLIC_SUPABASE_ANON_KEY
      ? {
          url: env.NEXT_PUBLIC_SUPABASE_URL,
          anonKey: env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
          serviceRoleKey: env.SUPABASE_SERVICE_ROLE_KEY || null,
          bucket: env.SUPABASE_STORAGE_BUCKET,
        }
      : null;

  let ai: ServerConfig["ai"] = null;
  if (env.AFTERCARE_AI_PROVIDER === "mock") {
    ai = { provider: "mock", model: "aftercare-test-extractor", timeoutMs: env.GEMINI_TIMEOUT_MS };
  } else if (env.GEMINI_API_KEY) {
    ai = {
      provider: "gemini",
      apiKey: env.GEMINI_API_KEY,
      model: env.GEMINI_MODEL,
      timeoutMs: env.GEMINI_TIMEOUT_MS,
      thinkingLevel: env.GEMINI_THINKING_LEVEL,
    };
  }

  cached = { supabase, ai, maxUploadBytes: Math.floor(env.MAX_UPLOAD_MB * 1024 * 1024) };
  return cached;
}

/** Safe, secret-free description of the configuration for the UI. */
export function publicStatus() {
  const cfg = serverConfig();
  return {
    accounts: cfg.supabase !== null,
    ai: cfg.ai === null ? ("unconfigured" as const) : cfg.ai.provider,
    model: cfg.ai?.model ?? null,
    maxUploadMb: Math.round(cfg.maxUploadBytes / 1024 / 1024),
  };
}
export type PublicStatus = ReturnType<typeof publicStatus>;
