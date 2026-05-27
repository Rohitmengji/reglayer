import { NextResponse } from "next/server";

/**
 * Standardized API error responses.
 * Use these helpers in all API routes for consistent error shape.
 */

export function unauthorized(message = "Authentication required") {
  return NextResponse.json({ error: message }, { status: 401 });
}

export function forbidden(message = "Access denied") {
  return NextResponse.json({ error: message }, { status: 403 });
}

export function badRequest(message: string, details?: Record<string, unknown>) {
  return NextResponse.json({ error: message, ...(details && { details }) }, { status: 400 });
}

export function notFound(resource = "Resource") {
  return NextResponse.json({ error: `${resource} not found` }, { status: 404 });
}

export function tooManyRequests(message = "Too many requests. Please try again later.") {
  return NextResponse.json({ error: message }, { status: 429 });
}

export function serverError(message = "Internal server error") {
  return NextResponse.json({ error: message }, { status: 500 });
}
