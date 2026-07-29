/**
 * Composer draft persistence.
 *
 * The chat panel unmounts when closed, so before this behaviour existed a typed-but-
 * unsent message was destroyed by closing the panel, navigating, or reloading. These
 * tests pin the two properties that make the draft trustworthy: it SURVIVES unmount,
 * and it never leaks across conversations.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { render, screen, act, fireEvent, cleanup } from "@testing-library/react";
import { ChatInput } from "@/components/ai/ChatInput";
import { useChatStore } from "@/stores/chatStore";

function renderInput(overrides: Partial<React.ComponentProps<typeof ChatInput>> = {}) {
  const onSend = vi.fn();
  const view = render(
    <ChatInput onSend={onSend} onStop={vi.fn()} isStreaming={false} {...overrides} />,
  );
  return { onSend, view };
}

const composer = () => screen.getByRole("textbox");

function type(text: string) {
  fireEvent.change(composer(), { target: { value: text } });
}

describe("composer draft persistence", () => {
  beforeEach(() => {
    act(() => useChatStore.getState().clearMessages());
    act(() => useChatStore.getState().setDraft(""));
  });

  // This repo's Vitest setup does not enable RTL auto-cleanup, so mounted composers
  // would otherwise leak across tests and make the textbox query ambiguous.
  afterEach(cleanup);

  it("restores a draft that was typed before the panel unmounted", () => {
    const { view } = renderInput();

    type("how do I fix contrast");
    // Closing the panel unmounts the composer — the draft must be flushed, not lost.
    view.unmount();

    expect(useChatStore.getState().draft).toBe("how do I fix contrast");

    renderInput();
    expect(composer()).toHaveValue("how do I fix contrast");
  });

  it("clears the draft once the message is actually sent", () => {
    const { onSend } = renderInput();

    type("ship it");
    fireEvent.keyDown(composer(), { key: "Enter" });

    expect(onSend).toHaveBeenCalledWith("ship it");
    expect(useChatStore.getState().draft).toBe("");
    expect(composer()).toHaveValue("");
  });

  it("does not leak a draft from one conversation into another", () => {
    renderInput();

    type("draft for conversation A");
    // Switching conversations must not carry unsent text into a different thread.
    act(() => useChatStore.getState().loadConversation("conv-b", []));

    expect(useChatStore.getState().draft).toBe("");
    expect(composer()).toHaveValue("");
  });

  it("keeps the draft out of the transcript until it is sent", () => {
    const { view } = renderInput();

    type("still thinking about this");
    view.unmount();

    expect(useChatStore.getState().messages).toHaveLength(0);
  });
});
