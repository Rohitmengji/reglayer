/**
 * RegLayer — Sign-out with local state teardown
 *
 * WHY THIS EXISTS: `signOut()` from next-auth clears the SESSION, not the browser. The
 * chat store persists conversations, queued prompts, and unsent drafts to localStorage
 * under `reglayer-chat`, and nothing removed them on sign-out. On a shared or handed-over
 * machine the next person to open the assistant saw the previous user's conversation
 * history and drafts.
 *
 * For a compliance product handling customer accessibility data that is a
 * data-protection failure rather than a rough edge, so teardown is centralised here and
 * every sign-out path routes through it. Calling `signOut()` directly is the bug.
 */

"use client";

import { signOut, type SignOutParams } from "next-auth/react";
import { useChatStore } from "@/stores/chatStore";
import { resetPersistenceFingerprint } from "@/lib/ai/chat/persistence";

/**
 * Remove every trace of the signed-in user's AI state from this browser.
 *
 * Exported separately so it can be called on account deletion and workspace switching,
 * which have the same requirement and are not sign-outs.
 */
export function clearLocalAiState(): void {
  try {
    // Clears in-memory state AND the persisted snapshot. Order matters: clearing the
    // store first means a concurrent write cannot re-persist the old conversation
    // between the two calls.
    useChatStore.getState().newConversation();
    useChatStore.persist.clearStorage();
    resetPersistenceFingerprint();
  } catch {
    // Never block sign-out. Failing to clear is bad; trapping someone in an
    // authenticated session because cleanup threw is worse.
  }
}

/** Sign out, clearing local AI state first. Use this instead of next-auth's signOut. */
export async function signOutAndClear(options?: SignOutParams): Promise<void> {
  clearLocalAiState();
  await signOut(options);
}
