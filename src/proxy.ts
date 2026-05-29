/**
 * RegLayer — Development Proxy
 *
 * WHY: Development tooling may need a proxy for API requests.
 * WHAT: HTTP proxy configuration for development environment.
 * HOW: Exports proxy configuration used by development servers.
 */
import { NextRequest, NextResponse } from "next/server";
import { getToken } from "next-auth/jwt";

/**
 * Security headers applied to ALL responses.
 * Reference: OWASP Secure Headers Project
 */
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
    "script-src 'self' 'unsafe-inline' 'unsafe-eval'", // Next.js requires inline scripts
    "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
    "font-src 'self' https://fonts.gstatic.com data:",
    "img-src 'self' data: https: blob:",
    "connect-src 'self' https://api.openai.com https://*.neon.tech https://*.ingest.sentry.io",
    "frame-ancestors 'none'",
    "base-uri 'self'",
    "form-action 'self'",
  ].join("; "),
};

function applySecurityHeaders(response: NextResponse): NextResponse {
  for (const [key, value] of Object.entries(SECURITY_HEADERS)) {
    response.headers.set(key, value);
  }
  return response;
}

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

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
    pathname.startsWith("/docs") ||
    pathname.startsWith("/api-reference") ||
    pathname.startsWith("/contact") ||
    pathname.startsWith("/request-access") ||
    pathname.startsWith("/report/") ||
    pathname.startsWith("/api/auth/") ||
    pathname.startsWith("/api/health") ||
    pathname.startsWith("/api/badge") ||
    pathname.startsWith("/api/certificate/") ||
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
        return applySecurityHeaders(NextResponse.redirect(dashboardUrl));
      }
    }
    return applySecurityHeaders(NextResponse.next());
  }

  // Protected paths — require auth
  const token = await getToken({ req: request });

  if (!token) {
    // API routes get 401 JSON, pages get redirected
    if (pathname.startsWith("/api/")) {
      const res = NextResponse.json({ error: "Unauthorized" }, { status: 401 });
      return applySecurityHeaders(res);
    }
    const loginUrl = new URL("/auth/login", request.url);
    loginUrl.searchParams.set("callbackUrl", pathname);
    return applySecurityHeaders(NextResponse.redirect(loginUrl));
  }

  return applySecurityHeaders(NextResponse.next());
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
