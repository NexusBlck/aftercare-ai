/** Error codes shared by the API and the client. Messages are written for patients. */
export type ApiErrorCode =
  | "unauthorized"
  | "forbidden"
  | "not_found"
  | "invalid_request"
  | "invalid_id"
  | "unsupported_type"
  | "file_too_large"
  | "empty_file"
  | "storage_error"
  | "database_error"
  | "ai_unconfigured"
  | "ai_rate_limited"
  | "ai_timeout"
  | "ai_unavailable"
  | "invalid_model_response"
  | "already_processing"
  | "rate_limited"
  | "accounts_unconfigured"
  | "account_exists"
  | "conflict"
  | "duplicate"
  | "subscription_inactive"
  | "plan_limit_reached"
  | "invitation_invalid"
  | "pdf_failed"
  | "unsafe_file"
  | "mfa_required"
  | "mfa_setup_required"
  | "mfa_invalid_code"
  | "internal_error";

export interface ApiErrorBody {
  error: { code: ApiErrorCode; message: string; retryable?: boolean };
}

export class AppError extends Error {
  constructor(
    public code: ApiErrorCode,
    message: string,
    public status: number = 400,
    public retryable = false,
  ) {
    super(message);
  }
}

export function isApiErrorBody(value: unknown): value is ApiErrorBody {
  return (
    typeof value === "object" &&
    value !== null &&
    "error" in value &&
    typeof (value as ApiErrorBody).error?.code === "string"
  );
}
