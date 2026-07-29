/**
 * RegLayer — Chat Conversation Persistence
 *
 * WHY THIS IS NOT INSIDE THE SYNC HOOK: persistence was previously reachable only
 * through a `useEffect` in `use-chat-sync`, which meant the queue runner had no way to
 * invoke it. The runner could therefore start the next prompt before the previous
 * answer had been written anywhere durable. Extracting it makes the write callable
 * from an ordered completion sequence, and keeps ONE implementation shared with the
 * debounced background save.
 *
 * IDEMPOTENCY: the server replaces the whole message set for a conversation id
 * (delete-all + recreate inside a transaction). Re-sending an identical payload is
 * therefore safe, which is what makes bounded retry a legitimate recovery strategy
 * rather than a way to duplicate messages.
 */

export interface PersistableMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  feedback?: -1 | 0 | 1;
}

export type PersistOutcome =
  | { ok: true; conversationId: string | null; version: number | null; skipped: boolean }
  | { ok: false; retryable: boolean; stale?: boolean };

/**
 * Identity of a conversation's persisted content.
 *
 * Shared by the ordered completion sequence and the debounced background save so the
 * two paths cannot write the same state twice — without this they would race after
 * every completed run, doubling writes to a delete-and-recreate endpoint.
 */
export function conversationFingerprint(messages: readonly PersistableMessage[]): string {
  return JSON.stringify(
    messages.map((m) => `${m.id}:${m.content.length}:${m.feedback ?? 0}`),
  );
}

let lastPersistedFingerprint = "";

/** Forget what was last written — required whenever the active conversation changes. */
export function resetPersistenceFingerprint(): void {
  lastPersistedFingerprint = "";
}

/**
 * Classify a failed write.
 *
 * Retrying an auth or validation failure cannot succeed and only delays the user, so
 * only transport and server faults are treated as retryable.
 */
function isRetryableStatus(status: number): boolean {
  return status >= 500 || status === 408 || status === 429;
}

export async function persistConversation(args: {
  conversationId: string | null;
  messages: readonly PersistableMessage[];
  /** Version last seen for this conversation. Enables the server's staleness check. */
  version?: number | null;
  fetchImpl?: typeof fetch;
}): Promise<PersistOutcome> {
  const { conversationId, messages, version = null, fetchImpl = fetch } = args;

  if (messages.length === 0) {
    return { ok: true, conversationId, version, skipped: true };
  }

  const fingerprint = conversationFingerprint(messages);
  if (fingerprint === lastPersistedFingerprint) {
    return { ok: true, conversationId, version, skipped: true };
  }

  let response: Response;
  try {
    response = await fetchImpl("/api/ai/conversations", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        id: conversationId || undefined,
        version: version ?? undefined,
        messages: messages.map((m) => ({
          id: m.id,
          role: m.role,
          content: m.content,
          feedback: m.feedback ?? 0,
        })),
      }),
    });
  } catch {
    // Network-level failure: the request may or may not have reached the server, so
    // this is retryable precisely because the write is idempotent.
    return { ok: false, retryable: true };
  }

  if (response.status === 409) {
    // Another tab saved first. Retrying would re-apply this stale message set over
    // theirs, so the caller must reload instead.
    return { ok: false, retryable: false, stale: true };
  }

  if (!response.ok) {
    return { ok: false, retryable: isRetryableStatus(response.status) };
  }

  // Only record the fingerprint after a confirmed write, so a failed attempt cannot
  // convince a later attempt that the state is already durable.
  lastPersistedFingerprint = fingerprint;

  let newId: string | null = conversationId;
  let newVersion: number | null = version;
  try {
    const data = (await response.json()) as { id?: string; version?: number };
    if (data.id) newId = data.id;
    if (typeof data.version === "number") newVersion = data.version;
  } catch {
    // A malformed body does not undo a successful write.
  }

  return { ok: true, conversationId: newId, version: newVersion, skipped: false };
}
