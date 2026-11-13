import { handle, ok } from "@/lib/api/route-utils";
import { createServerSupabase } from "@/lib/supabase/server";

/**
 * Is anyone signed in? Always 200, so public pages can ask without a 401 showing up as a browser
 * console error. Reveals nothing beyond the caller's own state.
 */
export const GET = handle(async () => {
  const supabase = await createServerSupabase();
  if (!supabase) return ok({ signed_in: false, accounts: false });
  const { data } = await supabase.auth.getUser();
  return ok({ signed_in: !!data.user, accounts: true });
});
