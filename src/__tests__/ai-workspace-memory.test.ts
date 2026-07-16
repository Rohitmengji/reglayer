/**
 * Tests for Workspace Memory — context building
 */
import { describe, it, expect, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/database/prisma", () => ({ prisma: {} }));
vi.mock("@/lib/ai/memory/service", () => ({
  getMemories: vi.fn().mockResolvedValue([]),
  formatMemoriesForPrompt: vi.fn().mockReturnValue(""),
}));

import { INVALIDATION_EVENTS } from "@/lib/ai/workspace/context";

describe("Workspace Memory", () => {
  describe("INVALIDATION_EVENTS", () => {
    it("includes scan completion event", () => {
      expect(INVALIDATION_EVENTS).toContain("scan.completed");
    });

    it("includes document processing event", () => {
      expect(INVALIDATION_EVENTS).toContain("document.processed");
    });

    it("includes member changes", () => {
      expect(INVALIDATION_EVENTS).toContain("member.added");
      expect(INVALIDATION_EVENTS).toContain("member.removed");
    });

    it("includes agent lifecycle events", () => {
      expect(INVALIDATION_EVENTS).toContain("agent.created");
      expect(INVALIDATION_EVENTS).toContain("agent.deleted");
    });

    it("includes memory updates", () => {
      expect(INVALIDATION_EVENTS).toContain("memory.updated");
    });

    it("includes schedule changes", () => {
      expect(INVALIDATION_EVENTS).toContain("schedule.changed");
    });

    it("has at least 8 events", () => {
      expect(INVALIDATION_EVENTS.length).toBeGreaterThanOrEqual(8);
    });
  });
});
