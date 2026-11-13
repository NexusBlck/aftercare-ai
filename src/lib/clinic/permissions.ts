/**
 * Clinic roles and permissions. This mirrors the database (RLS policies and SECURITY DEFINER
 * functions in 0003_clinic_portal.sql), which remains the source of truth: the API checks these
 * first to fail fast with a clear message, and the database refuses anything the API gets wrong.
 */

export const CLINIC_ROLES = ["owner", "admin", "clinician", "nurse"] as const;
export type ClinicRole = (typeof CLINIC_ROLES)[number];

export const ROLE_LABELS: Record<ClinicRole, string> = {
  owner: "Owner",
  admin: "Administrator",
  clinician: "Clinician",
  nurse: "Nurse / staff",
};

export interface MemberAccess {
  role: ClinicRole;
  clinical_reviewer: boolean;
}

export const PERMISSIONS = [
  "org.manage",
  "staff.manage",
  "staff.manage_admins",
  "patients.read",
  "patients.write",
  "patients.archive",
  "documents.upload",
  "documents.share",
  "documents.delete",
  "plans.edit",
  "plans.submit",
  "plans.decide",
  "invitations.manage",
  "followups.verify",
  "questions.respond",
  "audit.read",
  "billing.read",
] as const;
export type Permission = (typeof PERMISSIONS)[number];

const ALL_STAFF: readonly ClinicRole[] = CLINIC_ROLES;
const MANAGERS: readonly ClinicRole[] = ["owner", "admin"];

const BY_ROLE: Record<Permission, readonly ClinicRole[]> = {
  "org.manage": MANAGERS,
  "staff.manage": MANAGERS,
  "staff.manage_admins": ["owner"],
  "patients.read": ALL_STAFF,
  "patients.write": ALL_STAFF,
  "patients.archive": MANAGERS,
  "documents.upload": ALL_STAFF,
  "documents.share": MANAGERS, // or any clinical reviewer, see below
  "documents.delete": MANAGERS,
  "plans.edit": [], // clinical reviewers only
  "plans.submit": ALL_STAFF,
  "plans.decide": [], // clinical reviewers only
  "invitations.manage": ALL_STAFF,
  "followups.verify": ALL_STAFF,
  "questions.respond": ALL_STAFF,
  "audit.read": MANAGERS,
  "billing.read": MANAGERS,
};

/** Permissions granted by being a clinical reviewer (all clinicians; owners/admins who are licensed clinicians). */
const REVIEWER: ReadonlySet<Permission> = new Set(["plans.edit", "plans.decide", "documents.share"]);

export function can(member: MemberAccess | null | undefined, permission: Permission): boolean {
  if (!member) return false;
  if (member.clinical_reviewer && member.role !== "nurse" && REVIEWER.has(permission)) return true;
  return BY_ROLE[permission].includes(member.role);
}

export function permissionsFor(member: MemberAccess): Permission[] {
  return PERMISSIONS.filter((p) => can(member, p));
}

/** Roles a member may assign when inviting or editing staff. */
export function assignableRoles(member: MemberAccess): ClinicRole[] {
  if (member.role === "owner") return ["admin", "clinician", "nurse"];
  if (member.role === "admin") return ["clinician", "nurse"];
  return [];
}

/** Clinical reviewer flag is fixed for clinicians (always) and nurses (never). */
export function normalizeReviewer(role: ClinicRole, requested: boolean): boolean {
  if (role === "clinician") return true;
  if (role === "nurse") return false;
  return requested;
}
