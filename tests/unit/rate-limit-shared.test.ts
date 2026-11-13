import { afterEach, describe, expect, it, vi } from "vitest";
import { rateLimit, redisConfig } from "@/lib/security/rate-limit";

/** A tiny in-process stand-in for Upstash's REST /multi-exec endpoint. */
function fakeUpstash() {
  const counters = new Map<string, { n: number; expiresAt: number }>();
  const seen: string[] = [];
  const impl = vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
    expect(String(url)).toBe("https://redis.example/multi-exec");
    expect((init?.headers as Record<string, string>).Authorization).toBe("Bearer test-token");
    const cmds = JSON.parse(String(init?.body)) as string[][];
    const key = cmds[0][1];
    seen.push(key);
    const now = Date.now();
    const c = counters.get(key);
    const entry = c && c.expiresAt > now ? c : { n: 0, expiresAt: 0 };
    entry.n += 1;
    if (!entry.expiresAt) entry.expiresAt = now + Number(cmds[1][2]);
    counters.set(key, entry);
    return new Response(JSON.stringify([{ result: entry.n }, { result: 1 }, { result: entry.expiresAt - now }]), { status: 200 });
  });
  return { impl: impl as unknown as typeof fetch, seen };
}

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("shared rate limiter", () => {
  it("is used only when both settings are present and the URL is https", () => {
    expect(redisConfig({})).toBeNull();
    expect(redisConfig({ UPSTASH_REDIS_REST_URL: "https://x.upstash.io" })).toBeNull();
    expect(redisConfig({ UPSTASH_REDIS_REST_URL: "http://x", UPSTASH_REDIS_REST_TOKEN: "t" })).toBeNull();
    expect(redisConfig({ KV_REST_API_URL: "https://x.upstash.io/", KV_REST_API_TOKEN: "t" })).toEqual({ url: "https://x.upstash.io", token: "t" });
  });

  it("counts across calls in Redis and blocks over the limit with a retry time", async () => {
    vi.stubEnv("UPSTASH_REDIS_REST_URL", "https://redis.example");
    vi.stubEnv("UPSTASH_REDIS_REST_TOKEN", "test-token");
    const redis = fakeUpstash();
    const key = "login-email:someone@example.com";
    expect((await rateLimit(key, 2, 60_000, redis.impl)).ok).toBe(true);
    expect((await rateLimit(key, 2, 60_000, redis.impl)).ok).toBe(true);
    const third = await rateLimit(key, 2, 60_000, redis.impl);
    expect(third.ok).toBe(false);
    expect(third.retryAfterSec).toBeGreaterThan(0);
    expect(third.retryAfterSec).toBeLessThanOrEqual(60);
  });

  it("never sends the raw key (IP, email, user id) to Redis", async () => {
    vi.stubEnv("UPSTASH_REDIS_REST_URL", "https://redis.example");
    vi.stubEnv("UPSTASH_REDIS_REST_TOKEN", "test-token");
    const redis = fakeUpstash();
    await rateLimit("upload:user-123:203.0.113.9", 5, 60_000, redis.impl);
    expect(redis.seen[0]).toMatch(/^rl:[0-9a-f]{40}$/);
    expect(redis.seen[0]).not.toContain("203.0.113.9");
  });

  it("falls back to the in-memory window when Redis fails, instead of blocking everyone", async () => {
    vi.stubEnv("UPSTASH_REDIS_REST_URL", "https://redis.example");
    vi.stubEnv("UPSTASH_REDIS_REST_TOKEN", "test-token");
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const down = vi.fn(async () => new Response("unavailable", { status: 503 })) as unknown as typeof fetch;
    const key = `fallback-${crypto.randomUUID()}`;
    expect((await rateLimit(key, 1, 60_000, down)).ok).toBe(true);
    expect((await rateLimit(key, 1, 60_000, down)).ok).toBe(false);
    warn.mockRestore();
  });
});
