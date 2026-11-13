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

  // Deleting a clinic owner's account would leave the clinic (and its patients' records) with no one
  // able to administer it. Nothing is deleted until ownership is resolved.
  const { count: owned, error: ownerError } = await supabase
    .from("organization_memberships")
    .select("id", { count: "exact", head: true })
    .eq("user_id", user.id)
    .eq("role", "owner")
    .eq("status", "active");
  if (ownerError) throw new AppError("database_error", "We could not check your clinic memberships.", 500, true);
  if (owned) {
    throw new AppError(
      "conflict",
      "You own a clinic on AFTERCARE AI. Contact support to transfer or close the clinic before deleting your account. Nothing was deleted.",
      409,
    );
  }

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
  await supabase.from("legal_acceptances").delete().eq("user_id", user.id);
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
