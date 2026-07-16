import { describe, it, expect, vi } from "vitest";
vi.mock("server-only", () => ({}));

import { getAllTestCases, getTestCasesByCategory, getTestCasesByTag, generateDataset, getDatasetStats } from "@/lib/ai/testing/synthetic";

describe("Synthetic Test Data Generator", () => {
  describe("getAllTestCases", () => {
    it("returns all test cases", () => {
      const all = getAllTestCases();
      expect(all.length).toBeGreaterThanOrEqual(30);
    });

    it("each case has required fields", () => {
      for (const tc of getAllTestCases()) {
        expect(tc.id).toBeTruthy();
        expect(tc.category).toBeTruthy();
        expect(tc.input).toBeDefined(); // empty string is valid (edge case)
        expect(tc.expectedBehavior).toBeTruthy();
        expect(tc.tags.length).toBeGreaterThan(0);
      }
    });

    it("includes all 4 categories", () => {
      const categories = new Set(getAllTestCases().map((tc) => tc.category));
      expect(categories.has("standard")).toBe(true);
      expect(categories.has("edge-case")).toBe(true);
      expect(categories.has("adversarial")).toBe(true);
      expect(categories.has("multilingual")).toBe(true);
    });
  });

  describe("getTestCasesByCategory", () => {
    it("returns standard cases", () => {
      expect(getTestCasesByCategory("standard").length).toBeGreaterThanOrEqual(8);
    });

    it("returns adversarial cases", () => {
      const adv = getTestCasesByCategory("adversarial");
      expect(adv.length).toBeGreaterThanOrEqual(10);
      expect(adv.every((tc) => tc.category === "adversarial")).toBe(true);
    });

    it("returns multilingual cases with language field", () => {
      const ml = getTestCasesByCategory("multilingual");
      expect(ml.length).toBeGreaterThanOrEqual(8);
      expect(ml.every((tc) => tc.language)).toBe(true);
    });
  });

  describe("getTestCasesByTag", () => {
    it("filters by security tag", () => {
      const security = getTestCasesByTag("security");
      expect(security.length).toBeGreaterThan(3);
      expect(security.every((tc) => tc.tags.includes("security"))).toBe(true);
    });

    it("filters by i18n tag", () => {
      const i18n = getTestCasesByTag("i18n");
      expect(i18n.length).toBeGreaterThanOrEqual(8);
    });
  });

  describe("generateDataset", () => {
    it("generates full dataset with metadata", () => {
      const ds = generateDataset();
      expect(ds.name).toContain("reglayer-eval");
      expect(ds.cases.length).toBeGreaterThan(0);
      expect(ds.generatedAt).toBeTruthy();
    });

    it("filters by category", () => {
      const ds = generateDataset({ categories: ["adversarial"] });
      expect(ds.cases.every((tc) => tc.category === "adversarial")).toBe(true);
    });

    it("filters by tag", () => {
      const ds = generateDataset({ tags: ["security"] });
      expect(ds.cases.every((tc) => tc.tags.includes("security"))).toBe(true);
    });

    it("respects limit", () => {
      const ds = generateDataset({ limit: 5 });
      expect(ds.cases).toHaveLength(5);
    });
  });

  describe("getDatasetStats", () => {
    it("returns comprehensive stats", () => {
      const stats = getDatasetStats();
      expect(stats.total).toBeGreaterThanOrEqual(30);
      expect(stats.byCategory.standard).toBeGreaterThan(0);
      expect(stats.byCategory.adversarial).toBeGreaterThan(0);
      expect(stats.languages.length).toBeGreaterThanOrEqual(6);
      expect(stats.criticalAdversarial).toBeGreaterThanOrEqual(3);
    });

    it("counts tags correctly", () => {
      const stats = getDatasetStats();
      expect(stats.byTag["security"]).toBeGreaterThan(0);
      expect(stats.byTag["chat"]).toBeGreaterThan(0);
    });
  });
});
