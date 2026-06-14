/**
 * RegLayer — Redis Cache Layer
 *
 * WHY: Shared Redis client for caching (session, dedup, RUM buffer).
 * WHAT: Exposes get/set/exists/del/lpush/lrange with TTL and graceful fallback.
 * HOW: Uses the same Upstash Redis instance as rate limiting.
 */
import "server-only";
import { Redis } from "@upstash/redis";

let redis: Redis | null = null;

export function getRedis(): Redis | null {
  if (redis) return redis;
  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;
  if (url && token && url.startsWith("https://") && !url.includes("replace_me")) {
    redis = new Redis({ url, token });
    return redis;
  }
  return null;
}

/**
 * Get a cached value. Returns null if key doesn't exist or Redis is unavailable.
 */
export async function cacheGet<T>(key: string): Promise<T | null> {
  const r = getRedis();
  if (!r) return null;
  try {
    return await r.get<T>(key);
  } catch {
    return null;
  }
}

/**
 * Set a cached value with TTL (seconds).
 */
export async function cacheSet(key: string, value: unknown, ttlSec: number): Promise<void> {
  const r = getRedis();
  if (!r) return;
  try {
    await r.set(key, value, { ex: ttlSec });
  } catch {
    // Non-critical — cache miss is acceptable
  }
}

/**
 * Delete a cached key.
 */
export async function cacheDel(key: string): Promise<void> {
  const r = getRedis();
  if (!r) return;
  try {
    await r.del(key);
  } catch {
    // Non-critical
  }
}

/**
 * Check if a key exists (useful for dedup).
 * Returns false if Redis unavailable.
 */
export async function cacheExists(key: string): Promise<boolean> {
  const r = getRedis();
  if (!r) return false;
  try {
    return (await r.exists(key)) === 1;
  } catch {
    return false;
  }
}

/**
 * Set a key only if it doesn't exist (atomic dedup lock).
 * Returns true if the key was set (no duplicate), false if it already existed.
 */
export async function cacheSetNX(key: string, value: unknown, ttlSec: number): Promise<boolean> {
  const r = getRedis();
  if (!r) return true; // No Redis = allow through
  try {
    const result = await r.set(key, value, { ex: ttlSec, nx: true });
    return result === "OK";
  } catch {
    return true; // On error, allow through
  }
}

/**
 * Push events to a Redis list (for buffering). Trims to maxLen.
 */
export async function listPush(key: string, items: unknown[], maxLen: number, ttlSec: number): Promise<number> {
  const r = getRedis();
  if (!r) return 0;
  try {
    const pipeline = r.pipeline();
    for (const item of items) {
      pipeline.rpush(key, item);
    }
    pipeline.ltrim(key, -maxLen, -1);
    pipeline.expire(key, ttlSec);
    const results = await pipeline.exec();
    // First rpush result is the list length
    return (results[0] as number) || 0;
  } catch {
    return 0;
  }
}

/**
 * Get all items from a Redis list.
 */
export async function listGet<T>(key: string): Promise<T[]> {
  const r = getRedis();
  if (!r) return [];
  try {
    return await r.lrange<T>(key, 0, -1);
  } catch {
    return [];
  }
}
