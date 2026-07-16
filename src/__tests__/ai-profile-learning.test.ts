/**
 * Tests for Semantic User Profile + Long-Term Learning
 */
import { describe, it, expect, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/database/prisma", () => ({ prisma: {} }));

import { formatProfileForPrompt, type SemanticProfile } from "@/lib/ai/profile/service";

const baseProfile: SemanticProfile = {
  userId: "u1",
  writingStyle: null,
  preferredTone: null,
  preferredModel: null,
  language: null,
  domainExpertise: [],
  industries: [],
  techStack: [],
  wcagLevel: null,
  regulations: [],
  frequentTools: [],
  topFeatures: [],
  totalQueries: 0,
  totalFeedback: 0,
  avgRating: null,
  prefersCodeExamples: false,
  prefersCitations: true,
  prefersShortAnswers: false,
};

describe("Semantic User Profile", () => {
  describe("formatProfileForPrompt", () => {
    it("returns empty string for default profile", () => {
      expect(formatProfileForPrompt(baseProfile)).toBe("");
    });

    it("includes writing style when set", () => {
      const profile = { ...baseProfile, writingStyle: "technical" };
      const result = formatProfileForPrompt(profile);
      expect(result).toContain("Writing style: technical");
    });

    it("includes preferred tone", () => {
      const profile = { ...baseProfile, preferredTone: "formal" };
      const result = formatProfileForPrompt(profile);
      expect(result).toContain("Preferred tone: formal");
    });

    it("includes domain expertise", () => {
      const profile = { ...baseProfile, domainExpertise: ["frontend", "legal"] };
      const result = formatProfileForPrompt(profile);
      expect(result).toContain("Domain expertise: frontend, legal");
    });

    it("includes tech stack", () => {
      const profile = { ...baseProfile, techStack: ["react", "nextjs", "tailwind"] };
      const result = formatProfileForPrompt(profile);
      expect(result).toContain("Tech stack: react, nextjs, tailwind");
    });

    it("includes WCAG level", () => {
      const profile = { ...baseProfile, wcagLevel: "AA" };
      const result = formatProfileForPrompt(profile);
      expect(result).toContain("WCAG target: Level AA");
    });

    it("includes regulations", () => {
      const profile = { ...baseProfile, regulations: ["ADA", "EAA"] };
      const result = formatProfileForPrompt(profile);
      expect(result).toContain("Compliance regulations: ADA, EAA");
    });

    it("includes code preference", () => {
      const profile = { ...baseProfile, prefersCodeExamples: true };
      const result = formatProfileForPrompt(profile);
      expect(result).toContain("code examples");
    });

    it("includes short answer preference", () => {
      const profile = { ...baseProfile, prefersShortAnswers: true };
      const result = formatProfileForPrompt(profile);
      expect(result).toContain("concise, short");
    });

    it("skips language when English (default)", () => {
      const profile = { ...baseProfile, language: "en" };
      const result = formatProfileForPrompt(profile);
      expect(result).not.toContain("language");
    });

    it("includes non-English language", () => {
      const profile = { ...baseProfile, language: "de" };
      const result = formatProfileForPrompt(profile);
      expect(result).toContain("Response language: de");
    });

    it("combines multiple fields into User Profile section", () => {
      const profile = {
        ...baseProfile,
        writingStyle: "detailed",
        techStack: ["react"],
        wcagLevel: "AA",
        prefersCodeExamples: true,
      };
      const result = formatProfileForPrompt(profile);
      expect(result).toContain("## User Profile");
      expect(result).toContain("Writing style: detailed");
      expect(result).toContain("Tech stack: react");
      expect(result).toContain("WCAG target: Level AA");
      expect(result).toContain("code examples");
    });
  });
});
