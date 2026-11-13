import { createHash } from "node:crypto";

/**
 * Rate limiting. With Upstash Redis configured (UPSTASH_REDIS_REST_URL/TOKEN, or the KV_REST_API_*
 * names Vercel's Upstash integration sets) every server instance shares one counter per key, so limits
 * hold across serverless instances. Without it, or if Redis is slow or unreachable, a per-instance
 * in-memory window is used instead: requests are never blocked because the limiter itself failed.
 *
 * Keys are hashed before they leave the server, so Redis never sees IP addresses, emails or user ids.
 */

const buckets = new Map<string, number[]>();

export type LimitResult = { ok: boolean; retryAfterSec: number };

/** Per-instance sliding window (also the fallback). */
export function memoryRateLimit(key: string, limit: number, windowMs: number, now: number = Date.now()): LimitResult {
  const hits = (buckets.get(key) ?? []).filter((t) => now - t < windowMs);
  if (hits.length >= limit) {
    buckets.set(key, hits);
    return { ok: false, retryAfterSec: Math.ceil((windowMs - (now - hits[0])) / 1000) };
  }
  hits.push(now);
  buckets.set(key, hits);
  if (buckets.size > 5000) {
    for (const [k, v] of buckets) if (v.every((t) => now - t >= windowMs)) buckets.delete(k);
  }
  return { ok: true, retryAfterSec: 0 };
}

interface RedisConfig {
  url: string;
  token: string;
}

export function redisConfig(env: Record<string, string | undefined> = process.env): RedisConfig | null {
  const url = (env.UPSTASH_REDIS_REST_URL ?? env.KV_REST_API_URL)?.trim().replace(/\/$/, "");
  const token = (env.UPSTASH_REDIS_REST_TOKEN ?? env.KV_REST_API_TOKEN)?.trim();
  return url && token && url.startsWith("https://") ? { url, token } : null;
}

const REDIS_TIMEOUT_MS = 400;

/** Fixed-window counter in Redis: one atomic round trip (INCR, set expiry on first hit, read TTL). */
async function redisRateLimit(cfg: RedisConfig, key: string, limit: number, windowMs: number, fetchImpl: typeof fetch): Promise<LimitResult> {
  const k = `rl:${createHash("sha256").update(key).digest("hex").slice(0, 40)}`;
  const res = await fetchImpl(`${cfg.url}/multi-exec`, {
    method: "POST",
    headers: { Authorization: `Bearer ${cfg.token}`, "Content-Type": "application/json" },
    body: JSON.stringify([
      ["INCR", k],
      ["PEXPIRE", k, String(windowMs), "NX"],
      ["PTTL", k],
    ]),
    signal: AbortSignal.timeout(REDIS_TIMEOUT_MS),
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`redis ${res.status}`);
  const [count, , ttl] = ((await res.json()) as Array<{ result?: number; error?: string }>).map((r) => {
    if (r.error) throw new Error("redis command failed");
    return Number(r.result);
  });
  if (count > limit) return { ok: false, retryAfterSec: Math.max(1, Math.ceil((ttl > 0 ? ttl : windowMs) / 1000)) };
  return { ok: true, retryAfterSec: 0 };
}

let warned = false;

export async function rateLimit(key: string, limit: number, windowMs: number, fetchImpl: typeof fetch = fetch): Promise<LimitResult> {
  const cfg = redisConfig();
  if (!cfg) return memoryRateLimit(key, limit, windowMs);
  try {
    return await redisRateLimit(cfg, key, limit, windowMs, fetchImpl);
  } catch (err) {
    if (!warned) {
      warned = true;
      console.warn(JSON.stringify({ level: "warn", type: "rate_limit_store_unavailable", reason: err instanceof Error ? err.name : "unknown" }));
    }
    return memoryRateLimit(key, limit, windowMs);
  }
}

export function clientKey(request: Request): string {
  const forwarded = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  return forwarded || request.headers.get("x-real-ip") || "local";
}
