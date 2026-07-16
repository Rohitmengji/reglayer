/**
 * RegLayer — Development Proxy
 *
 * WHY: Development tooling may need a proxy for API requests.
 * WHAT: HTTP proxy configuration for development environment.
 * HOW: Exports proxy configuration used by development servers.
 */
import { NextRequest, NextResponse } from "next/server";
import { getToken } from "next-auth/jwt";
import { rateLimitSync, rateLimitHeaders } from "@/lib/rate-limit";
import { validateCsrf } from "@/lib/security/csrf";

/**
 * Generate a short request correlation ID for tracing.
 * Format: timestamp(base36)-random(4 chars) — e.g., "lxk4m2-a7f3"
 */
function generateRequestId(): string {
  const ts = Date.now().toString(36);
  const rand = Math.random().toString(36).substring(2, 6);
  return `${ts}-${rand}`;
}

/**
 * Security headers applied to ALL responses.
 * Reference: OWASP Secure Headers Project
 */
const IS_PRODUCTION = process.env.NODE_ENV === "production";

const SECURITY_HEADERS: Record<string, string> = {
  "X-Content-Type-Options": "nosniff",
  "X-Frame-Options": "DENY",
  "X-XSS-Protection": "0", // Disabled per OWASP (legacy, can cause XSS in older browsers)
  "Referrer-Policy": "strict-origin-when-cross-origin",
  "Permissions-Policy": "camera=(), microphone=(), geolocation=(), interest-cohort=()",
  "Strict-Transport-Security": "max-age=63072000; includeSubDomains; preload",
  "X-DNS-Prefetch-Control": "on",
  "Content-Security-Policy": [
    "default-src 'self'",
    // Production: remove 'unsafe-eval' (no code uses eval). Dev: Turbopack HMR needs it.
    IS_PRODUCTION
      ? "script-src 'self' 'unsafe-inline'"
      : "script-src 'self' 'unsafe-inline' 'unsafe-eval'",
    "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
    "font-src 'self' https://fonts.gstatic.com data:",
    "img-src 'self' data: https: blob:",
    "connect-src 'self' https://api.openai.com https://*.neon.tech https://*.ingest.sentry.io",
    "frame-ancestors 'none'",
    "base-uri 'self'",
    "form-action 'self'",
  ].join("; "),
};

/** Main RegLayer domains — no agency context */
const MAIN_DOMAINS = new Set([
  "reglayer.app",
  "www.reglayer.app",
  "reglayer.vercel.app",
  "localhost",
  "127.0.0.1",
]);

const REGLAYER_SUFFIX = ".reglayer.app";

function applySecurityHeaders(response: NextResponse, requestId?: string): NextResponse {
  for (const [key, value] of Object.entries(SECURITY_HEADERS)) {
    response.headers.set(key, value);
  }
  // Correlation ID for request tracing — allows support/debugging to trace
  // a user-reported error back to specific logs and Sentry events.
  if (requestId) {
    response.headers.set("X-Request-Id", requestId);
  }
  return response;
}

/**
 * Extracts agency slug from subdomain if applicable.
 * Returns null for main domains or custom domains.
 */
function getAgencySlug(hostname: string): string | null {
  const host = hostname.split(":")[0];
  if (MAIN_DOMAINS.has(host)) return null;
  if (host.endsWith(REGLAYER_SUFFIX)) {
    const slug = host.slice(0, -REGLAYER_SUFFIX.length);
    if (slug && !slug.includes(".")) return slug;
  }
  return null;
}

/**
 * Determines if the request is on a white-label agency domain.
 * Sets x-agency-hostname header for server-side resolution.
 */
function isAgencyDomain(hostname: string): boolean {
  const host = hostname.split(":")[0];
  if (MAIN_DOMAINS.has(host)) return false;
  // Either subdomain of reglayer.app or a custom domain
  return true;
}

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const hostname = request.headers.get("host") || "localhost";
  const requestId = request.headers.get("x-request-id") || generateRequestId();

  // Agency tenant detection — pass hostname to server components via header
  const agencySlug = getAgencySlug(hostname);
  const isAgency = isAgencyDomain(hostname);

  // Public paths — apply security headers only
  const isPublicPath =
    pathname === "/" ||
    pathname.startsWith("/auth/") ||
    pathname.startsWith("/pricing") ||
    pathname.startsWith("/privacy") ||
    pathname.startsWith("/terms") ||
    pathname.startsWith("/cookie-policy") ||
    pathname.startsWith("/features") ||
    pathname.startsWith("/standards") ||
    pathname.startsWith("/tools") ||
    pathname.startsWith("/docs") ||
    pathname.startsWith("/api-reference") ||
    pathname.startsWith("/contact") ||
    pathname.startsWith("/request-access") ||
    pathname.startsWith("/report/") ||
    pathname.startsWith("/verify") ||
    // Independent proof verification ONLY — issue/revoke under /api/vault stay authed.
    (pathname.startsWith("/api/vault/") && pathname.endsWith("/verify")) ||
    pathname.startsWith("/api/auth/") ||
    pathname.startsWith("/api/health") ||
    pathname.startsWith("/api/openapi") ||
    pathname.startsWith("/api/badge") ||
    pathname.startsWith("/api/webhooks/stripe") ||
    pathname.startsWith("/api/certificate/") ||
    pathname.startsWith("/api/conversion") ||
    pathname.startsWith("/api/demo-scan") ||
    pathname.startsWith("/api/gate") ||
    pathname.startsWith("/api/cron/") ||
    pathname.startsWith("/api/remediate/script") ||
    pathname.startsWith("/api/journey") ||
    pathname.startsWith("/api/rum/snippet") ||
    pathname.startsWith("/api/rum/events") ||
    pathname.startsWith("/_next/") ||
    pathname.startsWith("/favicon");

  if (isPublicPath) {
    // Redirect authenticated users away from login/register pages
    if (pathname.startsWith("/auth/login") || pathname.startsWith("/auth/register")) {
      const token = await getToken({ req: request });
      if (token) {
        const dashboardUrl = new URL("/dashboard", request.url);
        return applySecurityHeaders(NextResponse.redirect(dashboardUrl), requestId);
      }
    }
    const response = NextResponse.next();
    if (isAgency) {
      response.headers.set("x-agency-hostname", hostname.split(":")[0]);
      if (agencySlug) response.headers.set("x-agency-slug", agencySlug);
    }
    return applySecurityHeaders(response, requestId);
  }

  // Protected paths — require auth
  const token = await getToken({ req: request });

  if (!token) {
    // API routes get 401 JSON, pages get redirected
    if (pathname.startsWith("/api/")) {
      const res = NextResponse.json({ error: "Unauthorized" }, { status: 401 });
      return applySecurityHeaders(res, requestId);
    }
    const loginUrl = new URL("/auth/login", request.url);
    loginUrl.searchParams.set("callbackUrl", pathname);
    return applySecurityHeaders(NextResponse.redirect(loginUrl), requestId);
  }

  // Global rate limit for all authenticated API requests (120 req/min per IP)
  if (pathname.startsWith("/api/")) {
    // CSRF protection — reject cross-origin mutation requests
    const csrfError = validateCsrf(request);
    if (csrfError) return applySecurityHeaders(csrfError, requestId);

    // Use rightmost x-forwarded-for IP (appended by trusted proxy, hardest to spoof)
    const forwardedFor = request.headers.get("x-forwarded-for");
    const forwardedIps = forwardedFor?.split(",").map(s => s.trim()).filter(Boolean);
    const ip = forwardedIps?.at(-1) ||
      request.headers.get("x-real-ip") || "anonymous";
    const globalLimit = { limit: 120, windowSec: 60 };
    const rl = rateLimitSync(`global:${ip}`, globalLimit, "global");
    if (!rl.success) {
      const res = NextResponse.json(
        { error: "Too many requests. Please slow down." },
        { status: 429, headers: rateLimitHeaders(rl) }
      );
      return applySecurityHeaders(res, requestId);
    }
  }

  const response = NextResponse.next();
  if (isAgency) {
    response.headers.set("x-agency-hostname", hostname.split(":")[0]);
    if (agencySlug) response.headers.set("x-agency-slug", agencySlug);
  }
  return applySecurityHeaders(response, requestId);
}

export const config = {
  matcher: [
    /*
     * Match all request paths except static files.
     * This ensures security headers are applied globally.
     */
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)",
  ],
};
