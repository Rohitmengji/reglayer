/**
 * RegLayer — AI Production Hardening Utilities
 *
 * Circuit breaker: stops calling a provider after N consecutive failures
 * Provider failover: auto-switch to backup provider on error
 * PII detection: basic check before sending content to LLMs
 * Semantic cache: skip LLM call if same query was answered recently
 */

import "server-only";

import { getRedis } from "@/lib/cache/redis";

// ── Circuit Breaker ───────────────────────────────────────────────────────────
// Prevents hammering a provider that's down. After 3 consecutive failures,
// the circuit "opens" and returns errors immediately for 30 seconds.
// Uses Redis so state is shared across all serverless isolates.
// Falls back to in-memory when Redis is unavailable (dev/single-instance).

const FAILURE_THRESHOLD = 3;
const RECOVERY_SEC = 30;

/** In-memory fallback for when Redis is not configured. */
const localCircuits = new Map<string, { failures: number; lastFailure: number; isOpen: boolean }>();

function circuitKey(provider: string): string {
  return `circuit:${provider}:failures`;
}

export async function isCircuitOpen(provider: string): Promise<boolean> {
  const redis = getRedis();
  if (redis) {
    try {
      const val = await redis.get<number>(circuitKey(provider));
      return (val ?? 0) >= FAILURE_THRESHOLD;
    } catch {
      return false;
    }
  }
  // Fallback: in-memory
  const state = localCircuits.get(provider);
  if (!state || !state.isOpen) return false;
  if (Date.now() - state.lastFailure > RECOVERY_SEC * 1000) {
    state.isOpen = false;
    state.failures = 0;
    return false;
  }
  return true;
}

export async function recordSuccess(provider: string): Promise<void> {
  const redis = getRedis();
  if (redis) {
    try { await redis.del(circuitKey(provider)); } catch { /* best-effort */ }
    return;
  }
  localCircuits.set(provider, { failures: 0, lastFailure: 0, isOpen: false });
}

export async function recordFailure(provider: string): Promise<void> {
  const redis = getRedis();
  if (redis) {
    try {
      const count = await redis.incr(circuitKey(provider));
      // Set TTL = RECOVERY_SEC so the circuit auto-closes after the window.
      await redis.expire(circuitKey(provider), RECOVERY_SEC);
      if (count >= FAILURE_THRESHOLD) {
        console.log(`[circuit-breaker] OPEN for ${provider} after ${count} failures (Redis-backed)`);
      }
    } catch { /* best-effort */ }
    return;
  }
  // Fallback: in-memory
  const state = localCircuits.get(provider) ?? { failures: 0, lastFailure: 0, isOpen: false };
  state.failures++;
  state.lastFailure = Date.now();
  if (state.failures >= FAILURE_THRESHOLD) {
    state.isOpen = true;
    console.log(`[circuit-breaker] OPEN for ${provider} after ${state.failures} failures`);
  }
  localCircuits.set(provider, state);
}

// ── PII Detection ─────────────────────────────────────────────────────────────
// Basic patterns that should NOT be sent to external LLM providers.
// This is a safety net, not a complete PII solution.

const PII_PATTERNS = [
  /\b\d{3}-\d{2}-\d{4}\b/, // SSN
  /\b\d{16}\b/, // Credit card (simple)
  /\b[A-Z]{2}\d{6,9}\b/, // Passport
  /\bpassword\s*[:=]\s*\S+/i, // Passwords in plain text
];

export function containsPII(text: string): boolean {
  return PII_PATTERNS.some((pattern) => pattern.test(text));
}

export function sanitizeForLLM(text: string): string {
  let sanitized = text;
  // Redact SSN-like patterns
  sanitized = sanitized.replace(/\b\d{3}-\d{2}-\d{4}\b/g, "[REDACTED-SSN]");
  // Redact credit card numbers
  sanitized = sanitized.replace(/\b\d{16}\b/g, "[REDACTED-CC]");
  return sanitized;
}

// ── Semantic Cache ────────────────────────────────────────────────────────────
// Simple in-memory cache for identical queries within a short window.
// Saves tokens on repeated questions (user refreshes, multiple tabs).

interface CacheEntry {
  response: string;
  timestamp: number;
}

const cache = new Map<string, CacheEntry>();
const CACHE_TTL_MS = 60_000; // 1 minute
const MAX_CACHE_SIZE = 100;

function getCacheKey(messages: string, userId?: string): string {
  // Include userId to prevent cross-user cache collisions.
  // Without this, two users with identical opening messages get each other's responses.
  const prefix = userId ? `${userId}:` : "";
  return prefix + messages.slice(0, 200);
}

export function getCachedResponse(messages: string, userId?: string): string | null {
  const key = getCacheKey(messages, userId);
  const entry = cache.get(key);
  if (!entry) return null;
  if (Date.now() - entry.timestamp > CACHE_TTL_MS) {
    cache.delete(key);
    return null;
  }
  return entry.response;
}

export function setCachedResponse(messages: string, response: string, userId?: string): void {
  if (cache.size >= MAX_CACHE_SIZE) {
    // Evict oldest entry
    const firstKey = cache.keys().next().value;
    if (firstKey) cache.delete(firstKey);
  }
  cache.set(getCacheKey(messages, userId), { response, timestamp: Date.now() });
}
