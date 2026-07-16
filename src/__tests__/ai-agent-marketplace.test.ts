/**
 * Tests for Agent Marketplace + A2A Protocol
 */
import { describe, it, expect, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/database/prisma", () => ({ prisma: {} }));
vi.mock("@/lib/ai/gateway", () => ({ complete: vi.fn() }));
vi.mock("@/lib/ai/marketplace/registry", () => ({ getBlueprint: vi.fn() }));

import { detectHandoff } from "@/lib/ai/a2a/protocol";

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
