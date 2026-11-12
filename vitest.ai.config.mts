import { defineConfig, mergeConfig } from "vitest/config";
import base from "./vitest.config.mjs";

/** Live Gemini evaluation. Requires GEMINI_API_KEY; skipped otherwise. */
export default mergeConfig(
  base,
  defineConfig({ test: { include: ["tests/ai/**/*.test.ts"], testTimeout: 180_000, hookTimeout: 60_000 } }),
);
