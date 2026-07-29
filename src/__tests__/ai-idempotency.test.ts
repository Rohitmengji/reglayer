/**
 * Tests for AI tool idempotency.
 *
 * WHY: `triggerScan` is the only tool that spends real money — it launches a browser
 * and crawls a site. The chat endpoint is not idempotent, so a client retry after a
 * dropped connection, a "regenerate", or the model calling the tool twice in one turn
 * would each start a duplicate scan and a duplicate bill.
 *
 * This was dormant while tool calling was broken. It became live the moment the tool
 * schemas were fixed, which is why the guard lands now.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("server-only", () => ({}));

// In-memory stand-in for Redis so the dedup semantics (SET NX, TTL-less within a test)
// are exercised for real rather than stubbed away.
const store = new Map<string, unknown>();

vi.mock("@/lib/cache/redis", () => ({
  cacheGet: async (k: string) => (store.has(k) ? store.get(k) : null),
  cacheSet: async (k: string, v: unknown) => { store.set(k, v); },
  cacheDel: async (k: string) => { store.delete(k); },
  cacheSetNX: async (k: string, v: unknown) => {
    if (store.has(k)) return false;
    store.set(k, v);
    return true;
  },
}));

import { withIdempotency } from "@/lib/ai/idempotency";

const SCOPE = { workspaceId: "ws_alpha", userId: "user_1" };

describe("withIdempotency", () => {
  beforeEach(() => {
    store.clear();
    vi.clearAllMocks();
  });

  it("executes the operation on first call", async () => {
    const fn = vi.fn().mockResolvedValue({ scanId: "scan_1" });

    const out = await withIdempotency(SCOPE, "triggerScan", { url: "https://a.com" }, fn);

    expect(fn).toHaveBeenCalledTimes(1);
    expect(out).toEqual({ result: { scanId: "scan_1" }, deduplicated: false });
  });

  it("replays the cached result instead of re-running", async () => {
    const fn = vi.fn().mockResolvedValue({ scanId: "scan_1" });
    const args = { url: "https://a.com" };

    await withIdempotency(SCOPE, "triggerScan", args, fn);
    const second = await withIdempotency(SCOPE, "triggerScan", args, fn);

    // The whole point: a retry must not launch a second browser.
    expect(fn).toHaveBeenCalledTimes(1);
    expect(second.deduplicated).toBe(true);
    expect(second.result).toEqual({ scanId: "scan_1" });
  });

  it("treats different arguments as different operations", async () => {
    const fn = vi.fn().mockImplementation(async () => ({ scanId: `scan_${fn.mock.calls.length}` }));

    await withIdempotency(SCOPE, "triggerScan", { url: "https://a.com" }, fn);
    await withIdempotency(SCOPE, "triggerScan", { url: "https://b.com" }, fn);

    expect(fn).toHaveBeenCalledTimes(2);
  });

  it("isolates tenants — one workspace cannot replay another's result", async () => {
    const fn = vi.fn().mockResolvedValue({ scanId: "scan_1" });
    const args = { url: "https://a.com" };

    await withIdempotency({ workspaceId: "ws_alpha", userId: "u1" }, "triggerScan", args, fn);
    const other = await withIdempotency({ workspaceId: "ws_beta", userId: "u2" }, "triggerScan", args, fn);

    expect(fn).toHaveBeenCalledTimes(2);
    expect(other.deduplicated).toBe(false);
  });

  it("falls back to user scoping when there is no workspace", async () => {
    const fn = vi.fn().mockResolvedValue({ ok: true });
    const args = { url: "https://a.com" };

    await withIdempotency({ workspaceId: null, userId: "u1" }, "triggerScan", args, fn);
    await withIdempotency({ workspaceId: null, userId: "u2" }, "triggerScan", args, fn);

    // Different users must not share a dedup slot.
    expect(fn).toHaveBeenCalledTimes(2);
  });

  it("separates different operations with identical arguments", async () => {
    const fn = vi.fn().mockResolvedValue({ ok: true });
    const args = { url: "https://a.com" };

    await withIdempotency(SCOPE, "triggerScan", args, fn);
    await withIdempotency(SCOPE, "getViolations", args, fn);

    expect(fn).toHaveBeenCalledTimes(2);
  });

  it("releases the claim on failure so a genuine retry can proceed", async () => {
    const fn = vi.fn()
      .mockRejectedValueOnce(new Error("browser launch failed"))
      .mockResolvedValueOnce({ scanId: "scan_ok" });
    const args = { url: "https://a.com" };

    await expect(
      withIdempotency(SCOPE, "triggerScan", args, fn),
    ).rejects.toThrow("browser launch failed");

    // Holding the claim after a failure would make one transient error suppress every
    // retry for the whole window — the user would be stuck until the TTL expired.
    const retry = await withIdempotency(SCOPE, "triggerScan", args, fn);

    expect(fn).toHaveBeenCalledTimes(2);
    expect(retry.result).toEqual({ scanId: "scan_ok" });
    expect(retry.deduplicated).toBe(false);
  });

  it("does not cache a failed result", async () => {
    const fn = vi.fn().mockRejectedValue(new Error("nope"));
    const args = { url: "https://a.com" };

    await expect(withIdempotency(SCOPE, "triggerScan", args, fn)).rejects.toThrow();
    await expect(withIdempotency(SCOPE, "triggerScan", args, fn)).rejects.toThrow();

    // A failure must never be replayed as if it were a result.
    expect(fn).toHaveBeenCalledTimes(2);
  });
});
