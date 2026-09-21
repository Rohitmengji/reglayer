/**
 * Tests for Agent Marketplace + A2A Protocol
 */
import { beforeEach, describe, it, expect, vi } from "vitest";

const mocks = vi.hoisted(() => ({ blueprint: vi.fn(), createConversation: vi.fn(), conversation: vi.fn(), messages: vi.fn(), createMessage: vi.fn(), count: vi.fn(), complete: vi.fn() }));
vi.mock("server-only", () => ({}));
vi.mock("@/lib/database/prisma", () => ({ prisma: {
  agentBlueprint: { findUnique: mocks.blueprint, findFirst: mocks.blueprint },
  agentConversation: { create: mocks.createConversation, findUnique: mocks.conversation },
  agentMessage: { findMany: mocks.messages, create: mocks.createMessage, count: mocks.count },
} }));
vi.mock("@/lib/ai/gateway", () => ({ complete: mocks.complete }));

import { detectHandoff, startConversation, runTurn, executeHandoff } from "@/lib/ai/a2a/protocol";

describe("Agent execution workspace boundary", () => {
  const foreign = { id: "private-blueprint", slug: "private-agent", workspaceId: "other-workspace", isSystem: false, isPublic: false };
  beforeEach(() => {
    vi.resetAllMocks();
    mocks.blueprint.mockImplementation(async ({ where }) => !where.OR || where.OR.some((scope: Record<string, unknown>) => Object.entries(scope).every(([key, value]) => foreign[key as keyof typeof foreign] === value)) ? foreign : null);
    mocks.createConversation.mockResolvedValue({ id: "conversation", status: "RUNNING", messages: [], createdAt: new Date() });
    mocks.conversation.mockResolvedValue({ workspaceId: "selected-workspace" });
    mocks.messages.mockResolvedValue([]);
    mocks.count.mockResolvedValue(0);
  });

  it("cannot start another workspace's private agent by guessing its slug", async () => {
    await expect(startConversation({ agentSlug: "private-agent", workspaceId: "selected-workspace", userId: "member", task: "Synthetic task" })).rejects.toThrow("not found");
    expect(mocks.createConversation).not.toHaveBeenCalled();
    expect(mocks.complete).not.toHaveBeenCalled();
  });

  it("rejects missing workspace before looking up an agent", async () => {
    await expect(startConversation({ agentSlug: "private-agent", workspaceId: "", userId: "member", task: "Synthetic task" })).rejects.toThrow("Workspace");
    expect(mocks.blueprint).not.toHaveBeenCalled();
  });

  it("admits an owned definition and queries only owned or explicitly shared definitions", async () => {
    expect(await startConversation({ agentSlug: "private-agent", workspaceId: "other-workspace", userId: "member", task: "Synthetic task" })).toMatchObject({ id: "conversation" });
    expect(mocks.blueprint).toHaveBeenCalledWith({ where: { slug: "private-agent", OR: [{ workspaceId: "other-workspace" }, { isSystem: true }, { isPublic: true }] } });
  });

  it("loads turn scope from persisted conversation before provider work", async () => {
    await expect(runTurn("conversation", "private-agent")).rejects.toThrow("not found");
    expect(mocks.conversation).toHaveBeenCalledWith({ where: { id: "conversation" }, select: { workspaceId: true } });
    expect(mocks.messages).not.toHaveBeenCalled();
    expect(mocks.complete).not.toHaveBeenCalled();
  });

  it("does not run a model-directed handoff to a foreign private definition", async () => {
    await expect(executeHandoff("conversation", { fromAgent: "owned-agent", toAgent: "private-agent", task: "Synthetic task", context: "Synthetic context" })).rejects.toThrow("not found");
    expect(mocks.complete).not.toHaveBeenCalled();
  });

  it("rejects missing conversations before any provider or message read", async () => {
    mocks.conversation.mockResolvedValue(null);
    await expect(runTurn("missing", "private-agent")).rejects.toThrow("Conversation");
    expect(mocks.blueprint).not.toHaveBeenCalled();
    expect(mocks.messages).not.toHaveBeenCalled();
    expect(mocks.complete).not.toHaveBeenCalled();
  });
});

describe("Agent-to-Agent Protocol", () => {
  describe("detectHandoff", () => {
    it("detects handoff with agent slug and task", () => {
      const content = "I need legal expertise.\n[HANDOFF:legal-analyst] Task: Check if violation X falls under ADA Title III\nThe violation affects color contrast on the checkout page.";
      const result = detectHandoff(content, "compliance-auditor");
      expect(result).not.toBeNull();
      expect(result!.toAgent).toBe("legal-analyst");
      expect(result!.task).toContain("ADA Title III");
      expect(result!.fromAgent).toBe("compliance-auditor");
    });

    it("extracts context after the handoff line", () => {
      const content = "[HANDOFF:developer-guide] Fix the aria-label issue\nThe element is a button with no accessible name. It uses role='button' but has no aria-label.";
      const result = detectHandoff(content, "compliance-auditor");
      expect(result).not.toBeNull();
      expect(result!.context).toContain("accessible name");
    });

    it("returns null when no handoff pattern exists", () => {
      const content = "The color contrast ratio is 3.2:1, which fails WCAG 1.4.3.";
      expect(detectHandoff(content, "compliance-auditor")).toBeNull();
    });

    it("prevents self-handoff", () => {
      const content = "[HANDOFF:compliance-auditor] Re-analyze the results";
      expect(detectHandoff(content, "compliance-auditor")).toBeNull();
    });

    it("handles handoff without explicit Task: prefix", () => {
      const content = "[HANDOFF:report-writer] Generate an executive summary of these findings";
      const result = detectHandoff(content, "compliance-auditor");
      expect(result).not.toBeNull();
      expect(result!.toAgent).toBe("report-writer");
      expect(result!.task).toContain("executive summary");
    });

    it("caps context length to prevent overflow", () => {
      const longContext = "x".repeat(2000);
      const content = `[HANDOFF:legal-analyst] Check compliance\n${longContext}`;
      const result = detectHandoff(content, "compliance-auditor");
      expect(result).not.toBeNull();
      expect(result!.context.length).toBeLessThanOrEqual(1000);
    });

    it("handles case-insensitive handoff markers", () => {
      const content = "[handoff:legal-analyst] Review ADA compliance";
      const result = detectHandoff(content, "compliance-auditor");
      expect(result).not.toBeNull();
      expect(result!.toAgent).toBe("legal-analyst");
    });
  });
});
