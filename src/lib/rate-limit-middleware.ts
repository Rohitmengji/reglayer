/**
 * RegLayer — Rate Limit Middleware
 *
 * WHY: API routes need rate limiting but the boilerplate is repetitive.
 * WHAT: Reusable middleware function that wraps a route handler with rate limiting.
 * HOW: Takes a preset (scan, api, auth), applies rate limit, returns 429 if exceeded, otherwise calls handler.
 */
import "server-only";
import { NextRequest, NextResponse } from "next/server";
import { rateLimit, RATE_LIMITS, rateLimitHeaders } from "@/lib/rate-limit";

type RateLimitPreset = keyof typeof RATE_LIMITS;

/**
 * Apply rate limiting to a request. Returns a 429 response if limit exceeded,
 * or null if the request is allowed.
 *
 * Usage:
 *   const blocked = await applyRateLimit(request, "scan");
 *   if (blocked) return blocked;
 */
export async function applyRateLimit(
  request: NextRequest,
  preset: RateLimitPreset,
  identifierOverride?: string
): Promise<NextResponse | null> {
  // Use rightmost x-forwarded-for IP (appended by trusted proxy, hardest to spoof).
  // Attackers control the leftmost value; the proxy they can't bypass adds the real IP last.
  const forwardedFor = request.headers.get("x-forwarded-for");
  const forwardedIps = forwardedFor?.split(",").map(s => s.trim()).filter(Boolean);
  const ip = forwardedIps?.at(-1) ||
    request.headers.get("x-real-ip") ||
    "anonymous";

  const identifier = identifierOverride || `${preset}:${ip}`;
  const rl = await rateLimit(identifier, RATE_LIMITS[preset], preset);

  if (!rl.success) {
    return NextResponse.json(
      { error: "Too many requests. Please try again later." },
      { status: 429, headers: rateLimitHeaders(rl) }
    );
  }

  return null;
}
