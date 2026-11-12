import "server-only";
import { createHash } from "node:crypto";

/**
 * Structured security events, written to the server log (Vercel runtime logs). They never
 * contain passwords, tokens, document content or raw email/IP addresses: identifiers are
 * one-way hashed so repeated activity can be correlated without storing personal data.
 */

export type SecurityEventType =
  | "login_failed"
  | "suspicious_login_activity"
  | "rate_limited"
  | "csrf_blocked"
  | "upload_rejected"
  | "password_reset_requested"
  | "password_changed";

const SALT = process.env.SECURITY_LOG_SALT ?? "aftercare-security-log";

export function pseudonymize(value: string | null | undefined): string | null {
  if (!value) return null;
  return createHash("sha256").update(`${SALT}:${value.trim().toLowerCase()}`).digest("hex").slice(0, 16);
}

export function clientIp(request: Request): string {
  return request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || request.headers.get("x-real-ip") || "local";
}

export function securityEvent(type: SecurityEventType, request: Request, details: Record<string, string | number | boolean | null> = {}) {
  const entry = {
    level: "security",
    type,
    at: new Date().toISOString(),
    path: new URL(request.url).pathname,
    ip: pseudonymize(clientIp(request)),
    ...details,
  };
  console.warn(JSON.stringify(entry));
}

/**
 * Sliding-window counter for "N failures in T seconds" detection (per server instance).
 * Returns the number of failures for the key inside the window, including this one.
 */
const failures = new Map<string, number[]>();

export function recordFailure(key: string, windowMs: number, now = Date.now()): number {
  const hits = (failures.get(key) ?? []).filter((t) => now - t < windowMs);
  hits.push(now);
  failures.set(key, hits);
  if (failures.size > 5000) {
    for (const [k, v] of failures) if (v.every((t) => now - t >= windowMs)) failures.delete(k);
  }
  return hits.length;
}

export function clearFailures(key: string) {
  failures.delete(key);
}
