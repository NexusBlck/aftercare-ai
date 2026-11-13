import { handle, ok } from "@/lib/api/route-utils";
import { mapDbError } from "@/lib/clinic/db-errors";
import { can } from "@/lib/clinic/permissions";
import { requireClinic } from "@/lib/clinic/server";
import { countRows, listFollowUps } from "@/services/clinic-service";

/** Operational overview. Every number is a count of authorized records; nothing is estimated. */
export const GET = handle(async () => {
  const ctx = await requireClinic("patients.read");
  const db = ctx.supabase;
  const org = ctx.orgId;
  const nowIso = new Date().toISOString();
  const head = { count: "exact" as const, head: true };

  const [patients, linked, openEpisodes, pendingReview, inProgress, approvedPlans, pendingInvites, openQuestions, urgentQuestions] = await Promise.all([
    countRows(db.from("clinic_patients").select("id", head).eq("organization_id", org).eq("status", "active")),
    countRows(db.from("clinic_patients").select("id", head).eq("organization_id", org).eq("status", "active").not("user_id", "is", null)),
    countRows(db.from("care_episodes").select("id", head).eq("organization_id", org).eq("status", "open")),
    countRows(db.from("plan_versions").select("id", head).eq("organization_id", org).eq("status", "pending_review")),
    countRows(db.from("plan_versions").select("id", head).eq("organization_id", org).in("status", ["draft", "changes_requested"])),
    countRows(db.from("recovery_plans").select("id", head).eq("organization_id", org).not("approved_version_id", "is", null)),
    countRows(db.from("patient_invitations").select("id", head).eq("organization_id", org).is("redeemed_at", null).is("revoked_at", null).gt("expires_at", nowIso)),
    countRows(db.from("patient_questions").select("id", head).eq("organization_id", org).in("status", ["new", "assigned", "in_progress"])),
    countRows(db.from("patient_questions").select("id", head).eq("organization_id", org).in("status", ["new", "assigned", "in_progress"]).eq("urgent_keywords", true)),
  ]);

  const [recentPatients, reviewQueue, activity, followUps] = await Promise.all([
    db.from("clinic_patients").select("id, full_name, mrn, created_at, linked_at").eq("organization_id", org).eq("status", "active").order("created_at", { ascending: false }).limit(5),
    db
      .from("plan_versions")
      .select("id, version, submitted_at, plan:recovery_plans!plan_versions_plan_id_organization_id_fkey(id, title, patient:clinic_patients(id, full_name))")
      .eq("organization_id", org)
      .eq("status", "pending_review")
      .order("submitted_at", { ascending: true })
      .limit(5),
    can(ctx.member, "audit.read")
      ? db.from("audit_logs").select("id, action, resource_type, resource_id, created_at, actor_user_id").eq("organization_id", org).order("created_at", { ascending: false }).limit(8)
      : Promise.resolve({ data: null, error: null }),
    listFollowUps(ctx),
  ]);
  const failed = [recentPatients, reviewQueue, activity].find((r) => r.error);
  if (failed?.error) throw mapDbError(failed.error, "load the dashboard");

  return ok({
    metrics: {
      patients,
      linked,
      openEpisodes,
      pendingReview,
      inProgress,
      approvedPlans,
      pendingInvites,
      openQuestions,
      urgentQuestions,
      upcomingFollowUps: followUps.filter((f) => f.due === "upcoming").length,
      overdueFollowUps: followUps.filter((f) => f.due === "overdue").length,
    },
    recentPatients: recentPatients.data ?? [],
    reviewQueue: reviewQueue.data ?? [],
    activity: activity.data,
    followUps: followUps.filter((f) => f.due === "overdue" || f.due === "upcoming").slice(0, 6),
  });
});
