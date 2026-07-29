/**
 * Fetch fixtures for chat tests.
 *
 * WHY: a completed run now performs an ordered durability write before the next queued
 * prompt starts. A mock that answers every URL with a chat stream would let that write
 * consume a chat fixture and silently shorten the drain. Routing by URL keeps the two
 * concerns separate so a test asserts what it means to assert.
 */

import { vi } from "vitest";

const CONVERSATIONS_ENDPOINT = "/api/ai/conversations";

function persistOk(): Response {
  return new Response(JSON.stringify({ id: "conv-test" }), { status: 200 });
}

/** Wrap a chat handler so persistence writes are answered separately. */
export function routeChatFetch(
  chatHandler: (url: string, init?: RequestInit) => Response | Promise<Response>,
  persistHandler: () => Response | Promise<Response> = persistOk,
) {
  return vi.fn().mockImplementation(async (url: string, init?: RequestInit) => {
    if (String(url).includes(CONVERSATIONS_ENDPOINT)) return persistHandler();
    return chatHandler(String(url), init);
  });
}

/** Answer chat requests from a fixed sequence, failing loudly on an unexpected extra. */
export function sequentialChatResponses(...responses: Response[]) {
  let index = 0;
  return routeChatFetch(() => {
    const next = responses[index];
    index += 1;
    if (!next) throw new Error(`unexpected chat request #${index}`);
    return next;
  });
}
