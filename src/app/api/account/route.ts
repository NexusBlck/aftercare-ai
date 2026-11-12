import { AppError } from "@/lib/api/errors";
import { handle, ok } from "@/lib/api/route-utils";
import { createAdminSupabase } from "@/lib/supabase/admin";
import { requireUser } from "@/lib/supabase/server";

/**
 * Deletes all of the caller's stored files and records. If the service-role key is configured the
 * auth account itself is also deleted; otherwise data is erased and the response says so.
 */
export const DELETE = handle(async () => {
  const { supabase, user, bucket } = await requireUser();

  const { data: docs, error: listError } = await supabase.from("documents").select("file_path").eq("user_id", user.id);
  if (listError) throw new AppError("database_error", "We could not list your documents.", 500, true);
  const paths = (docs ?? []).map((d) => d.file_path as string | null).filter((p): p is string => !!p);
  if (paths.length) {
    const { error } = await supabase.storage.from(bucket).remove(paths);
    if (error) throw new AppError("storage_error", "We could not delete your stored files. Nothing else was deleted.", 502, true);
  }
  // Cascades to documents and every extracted item.
  const { error: planError } = await supabase.from("care_plans").delete().eq("user_id", user.id);
  if (planError) throw new AppError("database_error", "We could not delete your care plans.", 500, true);
  await supabase.from("profiles").delete().eq("id", user.id);

  const admin = createAdminSupabase();
  let accountDeleted = false;
  if (admin) {
    const { error } = await admin.auth.admin.deleteUser(user.id);
    accountDeleted = !error;
  }
  await supabase.auth.signOut();
  return ok({ dataDeleted: true, accountDeleted });
});
