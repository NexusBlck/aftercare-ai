import { NextResponse, type NextRequest } from "next/server";
import { DEMO_COOKIE, isProtectedPath } from "@/lib/mode";
import { clientIp, pseudonymize, securityEvent } from "@/lib/security/audit-log";
import { rateLimit } from "@/lib/security/rate-limit";
import { API_RATE_LIMIT, isCrossSiteWrite } from "@/lib/security/request-guards";
import { updateSession } from "@/lib/supabase/proxy-session";

function jsonError(status: number, code: string, message: string, headers: Record<string, string> = {}) {
  return NextResponse.json({ error: { code, message, retryable: status === 429 } }, { status, headers: { "Cache-Control": "no-store", ...headers } });
}

/**
 * Runs before every request:
 *  1. blocks cross-site state-changing requests (CSRF),
 *  2. applies a per-IP API rate limit,
 *  3. refreshes the Supabase session and redirects page navigations that need sign-in.
 * API routes still perform their own authentication and authorization.
 */
export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  if (isCrossSiteWrite(request.method, request.nextUrl.origin, request.headers.get("origin"), request.headers.get("sec-fetch-site"))) {
    securityEvent("csrf_blocked", request, { method: request.method });
    return jsonError(403, "forbidden", "Cross-site request blocked.");
  }

  if (pathname.startsWith("/api/")) {
    const limit = rateLimit(`api:${pseudonymize(clientIp(request))}`, API_RATE_LIMIT.limit, API_RATE_LIMIT.windowMs);
    if (!limit.ok) {
      securityEvent("rate_limited", request, { limit: "api-ip" });
      return jsonError(429, "rate_limited", `Too many requests. Please wait ${limit.retryAfterSec} seconds.`, {
        "Retry-After": String(limit.retryAfterSec),
      });
    }
  }

  const { response, user } = await updateSession(request);
  const demo = request.cookies.get(DEMO_COOKIE)?.value === "1";

  if (isProtectedPath(pathname) && !user && !demo) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    url.search = `?next=${encodeURIComponent(pathname)}`;
    return NextResponse.redirect(url);
  }
  if ((pathname === "/login" || pathname === "/signup") && user) {
    const url = request.nextUrl.clone();
    url.pathname = "/dashboard";
    url.search = "";
    return NextResponse.redirect(url);
  }
  return response;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|samples/|.*\\.(?:png|jpg|svg|ico|pdf)$).*)"],
};
