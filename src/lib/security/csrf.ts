/**
 * CSRF Protection for API Routes
 *
 * WHY: Next.js API routes do not have built-in CSRF protection (only Server Actions do).
 *      Cross-site requests with session cookies can trigger state-changing operations.
 * WHAT: Validates Origin/Referer header against known allowed origins.
 * HOW: Checks that the request Origin matches the application's own origin.
 *      Rejects cross-origin state-changing requests (POST, PUT, DELETE, PATCH).
 *
 * Defense: Double-submit check via Origin header validation (OWASP recommended).
 */

import { NextRequest, NextResponse } from "next/server";

/** Allowed origins for the application (production + dev). */
function getAllowedOrigins(): Set<string> {
  const origins = new Set<string>();

  // Primary app URL
  const appUrl = process.env.NEXTAUTH_URL || process.env.NEXT_PUBLIC_APP_URL;
  if (appUrl) {
    try {
      origins.add(new URL(appUrl).origin);
    } catch { /* invalid URL in env */ }
  }

  // Always allow localhost in development
  if (process.env.NODE_ENV !== "production") {
    origins.add("http://localhost:3000");
    origins.add("http://127.0.0.1:3000");
  }

  // Vercel preview/production URLs
  const vercelUrl = process.env.VERCEL_URL;
  if (vercelUrl) {
    origins.add(`https://${vercelUrl}`);
  }

  // Production domain
  origins.add("https://reglayer.app");
  origins.add("https://www.reglayer.app");

  return origins;
}

/** Methods that are state-changing and require CSRF validation. */
const MUTATION_METHODS = new Set(["POST", "PUT", "DELETE", "PATCH"]);

/** Paths exempt from CSRF (webhooks from external services, public APIs with API key auth). */
const CSRF_EXEMPT_PATHS = [
  "/api/webhooks/stripe",
  "/api/ci/scan",
  "/api/guard/evaluate",
  "/api/cron/",
  "/api/rum/events",
  "/api/conversion",
];

/**
 * Validate CSRF for a request. Returns null if valid, or an error Response if invalid.
 *
 * Strategy: Origin header validation (recommended by OWASP).
 * - If Origin header present → must match allowed origins
 * - If Origin absent but Referer present → extract origin from Referer
 * - If neither present AND method is mutation → reject (except for API-key-authed requests)
 */
export function validateCsrf(request: NextRequest): NextResponse | null {
  const method = request.method.toUpperCase();

  // Only validate mutation methods
  if (!MUTATION_METHODS.has(method)) return null;

  const pathname = request.nextUrl.pathname;

  // Skip CSRF for exempt paths (external webhooks, cron jobs)
  if (CSRF_EXEMPT_PATHS.some((p) => pathname.startsWith(p))) return null;

  // Skip CSRF if request uses API key authentication (not cookie-based)
  const authHeader = request.headers.get("authorization");
  const apiKeyHeader = request.headers.get("x-api-key");
  if (authHeader?.startsWith("Bearer rl_") || apiKeyHeader) return null;

  // Get the origin from the request
  const origin = request.headers.get("origin");
  const referer = request.headers.get("referer");

  let requestOrigin: string | null = null;

  if (origin) {
    requestOrigin = origin;
  } else if (referer) {
    try {
      requestOrigin = new URL(referer).origin;
    } catch { /* malformed referer */ }
  }

  // If no origin can be determined on a mutation request from a browser,
  // reject it. Non-browser clients (curl, scripts) typically don't send Origin/Referer
  // but also don't send cookies — they use API keys instead.
  // Allow requests without origin ONLY if they also lack cookies (non-browser context).
  if (!requestOrigin) {
    const hasCookie = request.headers.has("cookie");
    if (hasCookie) {
      // Browser request without Origin/Referer — suspicious
      return NextResponse.json(
        { error: "Forbidden: missing origin header" },
        { status: 403 }
      );
    }
    // No cookie + no origin = likely a server-to-server call with API key → allow
    return null;
  }

  // Validate origin against allowlist
  const allowed = getAllowedOrigins();

  // Also allow agency subdomains
  if (requestOrigin.endsWith(".reglayer.app")) {
    return null;
  }

  if (!allowed.has(requestOrigin)) {
    return NextResponse.json(
      { error: "Forbidden: cross-origin request rejected" },
      { status: 403 }
    );
  }

  return null; // Valid — same-origin request
}
