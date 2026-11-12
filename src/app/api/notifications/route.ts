import { handle, ok } from "@/lib/api/route-utils";
import { mapDbError } from "@/lib/clinic/db-errors";
import { requireUser } from "@/lib/supabase/server";

/** In-app notifications for the signed-in user (staff or patient). Titles never contain medical details. */
export const GET = handle(async () => {
  const { supabase, user } = await requireUser();
  const { data, error } = await supabase
    .from("notifications")
    .select("id, type, title, link, read_at, created_at")
    .eq("recipient_user_id", user.id)
    .order("created_at", { ascending: false })
    .limit(30);
  if (error) throw mapDbError(error, "load notifications");
  return ok({ items: data ?? [], unread: (data ?? []).filter((n) => !n.read_at).length });
});
