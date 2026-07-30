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

/**
 * Conversation id learned from a completed create.
 *
 * The caller passes the id it knew when it decided to save. A save queued behind a
 * create still carries `null`, and without this would take the create branch a second
 * time — producing either a duplicate conversation or, because message ids are client
 * generated and unique, a P2002 that surfaces to the user as a failed save.
 */
let knownConversationId: string | null = null;

/**
 * Serialises writes.
 *
 * The fingerprint guard alone is not enough: it is claimed AFTER the request resolves,
 * so two saves issued in the same tick both pass it and both hit the server. Observed
 * in practice as `POST 201` immediately followed by `POST 500`. Chaining means the
 * second save sees the first one's result — including the id it created.
 */
let writeChain: Promise<unknown> = Promise.resolve();

/** Forget what was last written — required whenever the active conversation changes. */
export function resetPersistenceFingerprint(): void {
  lastPersistedFingerprint = "";
  // Must clear too, or the next conversation would be written over the previous one.
  knownConversationId = null;
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
  // Queue behind any write already in flight, whether it succeeded or not — a failed
  // write must not let the next one overlap either.
  const run = writeChain.then(() => sendConversation(args), () => sendConversation(args));
  writeChain = run.then(() => undefined, () => undefined);
  return run;
}

async function sendConversation(args: {
  conversationId: string | null;
  messages: readonly PersistableMessage[];
  version?: number | null;
  fetchImpl?: typeof fetch;
}): Promise<PersistOutcome> {
  const { messages, version = null, fetchImpl = fetch } = args;
  // Resolved here, not at call time, so a save queued before the create finished still
  // updates that conversation instead of creating another.
  const conversationId = args.conversationId ?? knownConversationId;

  if (messages.length === 0) {
    return { ok: true, conversationId, version, skipped: true };
  }

  // Re-checked after acquiring the slot: an identical save that was superseded while
  // queued is now a no-op rather than a redundant round trip.
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

  if (response.status === 404 && conversationId) {
    // The id we sent no longer exists for this user — a conversation removed on
    // another device, or an id left in localStorage after re-logging as someone else.
    // The update can never succeed, and treating it as a plain non-retryable failure
    // pauses the queue and loses the transcript. Recover by forgetting the stale id
    // and recreating the conversation for the current user. This recurses at most once:
    // the retry carries no id, and a create cannot 404.
    knownConversationId = null;
    return sendConversation({ ...args, conversationId: null });
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

  // Publish the id so any save already queued behind this one updates rather than
  // creates.
  if (newId) knownConversationId = newId;

  return { ok: true, conversationId: newId, version: newVersion, skipped: false };
}
