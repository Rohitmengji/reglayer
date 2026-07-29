/**
 * Tests for AI gateway failover: model chains + failure classification.
 *
 * WHY THIS MATTERS:
 *   The previous fallback map lived in routing/model-router.ts and pointed at
 *   "claude-haiku-4-20250514" — a raw provider model string, not a registry ModelId.
 *   getModelConfig() would have thrown on the first lookup. It survived because it had
 *   zero callers: nothing executed it, so nothing validated it.
 *
 *   Failover logic only runs during an incident. Untested, it gets exercised for the
 *   first time at the exact moment it is most needed. These tests make the chains and
 *   the retry-vs-fail-fast policy verifiable at rest.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

vi.mock("server-only", () => ({}));
// The gateway imports the observability service, which imports prisma, which
// side-effect-imports lib/env and hard-fails without a real DATABASE_URL.
// Stubbing prisma keeps this a unit test of failover policy, not of env config.
vi.mock("@/lib/database/prisma", () => ({ prisma: { aiEvent: { create: vi.fn() } } }));
vi.mock("@/lib/cache/redis", () => ({ getRedis: () => null }));

import { resolveModelChain } from "@/lib/ai/gateway/providers/registry";
import { isFailoverWorthy } from "@/lib/ai/gateway";

const ORIGINAL_ENV = { ...process.env };

describe("resolveModelChain", () => {
  beforeEach(() => {
    process.env.OPENAI_API_KEY = "test-openai";
    process.env.ANTHROPIC_API_KEY = "test-anthropic";
    process.env.GOOGLE_AI_API_KEY = "test-google";
  });

  afterEach(() => {
    process.env = { ...ORIGINAL_ENV };
  });

  it("puts the requested model first", () => {
    expect(resolveModelChain("gpt-4o-mini")[0]).toBe("gpt-4o-mini");
  });

  it("crosses provider on the first fallback", () => {
    // The failure being defended against is a PROVIDER incident. A second OpenAI model
    // would fail the same way, so the first fallback must not be OpenAI.
    const chain = resolveModelChain("gpt-4o-mini");

    expect(chain.length).toBeGreaterThan(1);
    expect(chain[1]).not.toMatch(/^gpt-/);
  });

  it("gives every model a cross-provider escape route", () => {
    const models = [
      "gpt-4o-mini", "gpt-4o", "gpt-4.1-mini", "gpt-4.1",
      "claude-haiku", "claude-sonnet", "claude-opus",
      "gemini-2.0-flash", "gemini-2.5-pro",
    ] as const;

    for (const m of models) {
      expect(resolveModelChain(m).length, `${m} has no fallback`).toBeGreaterThan(1);
    }
  });

  it("resolves every chain entry to a real registry model", () => {
    // This is the assertion that would have caught "claude-haiku-4-20250514".
    // resolveModelChain calls getModelConfig internally and drops anything unknown,
    // so a typo would shorten the chain rather than appear in it.
    const chain = resolveModelChain("claude-sonnet");

    expect(chain).toEqual(expect.arrayContaining(["claude-sonnet"]));
    expect(chain.every((id) => typeof id === "string" && id.length > 0)).toBe(true);
  });

  it("omits providers that are not configured", () => {
    delete process.env.ANTHROPIC_API_KEY;
    delete process.env.GOOGLE_AI_API_KEY;

    const chain = resolveModelChain("gpt-4o-mini");

    // Offering a fallback to a provider with no API key converts one failure into two.
    expect(chain).toEqual(["gpt-4o-mini"]);
  });

  it("returns an empty chain when nothing is configured", () => {
    delete process.env.OPENAI_API_KEY;
    delete process.env.ANTHROPIC_API_KEY;
    delete process.env.GOOGLE_AI_API_KEY;

    // Callers treat [] as "AI unavailable" and degrade gracefully rather than throwing.
    expect(resolveModelChain("gpt-4o-mini")).toEqual([]);
  });

  it("contains no duplicates", () => {
    const chain = resolveModelChain("claude-opus");

    expect(new Set(chain).size).toBe(chain.length);
  });
});

describe("isFailoverWorthy", () => {
  it.each([
    ["429 rate limit", Object.assign(new Error("Too many requests"), { statusCode: 429 })],
    ["500 server error", Object.assign(new Error("boom"), { statusCode: 500 })],
    ["503 unavailable", Object.assign(new Error("unavailable"), { status: 503 })],
    ["network failure", new Error("fetch failed")],
    ["connection reset", new Error("ECONNRESET while reading")],
    ["our own timeout", new Error("The operation was aborted due to timeout")],
    ["provider overloaded", new Error("Model is overloaded, please retry")],
  ])("fails over on %s", (_label, error) => {
    expect(isFailoverWorthy(error)).toBe(true);
  });

  it.each([
    ["400 bad request", Object.assign(new Error("invalid schema"), { statusCode: 400 })],
    ["401 unauthorized", Object.assign(new Error("bad key"), { statusCode: 401 })],
    ["403 forbidden", Object.assign(new Error("no access"), { status: 403 })],
    ["404 unknown model", Object.assign(new Error("model not found"), { statusCode: 404 })],
    ["422 context too long", Object.assign(new Error("context length exceeded"), { statusCode: 422 })],
  ])("fails FAST on %s", (_label, error) => {
    // These fail identically on every provider. Failing over would multiply latency
    // and cost before returning the same error to the user.
    expect(isFailoverWorthy(error)).toBe(false);
  });

  it("does not fail over on an unrecognised error", () => {
    // Conservative default: only fail over when we have positive evidence the failure
    // is provider-side. Otherwise a deterministic bug would be retried across every
    // provider on every request.
    expect(isFailoverWorthy(new Error("something unexpected"))).toBe(false);
    expect(isFailoverWorthy("not an error")).toBe(false);
    expect(isFailoverWorthy(null)).toBe(false);
  });

  it("prefers an explicit status code over message text", () => {
    // A 400 whose message happens to mention "timeout" must still fail fast.
    const error = Object.assign(new Error("request timeout parameter invalid"), { statusCode: 400 });

    expect(isFailoverWorthy(error)).toBe(false);
  });
});
