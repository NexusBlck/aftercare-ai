import { NextResponse, type NextRequest } from "next/server";
import { DEMO_COOKIE, isProtectedPath } from "@/lib/mode";
import { updateSession } from "@/lib/supabase/proxy-session";

/**
 * Optimistic route protection + Supabase session refresh. API routes perform their own
 * authorization; this only decides where to send page navigations.
 */
export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
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
  matcher: ["/((?!_next/static|_next/image|favicon.ico|samples/|.*\.(?:png|jpg|svg|ico|pdf)$).*)"],
};
