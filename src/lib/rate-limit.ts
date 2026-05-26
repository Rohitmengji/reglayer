import "server-only";

/**
 * In-memory sliding window rate limiter.
 * 
 * Production note: For multi-instance deployments, replace with Redis-based
 * rate limiting (e.g., @upstash/ratelimit). This implementation is suitable
 * for single-instance or Vercel serverless (each function instance tracks its own).
 *
 * Algorithm: Fixed window with atomic counters per identifier (IP or user ID).
 */

interface RateLimitEntry {
  count: number;
  resetAt: number;
}

const store = new Map<string, RateLimitEntry>();

// Periodic cleanup to prevent memory leaks (every 60s)
let lastCleanup = Date.now();
function cleanup() {
  const now = Date.now();
  if (now - lastCleanup < 60_000) return;
  lastCleanup = now;
  for (const [key, entry] of store) {
    if (entry.resetAt < now) store.delete(key);
  }
}

interface RateLimitConfig {
  /** Maximum requests in the window */
  limit: number;
  /** Window duration in seconds */
  windowSec: number;
}

interface RateLimitResult {
  success: boolean;
  limit: number;
  remaining: number;
  resetAt: number;
}

/**
 * Check rate limit for an identifier.
 * Returns headers-compatible result for 429 responses.
 */
export function rateLimit(
  identifier: string,
  config: RateLimitConfig
): RateLimitResult {
  cleanup();

  const now = Date.now();
  const key = identifier;
  const entry = store.get(key);

  if (!entry || entry.resetAt < now) {
    // New window
    const resetAt = now + config.windowSec * 1000;
    store.set(key, { count: 1, resetAt });
    return { success: true, limit: config.limit, remaining: config.limit - 1, resetAt };
  }

  if (entry.count >= config.limit) {
    return { success: false, limit: config.limit, remaining: 0, resetAt: entry.resetAt };
  }

  entry.count++;
  return { success: true, limit: config.limit, remaining: config.limit - entry.count, resetAt: entry.resetAt };
}

/**
 * Rate limit presets for different endpoint types.
 */
export const RATE_LIMITS = {
  // Scan endpoints — expensive (browser launch)
  scan: { limit: 10, windowSec: 60 },
  // AI endpoints — costly
  ai: { limit: 20, windowSec: 60 },
  // General API — standard CRUD
  api: { limit: 100, windowSec: 60 },
  // Auth endpoints — strict to prevent brute force
  auth: { limit: 5, windowSec: 300 },
} as const;

/**
 * Get rate limit response headers for inclusion in API responses.
 */
export function rateLimitHeaders(result: RateLimitResult): Record<string, string> {
  return {
    "X-RateLimit-Limit": String(result.limit),
    "X-RateLimit-Remaining": String(result.remaining),
    "X-RateLimit-Reset": String(Math.ceil(result.resetAt / 1000)),
  };
}
