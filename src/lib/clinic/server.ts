import "server-only";
import { cookies } from "next/headers";
import { AppError } from "@/lib/api/errors";
import { isUuid } from "@/lib/security/file-validation";
import { mfaState, needsSecondStep } from "@/lib/supabase/mfa";
import { requireUser, type AuthedContext } from "@/lib/supabase/server";
import { can, type ClinicRole, type Permission } from "./permissions";
import { mapDbError } from "./db-errors";

/** Cookie holding the clinic the signed-in staff member is working in. Always re-validated against memberships. */
export const ACTIVE_ORG_COOKIE = "aftercare_org";

export interface Membership {
  id: string;
  organization_id: string;
  role: ClinicRole;
  clinical_reviewer: boolean;
  display_name: string | null;
  email: string | null;
  organization: { id: string; name: string; slug: string; require_mfa: boolean };
}

export interface ClinicContext extends AuthedContext {
  memberships: Membership[];
  member: Membership;
  orgId: string;
}

export async function loadMemberships(ctx: AuthedContext): Promise<Membership[]> {
  const { data, error } = await ctx.supabase
    .from("organization_memberships")
    .select("id, organization_id, role, clinical_reviewer, display_name, email, organization:organizations(id, name, slug, require_mfa)")
    .eq("user_id", ctx.user.id)
    .eq("status", "active")
    .order("created_at");
  if (error) throw mapDbError(error, "load your clinic access");
  return (data ?? []) as unknown as Membership[];
}

/**
 * Verifies the session and an *active* membership. The organization comes from the user's own
 * memberships (optionally narrowed by the active-org cookie), never from request input. Two-factor
 * rules are checked here for a clear message; the database enforces the same rules (migration 0004).
 */
export async function requireClinic(permission?: Permission): Promise<ClinicContext> {
  const auth = await requireUser();
  const memberships = await loadMemberships(auth);
  if (memberships.length === 0) {
    throw new AppError("forbidden", "Your account is not a member of any clinic.", 403);
  }
  const preferred = (await cookies()).get(ACTIVE_ORG_COOKIE)?.value;
  const member = memberships.find((m) => m.organization_id === preferred) ?? memberships[0];
  const ctx: ClinicContext = { ...auth, memberships, member, orgId: member.organization_id };
  const mfa = await mfaState(auth.supabase, auth.user);
  if (needsSecondStep(mfa)) {
    throw new AppError("mfa_required", "Enter the code from your authenticator app to continue.", 401);
  }
  if (member.organization.require_mfa && mfa.currentLevel !== "aal2") {
    throw new AppError("mfa_setup_required", "Your clinic requires two-factor authentication. Set it up to continue.", 403);
  }
  if (permission) requirePermission(ctx, permission);
  return ctx;
}

export function requirePermission(ctx: ClinicContext, permission: Permission) {
  if (!can(ctx.member, permission)) {
    throw new AppError("forbidden", "Your role does not allow this action.", 403);
  }
}

export function requireId(id: string, what = "record"): string {
  if (!isUuid(id)) throw new AppError("invalid_id", `That ${what} link is not valid.`, 400);
  return id;
}

/** Calls a database function and maps its errors. */
export async function rpc<T>(ctx: AuthedContext, fn: string, args: Record<string, unknown>, fallback?: string): Promise<T> {
  const { data, error } = await ctx.supabase.rpc(fn, args);
  if (error) throw mapDbError(error, fallback);
  return data as T;
}

/** Records an allow-listed operational event. Audit failures never break the user's action. */
export async function logClinicEvent(
  ctx: ClinicContext,
  action: string,
  resourceType: string,
  resourceId: string | null,
  metadata: Record<string, string | number | boolean | null> = {},
) {
  const { error } = await ctx.supabase.rpc("log_clinic_event", {
    p_org: ctx.orgId,
    p_action: action,
    p_resource_type: resourceType,
    p_resource_id: resourceId,
    p_metadata: metadata,
  });
  if (error) console.warn(JSON.stringify({ level: "audit", type: "log_failed", action }));
}

/** Throws a 404 for missing rows; maps database errors. */
export function must<T>(result: { data: T | null; error: { message?: string; code?: string } | null }, what: string): NonNullable<T> {
  if (result.error) throw mapDbError(result.error, `load the ${what}`);
  if (!result.data) throw new AppError("not_found", `This ${what} was not found.`, 404);
  return result.data as NonNullable<T>;
}
