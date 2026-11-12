import { NextResponse, type NextRequest } from "next/server";
import { safeNext } from "@/lib/security/redirect";
import { createServerSupabase } from "@/lib/supabase/server";

/**
 * Landing point for email-confirmation and password-reset links. Exchanges the one-time code for
 * a session (HttpOnly cookies). Used, expired or tampered codes are rejected by Supabase.
 */
export async function GET(request: NextRequest) {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const next = safeNext(url.searchParams.get("next"), url.origin);
  const supabase = await createServerSupabase();
  if (code && supabase) {
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) return NextResponse.redirect(new URL(next, url.origin));
  }
  return NextResponse.redirect(new URL("/login?reason=link-invalid", url.origin));
}
