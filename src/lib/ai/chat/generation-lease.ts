/**
 * RegLayer — Cross-Tab Generation Lease
 *
 * WHY THE CLIENT LEASE IS NOT ENOUGH: `chatStore.runnerToken` guarantees exactly one
 * drain loop per TAB. It cannot span tabs, because each tab holds its own in-memory
 * copy — so two tabs open on the same conversation could generate into it
 * simultaneously, interleaving messages and clobbering each other's saves.
 *
 * Ownership enforced by the database is the only kind that holds across tabs, devices,
 * and server restarts.
 *
 * WHY A LEASE AND NOT A LOCK: a lock needs releasing. Browsers close, laptops sleep,
 * and processes die without running cleanup, so any lock that must be released
 * eventually deadlocks a conversation permanently. A lease EXPIRES — the worst case is
 * a short wait, not a conversation nobody can ever use again.
 *
 * The atomicity comes from a conditional UPDATE: acquisition and the check that it was
 * safe to acquire happen in one statement, so two callers cannot both succeed.
 */

import "server-only";

import { prisma } from "@/lib/database/prisma";

/**
 * How long a lease survives without a heartbeat.
 *
 * Longer than a typical response so a slow generation is not stolen mid-stream; short
 * enough that a crashed tab does not block the conversation for long.
 */
export const LEASE_TTL_MS = 90_000;

/** Heartbeat interval. Comfortably under the TTL so one missed beat is not fatal. */
export const LEASE_HEARTBEAT_MS = 30_000;

export type LeaseResult =
  | { acquired: true; expiresAt: Date }
  | { acquired: false; heldBy: string; expiresAt: Date | null };

/**
 * Claim the right to generate into a conversation.
 *
 * The WHERE clause accepts three cases and nothing else: nobody holds the lease, the
 * held lease has expired, or the caller already holds it (re-entrant renewal). Because
 * the condition and the write are one statement, two tabs racing produce exactly one
 * winner — `updateMany` reports how many rows matched, and the loser sees zero.
 */
export async function acquireGenerationLease(
  conversationId: string,
  owner: string,
  now: Date = new Date(),
): Promise<LeaseResult> {
  const expiresAt = new Date(now.getTime() + LEASE_TTL_MS);

  const { count } = await prisma.chatConversation.updateMany({
    where: {
      id: conversationId,
      OR: [
        { runOwner: null },
        { runExpires: { lt: now } },
        { runOwner: owner },
      ],
    },
    data: { runOwner: owner, runExpires: expiresAt },
  });

  if (count > 0) return { acquired: true, expiresAt };

  // Report WHO holds it so the UI can say "another tab is generating" rather than
  // failing silently, which reads as the app being broken.
  const holder = await prisma.chatConversation.findUnique({
    where: { id: conversationId },
    select: { runOwner: true, runExpires: true },
  });

  return {
    acquired: false,
    heldBy: holder?.runOwner ?? "unknown",
    expiresAt: holder?.runExpires ?? null,
  };
}

/**
 * Extend a lease the caller still holds.
 *
 * Returns false when ownership has moved on — the caller must then STOP, because
 * something else is now generating and continuing would interleave output.
 */
export async function renewGenerationLease(
  conversationId: string,
  owner: string,
  now: Date = new Date(),
): Promise<boolean> {
  const { count } = await prisma.chatConversation.updateMany({
    // Ownership is part of the condition, so a superseded worker cannot renew.
    where: { id: conversationId, runOwner: owner },
    data: { runExpires: new Date(now.getTime() + LEASE_TTL_MS) },
  });
  return count > 0;
}

/** Release a lease. Guarded on ownership so a late release cannot free someone else's. */
export async function releaseGenerationLease(
  conversationId: string,
  owner: string,
): Promise<void> {
  await prisma.chatConversation.updateMany({
    where: { id: conversationId, runOwner: owner },
    data: { runOwner: null, runExpires: null },
  });
}

// ── Optimistic concurrency ───────────────────────────────────────────────────

export type SaveGuard =
  | { ok: true; version: number }
  | { ok: false; reason: "stale"; currentVersion: number };

/**
 * Bump a conversation's version, refusing the write if it moved since it was read.
 *
 * WHY THIS MATTERS HERE SPECIFICALLY: the save is a delete-all-and-recreate. A stale
 * write does not merely lose an edit, it replaces the entire message set with an older
 * one. Detecting staleness is the difference between "your change was rejected" and
 * "someone else's conversation was deleted".
 *
 * Pass `expectedVersion: null` to opt out — used by first-time saves that have no
 * version to compare against.
 */
export async function bumpConversationVersion(
  tx: Pick<typeof prisma, "chatConversation">,
  conversationId: string,
  expectedVersion: number | null,
): Promise<SaveGuard> {
  if (expectedVersion === null) {
    const updated = await tx.chatConversation.update({
      where: { id: conversationId },
      data: { version: { increment: 1 } },
      select: { version: true },
    });
    return { ok: true, version: updated.version };
  }

  const { count } = await tx.chatConversation.updateMany({
    where: { id: conversationId, version: expectedVersion },
    data: { version: { increment: 1 } },
  });

  if (count > 0) return { ok: true, version: expectedVersion + 1 };

  const current = await tx.chatConversation.findUnique({
    where: { id: conversationId },
    select: { version: true },
  });

  return { ok: false, reason: "stale", currentVersion: current?.version ?? 0 };
}
