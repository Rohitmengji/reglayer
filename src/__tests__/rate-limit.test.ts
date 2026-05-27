import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock "server-only" to avoid import error in tests
vi.mock("server-only", () => ({}));

import { rateLimit, rateLimitHeaders, RATE_LIMITS } from "@/lib/rate-limit";

describe("rateLimit", () => {
  beforeEach(() => {
    // Reset module state between tests by using unique identifiers
  });

  it("allows requests within the limit", () => {
    const id = `test-allow-${Date.now()}`;
    const config = { limit: 5, windowSec: 60 };

    const result = rateLimit(id, config);

    expect(result.success).toBe(true);
    expect(result.remaining).toBe(4);
    expect(result.limit).toBe(5);
  });

  it("tracks request count correctly", () => {
    const id = `test-count-${Date.now()}`;
    const config = { limit: 3, windowSec: 60 };

    rateLimit(id, config); // remaining: 2
    rateLimit(id, config); // remaining: 1
    const result = rateLimit(id, config); // remaining: 0

    expect(result.success).toBe(true);
    expect(result.remaining).toBe(0);
  });

  it("blocks requests over the limit", () => {
    const id = `test-block-${Date.now()}`;
    const config = { limit: 2, windowSec: 60 };

    rateLimit(id, config); // 1
    rateLimit(id, config); // 2
    const result = rateLimit(id, config); // over limit

    expect(result.success).toBe(false);
    expect(result.remaining).toBe(0);
  });

  it("resets after window expires", () => {
    const id = `test-reset-${Date.now()}`;
    const config = { limit: 1, windowSec: 1 }; // 1 second window

    // Use the rate limiter
    rateLimit(id, config);

    // Fake time moving forward by manipulating the store entry
    // The implementation uses Date.now() so we use vi.useFakeTimers
    vi.useFakeTimers();
    vi.advanceTimersByTime(1500); // 1.5 seconds later

    const result = rateLimit(id, config);
    expect(result.success).toBe(true);
    expect(result.remaining).toBe(0);

    vi.useRealTimers();
  });

  it("isolates different identifiers", () => {
    const config = { limit: 1, windowSec: 60 };

    const r1 = rateLimit(`user-a-${Date.now()}`, config);
    const r2 = rateLimit(`user-b-${Date.now()}`, config);

    expect(r1.success).toBe(true);
    expect(r2.success).toBe(true);
  });
});

describe("rateLimitHeaders", () => {
  it("returns correct header values", () => {
    const result = {
      success: false,
      limit: 10,
      remaining: 0,
      resetAt: 1700000000000,
    };

    const headers = rateLimitHeaders(result);

    expect(headers["X-RateLimit-Limit"]).toBe("10");
    expect(headers["X-RateLimit-Remaining"]).toBe("0");
    expect(headers["X-RateLimit-Reset"]).toBe("1700000000");
  });
});

describe("RATE_LIMITS presets", () => {
  it("has scan preset with correct values", () => {
    expect(RATE_LIMITS.scan).toEqual({ limit: 10, windowSec: 60 });
  });

  it("has auth preset with strict limits", () => {
    expect(RATE_LIMITS.auth).toEqual({ limit: 5, windowSec: 300 });
  });

  it("has all expected presets", () => {
    expect(RATE_LIMITS).toHaveProperty("scan");
    expect(RATE_LIMITS).toHaveProperty("ai");
    expect(RATE_LIMITS).toHaveProperty("api");
    expect(RATE_LIMITS).toHaveProperty("auth");
  });
});
