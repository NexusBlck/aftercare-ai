/**
 * Cross-site request forgery (CSRF) check for state-changing requests.
 *
 * Browsers always attach an `Origin` header to cross-site POST/PATCH/PUT/DELETE requests, and
 * modern browsers send `Sec-Fetch-Site`. A request is rejected when either says it came from
 * another site. Together with SameSite=Lax session cookies this follows OWASP's recommended
 * defence; there are no cookie-authenticated form endpoints that need a separate token.
 */
const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);

export function isCrossSiteWrite(
  method: string,
  selfOrigin: string,
  origin: string | null,
  secFetchSite: string | null,
): boolean {
  if (SAFE_METHODS.has(method.toUpperCase())) return false;
  if (origin && origin !== "null" && origin !== selfOrigin) return true;
  if (origin === "null") return true; // sandboxed iframes, file:// and some redirects
  if (secFetchSite === "cross-site" || secFetchSite === "same-site") return true;
  return false;
}

/** General API budget per client IP; individual endpoints apply stricter limits. */
export const API_RATE_LIMIT = { limit: 300, windowMs: 60_000 } as const; // 5 requests per second on average
