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
  const ip =
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
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
