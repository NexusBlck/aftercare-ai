import { afterEach, describe, expect, it, vi } from "vitest";
import { clearFailures, pseudonymize, recordFailure } from "@/lib/security/audit-log";
import { isCrossSiteWrite } from "@/lib/security/request-guards";
import { LoginSchema, NewPasswordSchema, SignupSchema } from "@/schemas/auth";

const SELF = "https://aftercare-ai-pi.vercel.app";

describe("CSRF: cross-site write detection", () => {
  it("allows same-origin writes and all safe methods", () => {
    expect(isCrossSiteWrite("POST", SELF, SELF, "same-origin")).toBe(false);
    expect(isCrossSiteWrite("PATCH", SELF, null, null)).toBe(false); // non-browser client, carries no victim cookies
    expect(isCrossSiteWrite("GET", SELF, "https://evil.example", "cross-site")).toBe(false);
    expect(isCrossSiteWrite("OPTIONS", SELF, "https://evil.example", "cross-site")).toBe(false);
  });

  it("blocks writes from other origins, opaque origins and cross-site fetches", () => {
    expect(isCrossSiteWrite("POST", SELF, "https://evil.example", "cross-site")).toBe(true);
    expect(isCrossSiteWrite("DELETE", SELF, "http://aftercare-ai-pi.vercel.app", null)).toBe(true); // scheme mismatch
    expect(isCrossSiteWrite("POST", SELF, "null", null)).toBe(true);
    expect(isCrossSiteWrite("PUT", SELF, null, "cross-site")).toBe(true);
    expect(isCrossSiteWrite("POST", SELF, null, "same-site")).toBe(true);
  });
});

describe("server-side auth validation", () => {
  const consents = { accepted: true, marketing: false };

  it("normalises emails and rejects invalid ones", () => {
    expect(LoginSchema.parse({ email: "  Pat@Example.COM ", password: "x" }).email).toBe("pat@example.com");
    expect(LoginSchema.safeParse({ email: "not-an-email", password: "x" }).success).toBe(false);
    expect(LoginSchema.safeParse({ email: `${"a".repeat(250)}@x.io`, password: "x" }).success).toBe(false);
  });

  it("enforces 8-72 character passwords (bcrypt ignores bytes beyond 72)", () => {
    expect(NewPasswordSchema.safeParse({ password: "1234567" }).success).toBe(false);
    expect(NewPasswordSchema.safeParse({ password: "12345678" }).success).toBe(true);
    expect(NewPasswordSchema.safeParse({ password: "x".repeat(72) }).success).toBe(true);
    expect(NewPasswordSchema.safeParse({ password: "x".repeat(73) }).success).toBe(false);
  });

  it("requires the agreement to be literally true; marketing is optional", () => {
    expect(SignupSchema.safeParse({ email: "a@b.co", password: "12345678", consents }).success).toBe(true);
    expect(SignupSchema.safeParse({ email: "a@b.co", password: "12345678", consents: { ...consents, marketing: true } }).success).toBe(true);
    expect(SignupSchema.safeParse({ email: "a@b.co", password: "12345678", consents: { ...consents, accepted: false } }).success).toBe(false);
    expect(SignupSchema.safeParse({ email: "a@b.co", password: "12345678", consents: { ...consents, accepted: "true" } }).success).toBe(false);
    expect(SignupSchema.safeParse({ email: "a@b.co", password: "12345678", consents: { marketing: false } }).success).toBe(false);
  });
});

describe("session cookie attributes", () => {
  afterEach(() => vi.unstubAllEnvs());

  it("are HttpOnly, SameSite=Lax and Secure in production", async () => {
    vi.resetModules();
    vi.stubEnv("NODE_ENV", "production");
    const { AUTH_COOKIE_OPTIONS } = await import("@/lib/supabase/cookie-options");
    expect(AUTH_COOKIE_OPTIONS).toMatchObject({ httpOnly: true, secure: true, sameSite: "lax", path: "/" });
    expect(AUTH_COOKIE_OPTIONS.maxAge).toBeLessThanOrEqual(60 * 60 * 24 * 30);
  });
});

describe("security logging", () => {
  it("pseudonymises identifiers one-way and consistently", () => {
    const a = pseudonymize("Pat@Example.com");
    expect(a).toBe(pseudonymize("pat@example.com"));
    expect(a).not.toContain("pat");
    expect(a).toHaveLength(16);
    expect(pseudonymize(null)).toBeNull();
  });

  it("detects 5 failed logins inside the window and forgets old ones", () => {
    const key = `test-${Math.random()}`;
    const t0 = 1_000_000;
    for (let i = 0; i < 4; i++) expect(recordFailure(key, 2_000, t0 + i * 100)).toBe(i + 1);
    expect(recordFailure(key, 2_000, t0 + 500)).toBe(5); // 5 failures within 2 seconds
    expect(recordFailure(key, 2_000, t0 + 10_000)).toBe(1); // window passed
    clearFailures(key);
  });
});
