/**
 * RegLayer — AI Production Hardening Utilities
 *
 * Circuit breaker: stops calling a provider after N consecutive failures
 * Provider failover: auto-switch to backup provider on error
 * PII detection: basic check before sending content to LLMs
 * Semantic cache: skip LLM call if same query was answered recently
 */

import "server-only";

// ── Circuit Breaker ───────────────────────────────────────────────────────────
// Prevents hammering a provider that's down. After 3 consecutive failures,
// the circuit "opens" and returns errors immediately for 30 seconds.

interface CircuitState {
  failures: number;
  lastFailure: number;
  isOpen: boolean;
}

const circuits = new Map<string, CircuitState>();
const FAILURE_THRESHOLD = 3;
const RECOVERY_MS = 30_000;

export function isCircuitOpen(provider: string): boolean {
  const state = circuits.get(provider);
  if (!state || !state.isOpen) return false;
  // Check if recovery period has passed
  if (Date.now() - state.lastFailure > RECOVERY_MS) {
    state.isOpen = false;
    state.failures = 0;
    return false;
  }
  return true;
}

export function recordSuccess(provider: string): void {
  circuits.set(provider, { failures: 0, lastFailure: 0, isOpen: false });
}

export function recordFailure(provider: string): void {
  const state = circuits.get(provider) ?? { failures: 0, lastFailure: 0, isOpen: false };
  state.failures++;
  state.lastFailure = Date.now();
  if (state.failures >= FAILURE_THRESHOLD) {
    state.isOpen = true;
    console.log(`[circuit-breaker] OPEN for ${provider} after ${state.failures} failures`);
  }
  circuits.set(provider, state);
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

function getCacheKey(messages: string): string {
  // Simple hash: first 200 chars of the stringified messages
  return messages.slice(0, 200);
}

export function getCachedResponse(messages: string): string | null {
  const key = getCacheKey(messages);
  const entry = cache.get(key);
  if (!entry) return null;
  if (Date.now() - entry.timestamp > CACHE_TTL_MS) {
    cache.delete(key);
    return null;
  }
  return entry.response;
}

export function setCachedResponse(messages: string, response: string): void {
  if (cache.size >= MAX_CACHE_SIZE) {
    // Evict oldest entry
    const firstKey = cache.keys().next().value;
    if (firstKey) cache.delete(firstKey);
  }
  cache.set(getCacheKey(messages), { response, timestamp: Date.now() });
}
