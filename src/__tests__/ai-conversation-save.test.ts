/**
 * RegLayer — Conversation save batching regression test
 *
 * WHY THIS EXISTS: the update path wrote messages with `for (const m of messages) await
 * tx.chatMessage.create(...)` — N sequential round trips inside an interactive
 * transaction with a 5s budget. Against a remote Postgres at ~60ms per round trip that
 * expires at roughly 85 messages, and it did, in production:
 *
 *   Transaction API error: A query cannot be executed on an expired transaction.
 *   The timeout for this transaction was 5000 ms, however 6061 ms passed.
 *
 * The loop was survivable only while saves were rare. It became a hard failure once the
 * request schema accepted 200 messages instead of 50 and the chat runtime began
 * persisting after every completed turn instead of on a skipped 3s debounce.
 *
 * The property pinned here is COST, not correctness: saving a conversation must issue a
 * fixed number of writes regardless of length. A correctness-only test would pass just
 * as happily against the loop that took the endpoint down.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("next-auth", () => ({ getServerSession: vi.fn() }));
vi.mock("@/lib/auth/config", () => ({ authOptions: {} }));
vi.mock("@/lib/rate-limit-middleware", () => ({ applyRateLimit: vi.fn(async () => null) }));
vi.mock("@/lib/ai/learning/rating-transitions", () => ({
  collectRatingTransitions: vi.fn(() => []),
  recordRatingTransitions: vi.fn(async () => {}),
}));

// `vi.mock` factories are hoisted above module scope, so the shared mocks must be
// created inside `vi.hoisted` to exist by the time the factory runs.
const { chatMessage, chatConversation } = vi.hoisted(() => ({
  chatMessage: {
    findMany: vi.fn(async () => []),
    deleteMany: vi.fn(async (_args: { where: { conversationId: string } }) => ({ count: 0 })),
    create: vi.fn(async () => ({})),
    // Typed explicitly so the inserted rows can be asserted on.
    createMany: vi.fn(
      async (_args: {
        data: Array<{ id: string; conversationId: string; role: string; content: string }>;
      }) => ({ count: 0 }),
    ),
  },
  chatConversation: {
    findFirst: vi.fn(async () => ({ id: "conv-1" })),
    update: vi.fn(async () => ({})),
    create: vi.fn(async () => ({ id: "conv-new" })),
  },
}));

vi.mock("@/lib/database/prisma", () => ({
  prisma: {
    user: { findUnique: vi.fn(async () => ({ id: "user-1" })) },
    workspaceMember: { findFirst: vi.fn(async () => ({ workspaceId: "ws-1" })) },
    chatConversation,
    chatMessage,
    // Hand the callback the same mocks so per-query calls can be counted.
    $transaction: vi.fn(async (fn: (tx: unknown) => Promise<unknown>) =>
      fn({ chatConversation, chatMessage }),
    ),
  },
}));

import { getServerSession } from "next-auth";
import { POST } from "@/app/api/ai/conversations/route";

function request(body: unknown): Request {
  return new Request("http://localhost/api/ai/conversations", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

function conversation(messageCount: number) {
  return {
    id: "conv-1",
    messages: Array.from({ length: messageCount }, (_, i) => ({
      id: `m${i}`,
      role: i % 2 === 0 ? "user" : "assistant",
      content: `message ${i}`,
      feedback: 0,
    })),
  };
}

describe("conversation save issues a fixed number of writes", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getServerSession).mockResolvedValue({ user: { email: "a@b.co" } } as never);
    chatConversation.findFirst.mockResolvedValue({ id: "conv-1" });
  });

  it("writes a long conversation in ONE insert, not one per message", async () => {
    // 120 messages is within the 200-message schema cap and well past the ~85 that
    // exhausted the transaction budget.
    const response = await POST(request(conversation(120)) as never);

    expect(response.status).toBe(200);
    expect(chatMessage.createMany).toHaveBeenCalledTimes(1);
    // The loop that caused the outage would have called this 120 times.
    expect(chatMessage.create).not.toHaveBeenCalled();
  });

  it("issues the same number of writes for 10 messages as for 200", async () => {
    await POST(request(conversation(10)) as never);
    const smallInserts = chatMessage.createMany.mock.calls.length;

    vi.clearAllMocks();
    vi.mocked(getServerSession).mockResolvedValue({ user: { email: "a@b.co" } } as never);
    chatConversation.findFirst.mockResolvedValue({ id: "conv-1" });

    await POST(request(conversation(200)) as never);

    // Write count must not scale with conversation length.
    expect(chatMessage.createMany.mock.calls.length).toBe(smallInserts);
  });

  it("persists every message exactly once", async () => {
    await POST(request(conversation(50)) as never);

    const rows = chatMessage.createMany.mock.calls[0]![0].data;
    expect(rows).toHaveLength(50);
    expect(new Set(rows.map((r) => r.id)).size).toBe(50);
  });

  it("still replaces the previous message set", async () => {
    await POST(request(conversation(5)) as never);

    // Batching must not have skipped the delete — that would duplicate history.
    expect(chatMessage.deleteMany).toHaveBeenCalledWith({
      where: { conversationId: "conv-1" },
    });
  });

  it("scopes the write to the conversation being saved", async () => {
    await POST(request(conversation(3)) as never);

    const rows = chatMessage.createMany.mock.calls[0]![0].data;
    expect(rows.every((r) => r.conversationId === "conv-1")).toBe(true);
  });

  it("still refuses a conversation the caller does not own", async () => {
    chatConversation.findFirst.mockResolvedValue(null as never);

    const response = await POST(request(conversation(3)) as never);

    expect(response.status).toBe(404);
    expect(chatMessage.createMany).not.toHaveBeenCalled();
  });
});
