import { handle, ok } from "@/lib/api/route-utils";
import { createServerSupabase } from "@/lib/supabase/server";

/** Ends the session and clears the HttpOnly session cookies. */
export const POST = handle(async () => {
  const supabase = await createServerSupabase();
  if (supabase) await supabase.auth.signOut();
  return ok({ ok: true });
});
