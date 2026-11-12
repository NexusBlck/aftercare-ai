import { NextResponse, type NextRequest } from "next/server";
import { DEMO_COOKIE } from "@/lib/mode";

/**
 * Leaves demo mode. POST-only so link prefetching can never trigger it. Local demo data is
 * cleared by the landing page when it sees ?demo=ended.
 */
export async function POST(request: NextRequest) {
  const response = NextResponse.redirect(new URL("/?demo=ended", request.url), 303);
  response.cookies.delete(DEMO_COOKIE);
  return response;
}
