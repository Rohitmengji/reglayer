import { NextResponse } from "next/server";

/**
 * Standardized API error responses.
 *
 * All API routes MUST use these helpers instead of ad-hoc NextResponse.json({ error: ... }).
 * This ensures consistent response shape for frontend error handling.
 *
 * Response shape: { error: string; code?: string; details?: unknown }
 */

type ErrorCode =
  | "UNAUTHORIZED"
  | "FORBIDDEN"
  | "NOT_FOUND"
  | "VALIDATION_ERROR"
  | "CONFLICT"
  | "RATE_LIMITED"
  | "INTERNAL_ERROR";

interface ApiErrorOptions {
  /** Machine-readable error code for frontend switch statements */
  code?: ErrorCode;
  /** Additional details (validation errors, etc.) — never expose stack traces */
  details?: unknown;
}

export function apiError(
  message: string,
  status: number,
  options?: ApiErrorOptions
): NextResponse {
  const body: Record<string, unknown> = { error: message };
  if (options?.code) body.code = options.code;
  if (options?.details) body.details = options.details;
  return NextResponse.json(body, { status });
}

/** 401 — Not authenticated */
export function unauthorized(message = "Please sign in to continue") {
  return apiError(message, 401, { code: "UNAUTHORIZED" });
}

/** 403 — Authenticated but not permitted */
export function forbidden(message = "You don\u2019t have permission to do this") {
  return apiError(message, 403, { code: "FORBIDDEN" });
}

/** 404 — Resource not found */
export function notFound(message = "The requested resource was not found") {
  return apiError(message, 404, { code: "NOT_FOUND" });
}

/** 400 — Validation / bad request */
export function badRequest(message: string, details?: unknown) {
  return apiError(message, 400, { code: "VALIDATION_ERROR", details });
}

/** 409 — Conflict (e.g., duplicate email) */
export function conflict(message: string) {
  return apiError(message, 409, { code: "CONFLICT" });
}

/** 429 — Rate limited */
export function rateLimited(message = "Too many requests. Please try again later.") {
  return apiError(message, 429, { code: "RATE_LIMITED" });
}

/** 500 — Internal error (never expose details to client) */
export function internalError(message = "Something went wrong. Please try again later.") {
  return apiError(message, 500, { code: "INTERNAL_ERROR" });
}
