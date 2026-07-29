/**
 * Queue interaction rules.
 *
 * These cover the behaviour a user can observe: what the controls do, when they apply,
 * and what a screen reader is told. The announcement tests exist because each assistant
 * message used to be its own live region — during a drain that is N regions announcing
 * four transitions each, which buries the one fact the user needs.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { act, renderHook, waitFor } from "@testing-library/react";
import { useChat } from "@/hooks/use-chat";
import { useChatStore } from "@/stores/chatStore";
import { estimateTotalWaitMs, queueAnnouncement } from "@/lib/ai/chat/queue";
import { resetPersistenceFingerprint } from "@/lib/ai/chat/persistence";
import { routeChatFetch } from "./helpers/chat-fetch";

function completedStream(text: string): Response {
  return new Response(
    `data: ${JSON.stringify({ type: "text", content: text })}\n` +
    `data: ${JSON.stringify({ type: "done" })}\n`,
    { status: 200 },
  );
}

function resetStore() {
  useChatStore.setState({
    messages: [],
    queuedPrompts: [],
    isStreaming: false,
    conversationId: null,
    isSaving: false,
    runnerToken: null,
    queuePauseReason: null,
    avgRunMs: null,
  });
  resetPersistenceFingerprint();
}

const userTexts = () =>
  useChatStore.getState().messages.filter((m) => m.role === "user").map((m) => m.content);

// ── Announcements ────────────────────────────────────────────────────────────

describe("queue announcements", () => {
  it("says nothing when there is nothing to report", () => {
    // Silence is the correct output for an idle, empty queue.
    expect(queueAnnouncement({
      status: "idle", pendingCount: 0, avgRunMs: null, pauseReason: null,
    })).toBe("");
  });

  it("states count and total wait while running", () => {
    const message = queueAnnouncement({
      status: "running", pendingCount: 2, avgRunMs: 5000, pauseReason: null,
    });

    expect(message).toContain("2 prompts queued");
    expect(message).toMatch(/\d+s for all/);
  });

  it("omits a wait it cannot honestly estimate", () => {
    const message = queueAnnouncement({
      status: "running", pendingCount: 2, avgRunMs: null, pauseReason: null,
    });

    expect(message).toContain("2 prompts queued");
    expect(message).not.toContain("Estimated");
  });

  it("distinguishes a deliberate pause from a problem", () => {
    const byUser = queueAnnouncement({
      status: "paused", pendingCount: 1, avgRunMs: null, pauseReason: "user",
    });
    const byFailure = queueAnnouncement({
      status: "paused", pendingCount: 1, avgRunMs: null, pauseReason: "failed",
    });

    expect(byUser).toContain("Queue paused");
    expect(byUser).not.toContain("problem");
    // A failure pause must not be reported as if the user chose it.
    expect(byFailure).toContain("problem");
  });

  it("tells a paused user how to proceed", () => {
    const message = queueAnnouncement({
      status: "paused", pendingCount: 3, avgRunMs: null, pauseReason: "failed",
    });
    expect(message).toMatch(/retry or skip/i);
  });

  it("uses singular wording for a single prompt", () => {
    const message = queueAnnouncement({
      status: "paused", pendingCount: 1, avgRunMs: null, pauseReason: "user",
    });
    expect(message).toContain("1 prompt waiting");
  });
});

describe("aggregate wait", () => {
  it("covers every pending prompt including the active run", () => {
    expect(estimateTotalWaitMs(3, 4000)).toBe(12000);
  });

  it("reports nothing when the queue is empty or unmeasured", () => {
    expect(estimateTotalWaitMs(0, 4000)).toBeNull();
    expect(estimateTotalWaitMs(3, null)).toBeNull();
  });
});

// ── Controls ─────────────────────────────────────────────────────────────────

describe("pause, resume, and clear", () => {
  beforeEach(resetStore);
  afterEach(() => vi.unstubAllGlobals());

  it("lets the in-flight answer finish but starts nothing new", async () => {
    vi.stubGlobal("fetch", routeChatFetch(() => completedStream("answer")));
    const { result } = renderHook(() => useChat());

    act(() => {
      useChatStore.getState().enqueuePrompt("Q2");
      // Pausing before the turn boundary is reached.
      useChatStore.getState().pauseQueue("user");
    });

    await act(async () => { await result.current.sendMessage("Q1"); });

    await waitFor(() => {
      // Q1's answer completed; Q2 never started.
      expect(useChatStore.getState().messages.at(-1)?.status).toBe("completed");
      expect(userTexts()).toEqual(["Q1"]);
      expect(useChatStore.getState().queuedPrompts.map((p) => p.content)).toEqual(["Q2"]);
    });
  });

  it("continues the backlog when resumed", async () => {
    vi.stubGlobal("fetch", routeChatFetch(() => completedStream("answer")));
    const { result } = renderHook(() => useChat());

    act(() => {
      useChatStore.getState().enqueuePrompt("Q2");
      useChatStore.getState().pauseQueue("user");
    });
    await act(async () => { await result.current.sendMessage("Q1"); });

    await act(async () => { await result.current.resumeQueue(); });

    await waitFor(() => {
      expect(userTexts()).toEqual(["Q1", "Q2"]);
      expect(useChatStore.getState().queuePauseReason).toBeNull();
    });
  });

  it("discards the backlog and lifts the pause together", () => {
    act(() => {
      useChatStore.getState().enqueuePrompt("Q1");
      useChatStore.getState().enqueuePrompt("Q2");
      useChatStore.getState().pauseQueue("failed");
    });

    act(() => { useChatStore.getState().clearQueue(); });

    expect(useChatStore.getState().queuedPrompts).toHaveLength(0);
    // Nothing is left to decide about, so the pause must not linger.
    expect(useChatStore.getState().queuePauseReason).toBeNull();
  });

  it("leaves the transcript intact when the queue is cleared", () => {
    act(() => {
      useChatStore.getState().addMessage("user", "already asked");
      useChatStore.getState().enqueuePrompt("never asked");
    });

    act(() => { useChatStore.getState().clearQueue(); });

    // Clearing pending work must never touch answered history.
    expect(userTexts()).toEqual(["already asked"]);
  });
});
