import "server-only";
import { createServerClient } from "@supabase/ssr";
import type { SupabaseClient, User } from "@supabase/supabase-js";
import { cookies } from "next/headers";
import { AppError } from "@/lib/api/errors";
import { serverConfig } from "@/lib/config";
import { AUTH_COOKIE_OPTIONS } from "./cookie-options";

/** Supabase client bound to the signed-in user's session. All queries run under RLS. */
export async function createServerSupabase(): Promise<SupabaseClient | null> {
  const cfg = serverConfig().supabase;
  if (!cfg) return null;
  const cookieStore = await cookies();
  return createServerClient(cfg.url, cfg.anonKey, {
    cookieOptions: AUTH_COOKIE_OPTIONS,
    cookies: {
      getAll: () => cookieStore.getAll(),
      setAll: (toSet) => {
        try {
          for (const { name, value, options } of toSet) cookieStore.set(name, value, options);
        } catch {
          // Called from a context that cannot set cookies; the proxy refreshes the session instead.
        }
      },
    },
  });
}

export interface AuthedContext {
  supabase: SupabaseClient;
  user: User;
  bucket: string;
}

/** Verifies the session with the Supabase Auth server. Throws a 401 AppError when not signed in. */
export async function requireUser(): Promise<AuthedContext> {
  const cfg = serverConfig().supabase;
  if (!cfg) {
    throw new AppError("accounts_unconfigured", "Accounts are not configured on this server. Use demo mode instead.", 503);
  }
  const supabase = await createServerSupabase();
  if (!supabase) throw new AppError("accounts_unconfigured", "Accounts are not configured.", 503);
  const { data, error } = await supabase.auth.getUser();
  if (error || !data.user) {
    throw new AppError("unauthorized", "Your session has expired. Please sign in again.", 401);
  }
  return { supabase, user: data.user, bucket: cfg.bucket };
}
