import "server-only";
import { pseudonymize, securityEvent } from "@/lib/security/audit-log";
import { rateLimit } from "@/lib/security/rate-limit";
import { AppError } from "./errors";

/** Applies a named rate limit and logs when it trips. Throws a 429 AppError. */
export async function enforceRateLimit(request: Request, name: string, subject: string, limit: number, windowMs: number) {
  const result = await rateLimit(`${name}:${pseudonymize(subject) ?? "anon"}`, limit, windowMs);
  if (!result.ok) {
    securityEvent("rate_limited", request, { limit: name });
    throw new AppError("rate_limited", `Too many attempts. Please wait ${result.retryAfterSec} seconds and try again.`, 429, true);
  }
}
