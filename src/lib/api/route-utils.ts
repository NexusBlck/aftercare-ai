import "server-only";
import { NextResponse } from "next/server";
import { ZodError, type ZodType } from "zod";
import { PatchError } from "@/lib/domain/patch";
import { AppError, type ApiErrorBody } from "./errors";

export function ok<T>(data: T, init?: ResponseInit) {
  return NextResponse.json(data, { ...init, headers: { "Cache-Control": "no-store", ...init?.headers } });
}

/** Converts any thrown value into a predictable error body. Never exposes stack traces or document text. */
export function toErrorResponse(err: unknown) {
  let appErr: AppError;
  if (err instanceof AppError) appErr = err;
  else if (err instanceof PatchError) {
    appErr = new AppError(
      err.code === "not_found" ? "not_found" : "invalid_request",
      err.message,
      err.code === "not_found" ? 404 : err.code === "not_allowed" ? 409 : 400,
    );
  } else if (err instanceof ZodError) appErr = new AppError("invalid_request", "The request was not valid.", 400);
  else {
    // Log only the error type/message — never request bodies or document contents.
    console.error("[aftercare] unexpected error:", err instanceof Error ? err.message : "unknown");
    appErr = new AppError("internal_error", "Something went wrong on our side. Please try again.", 500, true);
  }
  const body: ApiErrorBody = { error: { code: appErr.code, message: appErr.message, retryable: appErr.retryable } };
  return NextResponse.json(body, { status: appErr.status, headers: { "Cache-Control": "no-store" } });
}

export async function parseJson<T>(request: Request, schema: ZodType<T>): Promise<T> {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    throw new AppError("invalid_request", "The request body must be JSON.", 400);
  }
  const result = schema.safeParse(body);
  if (!result.success) throw new AppError("invalid_request", "The request was not valid.", 400);
  return result.data;
}

export function handle<A extends unknown[]>(fn: (...args: A) => Promise<Response>) {
  return async (...args: A): Promise<Response> => {
    try {
      return await fn(...args);
    } catch (err) {
      return toErrorResponse(err);
    }
  };
}
