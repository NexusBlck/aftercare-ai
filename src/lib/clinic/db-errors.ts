import { AppError, type ApiErrorCode } from "@/lib/api/errors";

/**
 * Maps errors raised by the clinic database layer (RLS, constraints, `raise exception '<code>'` in
 * SECURITY DEFINER functions) to patient- and staff-friendly API errors. Database messages are
 * never passed through verbatim.
 */

const KNOWN: Record<string, { code: ApiErrorCode; status: number; message: string }> = {
  unauthorized: { code: "unauthorized", status: 401, message: "Your session has expired. Please sign in again." },
  forbidden: { code: "forbidden", status: 403, message: "Your role does not allow this action." },
  not_found: { code: "not_found", status: 404, message: "That record was not found." },
  subscription_inactive: {
    code: "subscription_inactive",
    status: 403,
    message: "The clinic subscription is not active, so new records cannot be added. Contact your clinic administrator.",
  },
  plan_limit_reached: { code: "plan_limit_reached", status: 403, message: "Your subscription plan limit has been reached." },
  slug_taken: { code: "conflict", status: 409, message: "That clinic address is already taken. Try another." },
  too_many_organizations: { code: "conflict", status: 409, message: "You already own the maximum number of clinics." },
  already_member: { code: "conflict", status: 409, message: "This person is already a member of the clinic." },
  invalid_role: { code: "invalid_request", status: 400, message: "That role is not valid." },
  cannot_change_self: { code: "forbidden", status: 403, message: "You cannot change your own role or access." },
  invitation_invalid: { code: "invitation_invalid", status: 400, message: "This invitation link is not valid or has been withdrawn." },
  invitation_used: { code: "invitation_invalid", status: 400, message: "This invitation has already been used." },
  invitation_expired: { code: "invitation_invalid", status: 400, message: "This invitation has expired. Ask the clinic for a new one." },
  invitation_email_mismatch: {
    code: "forbidden",
    status: 403,
    message: "This invitation was sent to a different email address. Sign in with the invited address.",
  },
  plan_exists: { code: "conflict", status: 409, message: "This care episode already has a recovery plan." },
  invalid_transition: { code: "conflict", status: 409, message: "This plan version is no longer in a state that allows that action. Refresh and try again." },
  version_locked: { code: "conflict", status: 409, message: "Submitted, approved and rejected versions cannot be edited. Start a new revision instead." },
  version_in_progress: { code: "conflict", status: 409, message: "A revision of this plan is already in progress." },
  comment_required: { code: "invalid_request", status: 400, message: "Add a comment explaining the decision." },
  invalid_decision: { code: "invalid_request", status: 400, message: "That decision is not valid." },
  already_linked: { code: "conflict", status: 409, message: "This patient has already linked their account." },
  no_approved_plan: { code: "conflict", status: 409, message: "Approve a recovery plan for this patient before inviting them." },
  patient_archived: { code: "conflict", status: 409, message: "This patient record is archived." },
  question_closed: { code: "conflict", status: 409, message: "This conversation is closed." },
  invalid_status: { code: "invalid_request", status: 400, message: "That status is not valid." },
  invalid_assignee: { code: "invalid_request", status: 400, message: "That staff member cannot be assigned." },
  invalid_action: { code: "invalid_request", status: 400, message: "That action is not allowed." },
  immutable_column: { code: "invalid_request", status: 400, message: "That field cannot be changed." },
  rate_limited: { code: "rate_limited", status: 429, message: "Too many requests. Please try again later." },
};

interface DbErrorLike {
  message?: string;
  code?: string;
  hint?: string | null;
}

export function mapDbError(error: DbErrorLike | null | undefined, fallback = "complete that request"): AppError {
  const message = error?.message ?? "";
  const known = KNOWN[message.trim()];
  if (known) {
    const detail = message.trim() === "plan_limit_reached" && error?.hint ? ` (${error.hint.replace(/_/g, " ")})` : "";
    return new AppError(known.code, known.message + detail, known.status, known.code === "rate_limited");
  }
  if (error?.code === "23505") return new AppError("duplicate", "A matching record already exists.", 409);
  if (error?.code === "23503") return new AppError("invalid_request", "A linked record was not found.", 400);
  if (error?.code === "23514" || error?.code === "22P02" || error?.code === "22007" || error?.code === "22008") {
    return new AppError("invalid_request", "Some details are not valid.", 400);
  }
  if (error?.code === "42501" || /row-level security/i.test(message)) {
    return new AppError("forbidden", "Your role does not allow this action.", 403);
  }
  return new AppError("database_error", `We could not ${fallback}. Please try again.`, 500, true);
}
