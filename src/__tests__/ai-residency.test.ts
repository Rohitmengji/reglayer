import { describe, it, expect, vi } from "vitest";
vi.mock("server-only", () => ({}));
vi.mock("@/lib/database/prisma", () => ({ prisma: {} }));

import {
  REGIONS,
  getRegionalEndpoint,
  evaluateResidency,
  getAvailableRegions,
  isValidRegion,
  type DataRegion,
} from "@/lib/ai/residency/engine";

describe("Data Residency Engine", () => {
  describe("REGIONS", () => {
    it("defines 4 regions", () => {
      expect(Object.keys(REGIONS)).toHaveLength(4);
    });

    it("includes US, EU, India, Singapore", () => {
      expect(REGIONS["us-east"]).toBeDefined();
      expect(REGIONS["eu-west"]).toBeDefined();
      expect(REGIONS["ap-south"]).toBeDefined();
      expect(REGIONS["ap-southeast"]).toBeDefined();
    });

    it("EU has GDPR adequacy", () => {
      expect(REGIONS["eu-west"].gdprAdequacy).toBe(true);
    });

    it("US does not have GDPR adequacy", () => {
      expect(REGIONS["us-east"].gdprAdequacy).toBe(false);
    });

    it("each region has regulations", () => {
      for (const region of Object.values(REGIONS)) {
        expect(region.regulations.length).toBeGreaterThan(0);
      }
    });

    it("EU includes GDPR and AI Act", () => {
      expect(REGIONS["eu-west"].regulations).toContain("GDPR");
      expect(REGIONS["eu-west"].regulations).toContain("AI Act");
    });

    it("India includes DPDPA", () => {
      expect(REGIONS["ap-south"].regulations).toContain("DPDPA");
    });
  });

  describe("getRegionalEndpoint", () => {
    it("returns EU endpoint for EU region", () => {
      const ep = getRegionalEndpoint("openai", "gpt-4o-mini", "eu-west");
      expect(ep).not.toBeNull();
      expect(ep!.endpoint).toContain("eu.");
    });

    it("returns US endpoint for US region", () => {
      const ep = getRegionalEndpoint("openai", "gpt-4o-mini", "us-east");
      expect(ep).not.toBeNull();
      expect(ep!.endpoint).toBe("https://api.openai.com");
    });

    it("returns null for unsupported region/model combo", () => {
      expect(getRegionalEndpoint("openai", "gpt-4o-mini", "ap-south")).toBeNull();
    });

    it("supports Anthropic EU endpoint", () => {
      const ep = getRegionalEndpoint("anthropic", "claude-haiku", "eu-west");
      expect(ep).not.toBeNull();
      expect(ep!.endpoint).toContain("eu.");
    });
  });

  describe("evaluateResidency", () => {
    it("no warnings for same-region operation", () => {
      const ctx = evaluateResidency("us-east", "https://api.openai.com");
      expect(ctx.crossRegion).toBe(false);
      expect(ctx.warnings).toHaveLength(0);
    });

    it("warns on EU workspace → US provider", () => {
      const ctx = evaluateResidency("eu-west", "https://api.openai.com");
      expect(ctx.crossRegion).toBe(true);
      expect(ctx.warnings[0]).toContain("SCC");
      expect(ctx.transferBasis).toBe("SCC");
    });

    it("no warning for EU workspace → EU provider", () => {
      const ctx = evaluateResidency("eu-west", "https://eu.api.openai.com");
      expect(ctx.crossRegion).toBe(false);
      expect(ctx.warnings).toHaveLength(0);
    });

    it("warns on India workspace → US provider", () => {
      const ctx = evaluateResidency("ap-south", "https://api.openai.com");
      expect(ctx.crossRegion).toBe(true);
      expect(ctx.warnings[0]).toContain("DPDPA");
    });

    it("includes transfer basis", () => {
      const ctx = evaluateResidency("eu-west", "https://api.openai.com");
      expect(ctx.transferBasis).toBeTruthy();
    });
  });

  describe("getAvailableRegions", () => {
    it("returns all 4 regions", () => {
      expect(getAvailableRegions()).toHaveLength(4);
    });

    it("each region has id, name, flag", () => {
      for (const region of getAvailableRegions()) {
        expect(region.id).toBeTruthy();
        expect(region.name).toBeTruthy();
        expect(region.flag).toBeTruthy();
      }
    });
  });

  describe("isValidRegion", () => {
    it("accepts valid regions", () => {
      expect(isValidRegion("us-east")).toBe(true);
      expect(isValidRegion("eu-west")).toBe(true);
      expect(isValidRegion("ap-south")).toBe(true);
      expect(isValidRegion("ap-southeast")).toBe(true);
    });

    it("rejects invalid regions", () => {
      expect(isValidRegion("us-west")).toBe(false);
      expect(isValidRegion("")).toBe(false);
      expect(isValidRegion("europe")).toBe(false);
    });
  });
});
