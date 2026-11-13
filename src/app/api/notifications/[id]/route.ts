import { handle, ok } from "@/lib/api/route-utils";
import { mapDbError } from "@/lib/clinic/db-errors";
import { requireId } from "@/lib/clinic/server";
import { requireUser } from "@/lib/supabase/server";

/** Marks a notification read. RLS and a trigger allow changing nothing else. */
export const PATCH = handle(async (_req: Request, ctx: RouteContext<"/api/notifications/[id]">) => {
  const { id } = await ctx.params;
  const { supabase, user } = await requireUser();
  const { error } = await supabase
    .from("notifications")
    .update({ read_at: new Date().toISOString() })
    .eq("id", requireId(id, "notification"))
    .eq("recipient_user_id", user.id)
    .is("read_at", null);
  if (error) throw mapDbError(error, "update the notification");
  return ok({ read: true });
});
