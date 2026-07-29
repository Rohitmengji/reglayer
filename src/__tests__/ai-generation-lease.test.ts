/**
 * Cross-tab generation lease and optimistic concurrency.
 *
 * Both defects these fix are silent and destructive: two tabs generating into one
 * conversation, and a stale save replacing an entire message set rather than losing a
 * single edit. Neither produced an error, which is why the guards are pinned here.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("server-only", () => ({}));

const { chatConversation } = vi.hoisted(() => ({
  chatConversation: {
    updateMany: vi.fn(async (_args: unknown) => ({ count: 1 })),
    findUnique: vi.fn(async (_args: unknown) => null as { runOwner?: string | null; runExpires?: Date | null; version?: number } | null),
    update: vi.fn(async (_args: unknown) => ({ version: 1 })),
  },
}));

vi.mock("@/lib/database/prisma", () => ({ prisma: { chatConversation } }));

import {
  acquireGenerationLease,
  bumpConversationVersion,
  LEASE_HEARTBEAT_MS,
  LEASE_TTL_MS,
  releaseGenerationLease,
  renewGenerationLease,
} from "@/lib/ai/chat/generation-lease";

const NOW = new Date("2026-01-01T00:00:00Z");

describe("lease acquisition", () => {
  beforeEach(() => vi.clearAllMocks());

  it("acquires when nobody holds it", async () => {
    chatConversation.updateMany.mockResolvedValue({ count: 1 });

    const result = await acquireGenerationLease("conv-1", "tab-a", NOW);

    expect(result.acquired).toBe(true);
  });

  it("refuses when another tab holds a live lease", async () => {
    chatConversation.updateMany.mockResolvedValue({ count: 0 });
    chatConversation.findUnique.mockResolvedValue({
      runOwner: "tab-b",
      runExpires: new Date(NOW.getTime() + 60_000),
    });

    const result = await acquireGenerationLease("conv-1", "tab-a", NOW);

    expect(result.acquired).toBe(false);
    // Reporting the holder lets the UI say "another tab is generating" rather than
    // failing silently, which reads as the app being broken.
    if (!result.acquired) expect(result.heldBy).toBe("tab-b");
  });

  it("makes acquisition and its precondition ONE statement", async () => {
    await acquireGenerationLease("conv-1", "tab-a", NOW);

    // A read-then-write would let two tabs both observe "free" and both proceed.
    // The conditional UPDATE is what makes exactly one win.
    const call = chatConversation.updateMany.mock.calls[0]![0] as {
      where: { OR: unknown[] };
      data: { runOwner: string };
    };
    expect(call.where.OR).toHaveLength(3);
    expect(call.data.runOwner).toBe("tab-a");
  });

  it("permits taking over an expired lease", async () => {
    const call = async () => {
      await acquireGenerationLease("conv-1", "tab-a", NOW);
      return chatConversation.updateMany.mock.calls[0]![0] as { where: { OR: Array<Record<string, unknown>> } };
    };

    const where = (await call()).where;
    // A browser that closed without releasing must not deadlock the conversation
    // forever — expiry is why this is a lease and not a lock.
    expect(JSON.stringify(where.OR)).toContain("runExpires");
  });

  it("is re-entrant for the current owner", async () => {
    await acquireGenerationLease("conv-1", "tab-a", NOW);

    const args = chatConversation.updateMany.mock.calls[0]![0] as {
      where: { OR: Array<Record<string, unknown>> };
    };
    // Renewing its own lease must not require the holder to release first.
    expect(JSON.stringify(args.where.OR)).toContain("tab-a");
  });

  it("heartbeats well inside the expiry window", () => {
    // One missed beat must not lose a lease mid-generation.
    expect(LEASE_HEARTBEAT_MS * 2).toBeLessThan(LEASE_TTL_MS);
  });
});

describe("lease renewal and release", () => {
  beforeEach(() => vi.clearAllMocks());

  it("renews only for the current owner", async () => {
    chatConversation.updateMany.mockResolvedValue({ count: 1 });
    await renewGenerationLease("conv-1", "tab-a", NOW);

    const args = chatConversation.updateMany.mock.calls[0]![0] as {
      where: { runOwner: string };
    };
    // A superseded worker renewing would resurrect a lease it no longer owns.
    expect(args.where.runOwner).toBe("tab-a");
  });

  it("reports failure when ownership has moved on", async () => {
    chatConversation.updateMany.mockResolvedValue({ count: 0 });

    // The caller must STOP: something else is generating, and continuing would
    // interleave output into the same conversation.
    expect(await renewGenerationLease("conv-1", "tab-a", NOW)).toBe(false);
  });

  it("releases only its own lease", async () => {
    await releaseGenerationLease("conv-1", "tab-a");

    const args = chatConversation.updateMany.mock.calls[0]![0] as {
      where: { runOwner: string };
      data: { runOwner: null };
    };
    expect(args.where.runOwner).toBe("tab-a");
    expect(args.data.runOwner).toBeNull();
  });
});

describe("optimistic concurrency", () => {
  beforeEach(() => vi.clearAllMocks());

  const tx = { chatConversation } as never;

  it("accepts a save carrying the current version", async () => {
    chatConversation.updateMany.mockResolvedValue({ count: 1 });

    const result = await bumpConversationVersion(tx, "conv-1", 4);

    expect(result).toEqual({ ok: true, version: 5 });
  });

  it("rejects a save carrying a stale version", async () => {
    chatConversation.updateMany.mockResolvedValue({ count: 0 });
    chatConversation.findUnique.mockResolvedValue({ version: 9 });

    const result = await bumpConversationVersion(tx, "conv-1", 4);

    // Without this the save would delete-and-recreate the whole message set from an
    // older snapshot — not a lost edit, a lost conversation.
    expect(result).toEqual({ ok: false, reason: "stale", currentVersion: 9 });
  });

  it("allows opting out for a first save", async () => {
    chatConversation.update.mockResolvedValue({ version: 1 });

    const result = await bumpConversationVersion(tx, "conv-1", null);

    expect(result).toEqual({ ok: true, version: 1 });
  });

  it("checks the version in the same statement that bumps it", async () => {
    chatConversation.updateMany.mockResolvedValue({ count: 1 });
    await bumpConversationVersion(tx, "conv-1", 4);

    const args = chatConversation.updateMany.mock.calls[0]![0] as {
      where: { version: number };
    };
    // Comparing then writing separately would reintroduce the race it exists to close.
    expect(args.where.version).toBe(4);
  });
});
