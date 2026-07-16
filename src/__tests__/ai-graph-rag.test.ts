/**
 * Tests for Graph RAG — entity extraction, target type guessing
 */
import { describe, it, expect, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/database/prisma", () => ({ prisma: {} }));
vi.mock("@/lib/ai/gateway", () => ({ embed: vi.fn(), complete: vi.fn() }));

import { extractEntityReferences } from "@/lib/ai/graph/service";

describe("Graph RAG", () => {
  describe("extractEntityReferences", () => {
    it("extracts WCAG criteria from query", () => {
      const refs = extractEntityReferences("What does SC 1.4.3 require?");
      expect(refs).toContainEqual({ type: "wcag", pattern: "1.4.3" });
    });

    it("extracts multiple WCAG criteria", () => {
      const refs = extractEntityReferences("Compare WCAG 2.1.1 and 2.4.7 requirements");
      const wcagRefs = refs.filter((r) => r.type === "wcag");
      expect(wcagRefs).toHaveLength(2);
      expect(wcagRefs.map((r) => r.pattern)).toContain("2.1.1");
      expect(wcagRefs.map((r) => r.pattern)).toContain("2.4.7");
    });

    it("extracts rule IDs", () => {
      const refs = extractEntityReferences("How do I fix color-contrast violations?");
      expect(refs).toContainEqual({ type: "violation", pattern: "color-contrast" });
    });

    it("extracts URLs/domains", () => {
      const refs = extractEntityReferences("Scan results for example.com");
      expect(refs.some((r) => r.type === "site" && r.pattern.includes("example.com"))).toBe(true);
    });

    it("extracts regulation names", () => {
      const refs = extractEntityReferences("Are we compliant with the ADA?");
      expect(refs).toContainEqual({ type: "regulation", pattern: "ADA" });
    });

    it("extracts EAA regulation", () => {
      const refs = extractEntityReferences("What does the EAA require for accessibility?");
      expect(refs).toContainEqual({ type: "regulation", pattern: "EAA" });
    });

    it("extracts Section 508", () => {
      const refs = extractEntityReferences("Does our site meet Section 508 requirements?");
      expect(refs).toContainEqual({ type: "regulation", pattern: "Section 508" });
    });

    it("extracts EN 301 549", () => {
      const refs = extractEntityReferences("EN 301 549 compliance status");
      expect(refs).toContainEqual({ type: "regulation", pattern: "EN 301 549" });
    });

    it("returns empty for generic queries", () => {
      const refs = extractEntityReferences("How do I improve accessibility?");
      // No specific entities — just generic terms
      expect(refs.filter((r) => r.type === "wcag" || r.type === "regulation")).toHaveLength(0);
    });

    it("handles complex multi-entity queries", () => {
      const refs = extractEntityReferences(
        "Which WCAG 1.4.3 violations on example.com affect ADA compliance?"
      );
      expect(refs.some((r) => r.type === "wcag")).toBe(true);
      expect(refs.some((r) => r.type === "site")).toBe(true);
      expect(refs.some((r) => r.type === "regulation")).toBe(true);
    });

    it("extracts aria-related rule IDs", () => {
      const refs = extractEntityReferences("Fix the aria-label issue on the form");
      expect(refs).toContainEqual({ type: "violation", pattern: "aria-label" });
    });
  });
});
