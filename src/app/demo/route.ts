import { NextResponse, type NextRequest } from "next/server";
import { DEMO_COOKIE } from "@/lib/mode";

/** Enters demo mode (synthetic data only) and continues to onboarding. */
export async function GET(request: NextRequest) {
  const response = NextResponse.redirect(new URL("/onboarding?demo=1", request.url));
  response.cookies.set(DEMO_COOKIE, "1", { path: "/", sameSite: "lax", maxAge: 60 * 60 * 24 * 7, httpOnly: false });
  return response;
}
