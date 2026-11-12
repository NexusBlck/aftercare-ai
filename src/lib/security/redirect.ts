/**
 * Only allow same-origin paths after login. Resolving against the current origin also rejects
 * tricks such as "//evil.com" and "/\evil.com" (browsers treat the backslash as a slash).
 */
export function safeNext(next: string | null, origin: string): string {
  if (!next || !next.startsWith("/")) return "/dashboard";
  try {
    const url = new URL(next, origin);
    return url.origin === origin ? `${url.pathname}${url.search}${url.hash}` : "/dashboard";
  } catch {
    return "/dashboard";
  }
}
