/**
 * RegLayer — conversation message diff (pure)
 *
 * WHY: Saving a conversation used to delete every message and recreate all of them,
 * so the cost of a save scaled with the length of the conversation, not with what
 * changed. A single new turn rewrote up to 200 rows. That is what pushed the save
 * transaction past its budget in production (P2028); raising the timeout stopped the
 * bleeding, but the write is still O(n) for an O(1) change.
 *
 * This computes the minimal set of writes: insert the messages that are new, update
 * the ones whose content or feedback changed, delete the ones the client dropped
 * (an edit or regenerate truncates trailing messages). The client remains the source
 * of truth — the diff only decides HOW to reach the client's state, not WHAT it is.
 *
 * Pure and free of Prisma/server-only so every branch is unit-testable; the route owns
 * the transaction that applies the result.
 */

export interface DiffableMessage {
  id: string;
  role: string;
  content: string;
  feedback: number;
}

export interface MessageDiff<T extends DiffableMessage> {
  toInsert: T[];
  toUpdate: T[];
  toDeleteIds: string[];
}

export function diffMessages<T extends DiffableMessage>(
  existing: readonly DiffableMessage[],
  incoming: readonly T[],
): MessageDiff<T> {
  const existingById = new Map(existing.map((m) => [m.id, m]));
  const incomingIds = new Set(incoming.map((m) => m.id));

  const toInsert: T[] = [];
  const toUpdate: T[] = [];

  for (const msg of incoming) {
    const prev = existingById.get(msg.id);
    if (!prev) {
      toInsert.push(msg);
      continue;
    }
    // Only rewrite a row that actually changed. Feedback flips on a thumbs-up; content
    // changes on an edit-and-resend (same id, new text). Role is included defensively —
    // it should never change for a given id, and if it somehow did we want the row to
    // reflect the client rather than silently keep a stale value.
    if (prev.content !== msg.content || prev.feedback !== msg.feedback || prev.role !== msg.role) {
      toUpdate.push(msg);
    }
  }

  // Anything the client no longer has was removed by an edit or regenerate that
  // truncated the tail. Without this the transcript would only ever grow.
  const toDeleteIds = existing
    .filter((m) => !incomingIds.has(m.id))
    .map((m) => m.id);

  return { toInsert, toUpdate, toDeleteIds };
}
