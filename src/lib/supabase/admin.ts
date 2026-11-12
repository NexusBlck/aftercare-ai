import "server-only";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { serverConfig } from "@/lib/config";

/**
 * Service-role client. Bypasses RLS, so it is used ONLY for deleting the caller's own auth account
 * after their identity has been verified with requireUser().
 */
export function createAdminSupabase(): SupabaseClient | null {
  const cfg = serverConfig().supabase;
  if (!cfg?.serviceRoleKey) return null;
  return createClient(cfg.url, cfg.serviceRoleKey, { auth: { persistSession: false, autoRefreshToken: false } });
}
