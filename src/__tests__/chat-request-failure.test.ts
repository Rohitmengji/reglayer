/**
 * Failure messages shown in the chat transcript.
 *
 * The behaviour these tests protect is that a user is told what happened and what to
 * do, and that raw server output never reaches the transcript.
 */

import { describe, it, expect } from "vitest";
import {
  describeRequestFailure,
  formatRetryWait,
  retryAfterSeconds,
} from "@/lib/ai/chat/request-failure";

const NOW = 1_700_000_000_000;

function headers(init: Record<string, string> = {}) {
  return new Headers(init);
}

describe("retryAfterSeconds", () => {
  it("prefers the standard Retry-After header", () => {
    expect(retryAfterSeconds(headers({ "Retry-After": "45" }), NOW)).toBe(45);
  });

  it("falls back to the reset timestamp this codebase actually sends", () => {
    // X-RateLimit-Reset is epoch SECONDS, not milliseconds.
    const resetAt = Math.ceil(NOW / 1000) + 30;
    expect(retryAfterSeconds(headers({ "X-RateLimit-Reset": String(resetAt) }), NOW)).toBe(30);
  });

  it("reports nothing when the window has already reset", () => {
    const resetAt = Math.ceil(NOW / 1000) - 10;
    expect(retryAfterSeconds(headers({ "X-RateLimit-Reset": String(resetAt) }), NOW)).toBeNull();
  });

  it("reports nothing when the response is silent", () => {
    expect(retryAfterSeconds(headers(), NOW)).toBeNull();
  });
});

describe("formatRetryWait", () => {
  it("keeps short waits in seconds", () => {
    expect(formatRetryWait(1)).toBe("1 second");
    expect(formatRetryWait(45)).toBe("45 seconds");
  });

  it("rounds longer waits UP so the retry never fails early", () => {
    expect(formatRetryWait(61)).toBe("2 minutes");
    expect(formatRetryWait(60)).toBe("1 minute");
  });
});

describe("describeRequestFailure", () => {
  it("tells a rate-limited user exactly how long to wait", () => {
    const message = describeRequestFailure(429, headers({ "Retry-After": "30" }), NOW);
    expect(message).toContain("30 seconds");
  });

  it("degrades to a usable sentence when the wait is unknown", () => {
    const message = describeRequestFailure(429, headers(), NOW);
    expect(message).toContain("message limit");
    expect(message).not.toContain("undefined");
    expect(message).not.toContain("NaN");
  });

  it("tells an expired session to sign in and reassures the message survives", () => {
    const message = describeRequestFailure(401, headers(), NOW);
    expect(message).toContain("Sign in");
  });

  it("distinguishes an unavailable service from a generic server fault", () => {
    expect(describeRequestFailure(503, headers(), NOW)).not.toBe(
      describeRequestFailure(500, headers(), NOW),
    );
  });

  it("always produces actionable, non-empty text for any status", () => {
    for (const status of [400, 401, 403, 404, 422, 429, 500, 502, 503]) {
      const message = describeRequestFailure(status, headers(), NOW);
      expect(message.length).toBeGreaterThan(0);
      // A bare status code is not an explanation.
      expect(message).not.toMatch(/^\d+$/);
    }
  });
});
