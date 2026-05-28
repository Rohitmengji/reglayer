import "server-only";
import { Ratelimit } from "@upstash/ratelimit";
import { Redis } from "@upstash/redis";

/**
 * Rate limiter with Upstash Redis backend + in-memory fallback.
 *
 * When UPSTASH_REDIS_REST_URL and UPSTASH_REDIS_REST_TOKEN are configured,
 * uses distributed Redis-based sliding window (works across serverless instances).
 * Otherwise, falls back to in-memory fixed window (dev/single-instance).
 */

// ─── Redis-backed limiters (created lazily) ─────────────────────────────────

let redis: Redis | null = null;

function getRedis(): Redis | null {
  if (redis) return redis;
  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;
  if (url && token) {
    redis = new Redis({ url, token });
    return redis;
  }
  return null;
}

const redisLimiters = new Map<string, Ratelimit>();

function getRedisLimiter(prefix: string, limit: number, windowSec: number): Ratelimit | null {
  const r = getRedis();
  if (!r) return null;

  const key = `${prefix}:${limit}:${windowSec}`;
  if (!redisLimiters.has(key)) {
    redisLimiters.set(
      key,
      new Ratelimit({
        redis: r,
        limiter: Ratelimit.slidingWindow(limit, `${windowSec} s`),
        prefix: `rl:${prefix}`,
        analytics: true,
      })
    );
  }
  return redisLimiters.get(key)!;
}

// ─── In-memory fallback ─────────────────────────────────────────────────────

interface RateLimitEntry {
  count: number;
  resetAt: number;
}

const memoryStore = new Map<string, RateLimitEntry>();

let lastCleanup = Date.now();
function cleanup() {
  const now = Date.now();
  if (now - lastCleanup < 60_000) return;
  lastCleanup = now;
  for (const [key, entry] of memoryStore) {
    if (entry.resetAt < now) memoryStore.delete(key);
  }
}

function memoryRateLimit(identifier: string, limit: number, windowSec: number): RateLimitResult {
  cleanup();
  const now = Date.now();
  const entry = memoryStore.get(identifier);

  if (!entry || entry.resetAt < now) {
    const resetAt = now + windowSec * 1000;
    memoryStore.set(identifier, { count: 1, resetAt });
    return { success: true, limit, remaining: limit - 1, resetAt };
  }

  if (entry.count >= limit) {
    return { success: false, limit, remaining: 0, resetAt: entry.resetAt };
  }

  entry.count++;
  return { success: true, limit, remaining: limit - entry.count, resetAt: entry.resetAt };
}

// ─── Public API ─────────────────────────────────────────────────────────────

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
 * Uses Redis when configured, falls back to in-memory.
 */
export async function rateLimit(
  identifier: string,
  config: RateLimitConfig,
  prefix = "api"
): Promise<RateLimitResult> {
  const limiter = getRedisLimiter(prefix, config.limit, config.windowSec);

  if (limiter) {
    const result = await limiter.limit(identifier);
    return {
      success: result.success,
      limit: result.limit,
      remaining: result.remaining,
      resetAt: result.reset,
    };
  }

  // Fallback to in-memory
  return memoryRateLimit(`${prefix}:${identifier}`, config.limit, config.windowSec);
}

/**
 * Synchronous rate limit (in-memory only, for backward compatibility).
 * Prefer the async version when possible.
 */
export function rateLimitSync(
  identifier: string,
  config: RateLimitConfig,
  prefix = "api"
): RateLimitResult {
  return memoryRateLimit(`${prefix}:${identifier}`, config.limit, config.windowSec);
}

/**
 * Rate limit presets for different endpoint types.
 */
export const RATE_LIMITS = {
  // Scan endpoints — expensive (browser launch)
  scan: { limit: 5, windowSec: 60 },
  // Crawl — very expensive (multi-page)
  crawl: { limit: 3, windowSec: 60 },
  // AI endpoints — costly (OpenAI calls)
  ai: { limit: 10, windowSec: 60 },
  // General API — standard CRUD
  api: { limit: 60, windowSec: 60 },
  // Auth endpoints — strict to prevent brute force
  auth: { limit: 5, windowSec: 300 },
  // Integration/webhook endpoints
  integration: { limit: 20, windowSec: 60 },
  // RUM events — high volume expected
  rum: { limit: 100, windowSec: 60 },
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
