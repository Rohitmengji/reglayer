/**
 * Tests for AI Memory — extraction patterns and prompt formatting
 */
import { describe, it, expect, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/database/prisma", () => ({ prisma: {} }));

import { extractMemories, formatMemoriesForPrompt, type MemoryEntry } from "@/lib/ai/memory/service";

describe("AI Memory", () => {
  describe("extractMemories", () => {
    it("extracts WCAG level preference", () => {
      const result = extractMemories("We target WCAG level AA for our platform.");
      expect(result).toContainEqual({ key: "preferred_wcag_level", value: "AA" });
    });

    it("extracts tech stack from user statement", () => {
      const result = extractMemories("Our team uses React and Next.js for the frontend. It works great.");
      expect(result).toContainEqual({ key: "tech_stack", value: "React and Next.js for the frontend" });
    });

    it("extracts industry", () => {
      const result = extractMemories("We're in the healthcare industry and need strict compliance.");
      expect(result).toContainEqual({ key: "industry", value: "healthcare" });
    });

    it("extracts product type", () => {
      const result = extractMemories("Our site is an e-commerce marketplace for handmade goods.");
      expect(result).toContainEqual({ key: "product_type", value: "e-commerce marketplace for handmade goods" });
    });

    it("extracts compliance deadline", () => {
      const result = extractMemories("Our deadline is June 28, 2025 for the EAA.");
      expect(result).toContainEqual({ key: "compliance_deadline", value: "June 28, 2025 for the EAA" });
    });

    it("returns empty for irrelevant messages", () => {
      const result = extractMemories("How do I fix this color contrast issue?");
      expect(result).toHaveLength(0);
    });

    it("ignores too-short values", () => {
      const result = extractMemories("We target A compliance");
      // Single char "A" is valid for WCAG level
      const wcagMem = result.find((m) => m.key === "preferred_wcag_level");
      expect(wcagMem?.value).toBe("A");
    });
  });

  describe("formatMemoriesForPrompt", () => {
    it("returns empty string for no memories", () => {
      expect(formatMemoriesForPrompt([])).toBe("");
    });

    it("formats user memories", () => {
      const memories: MemoryEntry[] = [
        { id: "1", key: "preferred_wcag_level", value: "AA", scope: "USER", confidence: 1, source: "user_stated", createdAt: new Date(), updatedAt: new Date() },
      ];
      const result = formatMemoriesForPrompt(memories);
      expect(result).toContain("User Preferences");
      expect(result).toContain("preferred_wcag_level: AA");
    });

    it("formats workspace memories separately", () => {
      const memories: MemoryEntry[] = [
        { id: "1", key: "tech_stack", value: "React + Next.js", scope: "WORKSPACE", confidence: 1, source: "admin_set", createdAt: new Date(), updatedAt: new Date() },
      ];
      const result = formatMemoriesForPrompt(memories);
      expect(result).toContain("Team Context");
      expect(result).toContain("tech_stack: React + Next.js");
    });

    it("formats system memories separately", () => {
      const memories: MemoryEntry[] = [
        { id: "1", key: "eaa_deadline", value: "June 28, 2025", scope: "SYSTEM", confidence: 1, source: "admin_set", createdAt: new Date(), updatedAt: new Date() },
      ];
      const result = formatMemoriesForPrompt(memories);
      expect(result).toContain("Important Facts");
      expect(result).toContain("eaa_deadline: June 28, 2025");
    });

    it("combines all scopes in one prompt section", () => {
      const memories: MemoryEntry[] = [
        { id: "1", key: "level", value: "AA", scope: "USER", confidence: 1, source: null, createdAt: new Date(), updatedAt: new Date() },
        { id: "2", key: "stack", value: "React", scope: "WORKSPACE", confidence: 1, source: null, createdAt: new Date(), updatedAt: new Date() },
        { id: "3", key: "deadline", value: "June", scope: "SYSTEM", confidence: 1, source: null, createdAt: new Date(), updatedAt: new Date() },
      ];
      const result = formatMemoriesForPrompt(memories);
      expect(result).toContain("Personalization");
      expect(result).toContain("User Preferences");
      expect(result).toContain("Team Context");
      expect(result).toContain("Important Facts");
    });
  });
});
