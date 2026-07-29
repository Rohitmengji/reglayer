/**
 * Tool orchestration.
 *
 * The properties under test are the ones whose violation is silent and expensive:
 * a retried write duplicating billable work, a cache serving one tenant's data to
 * another, a cancelled request continuing to run, and a driver error reaching the model.
 */

import { describe, it, expect, vi } from "vitest";
import {
  assertPolicySound,
  describeToolFailure,
  executeTool,
  renderToolOutcome,
  ToolCache,
  type ToolCapability,
  type ToolPolicy,
} from "@/lib/ai/tools/orchestrator";

const READ: ToolPolicy = {
  name: "getRecentScans",
  kind: "read",
  capability: "scans:read",
  timeoutMs: 50,
  maxAttempts: 3,
  cacheTtlMs: 1_000,
};

const WRITE: ToolPolicy = {
  name: "triggerScan",
  kind: "write",
  capability: "scans:write",
  timeoutMs: 50,
  maxAttempts: 1,
  cacheTtlMs: 0,
};

const ALL: ToolCapability[] = ["scans:read", "scans:write", "reference:read"];

function exec(overrides: Partial<Parameters<typeof executeTool>[0]> = {}) {
  return executeTool({
    policy: READ,
    granted: ALL,
    tenant: "ws-1",
    args: { limit: 5 },
    run: async () => "ok",
    ...overrides,
  });
}

// ── Policy soundness ─────────────────────────────────────────────────────────

describe("policy soundness", () => {
  it("refuses a write policy that permits retries", () => {
    // Retrying a scan trigger bills the customer twice.
    expect(() => assertPolicySound({ ...WRITE, maxAttempts: 2 })).toThrow(/duplicates its effect/);
  });

  it("accepts a single-attempt write and a retrying read", () => {
    expect(() => assertPolicySound(WRITE)).not.toThrow();
    expect(() => assertPolicySound(READ)).not.toThrow();
  });
});

// ── Authorisation ────────────────────────────────────────────────────────────

describe("authorisation", () => {
  it("denies a tool the caller lacks capability for", async () => {
    const run = vi.fn();
    const outcome = await exec({ policy: WRITE, granted: ["scans:read"], run });

    expect(outcome).toMatchObject({ ok: false, reason: "denied" });
    // A denied call must perform no work at all.
    expect(run).not.toHaveBeenCalled();
  });

  it("checks capability before touching the cache", async () => {
    const cache = new ToolCache();
    cache.set("ws-1", READ.name, { limit: 5 }, "leaked", 1_000);

    const outcome = await exec({ granted: [], cache });

    expect(outcome.ok).toBe(false);
    if (!outcome.ok) expect(outcome.message).not.toContain("leaked");
  });

  it("allows a permitted tool", async () => {
    await expect(exec()).resolves.toMatchObject({ ok: true, result: "ok" });
  });
});

// ── Cancellation ─────────────────────────────────────────────────────────────

describe("cancellation", () => {
  it("does not start work that was already cancelled", async () => {
    const controller = new AbortController();
    controller.abort();
    const run = vi.fn();

    const outcome = await exec({ signal: controller.signal, run });

    expect(outcome).toMatchObject({ ok: false, reason: "cancelled" });
    expect(run).not.toHaveBeenCalled();
  });

  it("passes a signal into the tool so slow work can be abandoned", async () => {
    let received: AbortSignal | null = null;
    await exec({ run: async (signal) => { received = signal; return "ok"; } });

    // Racing a promise abandons the loser but never stops it; the signal is what does.
    expect(received).not.toBeNull();
  });

  it("stops retrying once the user cancels", async () => {
    const controller = new AbortController();
    const run = vi.fn().mockImplementation(async () => {
      controller.abort();
      throw new Error("boom");
    });

    const outcome = await exec({ signal: controller.signal, run });

    expect(outcome).toMatchObject({ ok: false, reason: "cancelled" });
    // Retrying after an explicit stop ignores the user.
    expect(run).toHaveBeenCalledTimes(1);
  });
});

// ── Timeouts and retries ─────────────────────────────────────────────────────

describe("timeouts and retries", () => {
  it("aborts work that exceeds the deadline", async () => {
    const outcome = await exec({
      policy: { ...READ, maxAttempts: 1, timeoutMs: 10 },
      run: (signal) => new Promise((_resolve, reject) => {
        signal.addEventListener("abort", () => reject(new DOMException("Aborted", "AbortError")));
      }),
    });

    expect(outcome).toMatchObject({ ok: false, reason: "timeout" });
  });

  it("retries a failing read up to its limit", async () => {
    const run = vi.fn().mockRejectedValue(new Error("transient"));
    const outcome = await exec({ run });

    expect(run).toHaveBeenCalledTimes(3);
    expect(outcome).toMatchObject({ ok: false, reason: "error", attempts: 3 });
  });

  it("stops retrying as soon as an attempt succeeds", async () => {
    const run = vi.fn()
      .mockRejectedValueOnce(new Error("transient"))
      .mockResolvedValueOnce("recovered");

    const outcome = await exec({ run });

    expect(outcome).toMatchObject({ ok: true, result: "recovered", attempts: 2 });
  });

  it("never retries a write", async () => {
    const run = vi.fn().mockRejectedValue(new Error("boom"));
    await exec({ policy: WRITE, run });

    expect(run).toHaveBeenCalledTimes(1);
  });
});

// ── Cache ────────────────────────────────────────────────────────────────────

describe("tool cache", () => {
  it("never serves one tenant's result to another", async () => {
    const cache = new ToolCache();
    await exec({ cache, tenant: "ws-1", run: async () => "workspace one data" });

    const other = await exec({ cache, tenant: "ws-2", run: async () => "workspace two data" });

    // A cache keyed on args alone would be a cross-tenant data leak.
    expect(other).toMatchObject({ ok: true, result: "workspace two data", cached: false });
  });

  it("reuses a result within its TTL", async () => {
    const cache = new ToolCache();
    const run = vi.fn().mockResolvedValue("value");

    await exec({ cache, run });
    const second = await exec({ cache, run });

    expect(second).toMatchObject({ ok: true, cached: true });
    expect(run).toHaveBeenCalledTimes(1);
  });

  it("distinguishes different arguments", async () => {
    const cache = new ToolCache();
    await exec({ cache, args: { limit: 5 }, run: async () => "five" });
    const other = await exec({ cache, args: { limit: 10 }, run: async () => "ten" });

    expect(other).toMatchObject({ result: "ten", cached: false });
  });

  it("expires entries", () => {
    let clock = 0;
    const cache = new ToolCache(() => clock);
    cache.set("ws-1", "t", null, "value", 100);

    clock = 101;
    expect(cache.get("ws-1", "t", null)).toBeNull();
  });

  it("does not cache when the policy disables it", async () => {
    const cache = new ToolCache();
    await exec({ policy: WRITE, cache, run: async () => "value" });
    expect(cache.size).toBe(0);
  });

  it("does not cache a failure", async () => {
    const cache = new ToolCache();
    await exec({ cache, run: async () => { throw new Error("boom"); } });
    expect(cache.size).toBe(0);
  });
});

// ── Rendering ────────────────────────────────────────────────────────────────

describe("rendering for the model", () => {
  it("labels a failure so it is not mistaken for an empty result", () => {
    const rendered = renderToolOutcome({
      ok: false, reason: "timeout", message: describeToolFailure("timeout"), attempts: 1,
    });

    expect(rendered).toContain("TOOL_FAILED(timeout)");
  });

  it("never exposes internal detail in failure text", () => {
    for (const reason of ["denied", "timeout", "cancelled", "error"] as const) {
      const message = describeToolFailure(reason);
      // Tool results become model context, and model context becomes user-visible prose.
      expect(message).not.toMatch(/prisma|sql|postgres|stack|at\s+\//i);
    }
  });

  it("truncates oversized results so a tool cannot eat the context window", () => {
    const rendered = renderToolOutcome({
      ok: true, result: "x".repeat(5000), cached: false, attempts: 1,
    });

    expect(rendered.length).toBeLessThan(5000);
    expect(rendered).toContain("truncated");
  });
});
