import { describe, it, expect } from "vitest";
import { computeLitigationSurface, type SurfaceViolation } from "@/lib/risk/litigationSurface";

describe("computeLitigationSurface", () => {
  it("returns a truthful LOW/zero surface for no violations", () => {
    const s = computeLitigationSurface([], 5);
    expect(s.score).toBe(0);
    expect(s.tier).toBe("LOW");
    expect(s.coveredRuleCount).toBe(0);
    expect(s.factors).toEqual([]);
    expect(s.estimatedExposure).toBe(0);
    expect(s.totalHighRiskRules).toBe(6);
    expect(s.summary).toMatch(/None of the 6/);
  });

  it("ignores non-litigation rules entirely", () => {
    const v: SurfaceViolation[] = [
      { ruleId: "region", impact: "moderate", url: "/a" },
      { ruleId: "landmark-one-main", impact: "moderate", url: "/a" },
    ];
    const s = computeLitigationSurface(v, 3);
    expect(s.coveredRuleCount).toBe(0);
    expect(s.score).toBe(0);
  });

  it("scores a single litigation rule by prevalence + impact (exact)", () => {
    // image-alt on both of 2 pages, critical → prevalence 1, impact 2.0
    const v: SurfaceViolation[] = [
      { ruleId: "image-alt", impact: "critical", url: "https://x/a" },
      { ruleId: "image-alt", impact: "critical", url: "https://x/b" },
    ];
    const s = computeLitigationSurface(v, 2);
    // contribution = 0.22 * 2.0 * 1 = 0.44 ; maxRaw = 1.0*2 = 2.0 ; score = 22
    expect(s.score).toBe(22);
    expect(s.tier).toBe("LOW");
    expect(s.coveredRuleCount).toBe(1);
    const f = s.factors[0];
    expect(f.ruleId).toBe("image-alt");
    expect(f.affectedPages).toBe(2);
    expect(f.occurrences).toBe(2);
    expect(f.lawsuitFrequency).toBeCloseTo(0.67);
    // exposure = 28000 * 0.67 * (0.5 + 0.5*1) = 18760
    expect(f.estimatedExposure).toBe(18760);
    expect(s.estimatedExposure).toBe(18760);
    expect(f.label).toMatch(/alt text/i);
  });

  it("maxes out at CRITICAL when all 6 high-litigation rules saturate every page", () => {
    const rules = ["image-alt", "label", "color-contrast", "link-name", "keyboard", "form-field-multiple-labels"];
    const v: SurfaceViolation[] = rules.map((r) => ({ ruleId: r, impact: "critical", url: "https://x/only" }));
    const s = computeLitigationSurface(v, 1);
    expect(s.score).toBe(100);
    expect(s.tier).toBe("CRITICAL");
    expect(s.coveredRuleCount).toBe(6);
    expect(s.summary).toMatch(/severe litigation surface/);
  });

  it("weights widespread issues higher than rare ones (prevalence)", () => {
    const widespread = computeLitigationSurface(
      Array.from({ length: 10 }, (_, i) => ({ ruleId: "image-alt", impact: "critical", url: `/p${i}` })),
      10,
    );
    const rare = computeLitigationSurface(
      [
        { ruleId: "image-alt", impact: "critical", url: "/p0" },
        { ruleId: "image-alt", impact: "critical", url: "/p1" },
      ],
      10,
    );
    expect(widespread.score).toBeGreaterThan(rare.score);
    expect(widespread.factors[0].affectedPages).toBe(10);
    expect(rare.factors[0].affectedPages).toBe(2);
  });

  it("defaults missing impact to moderate (does not throw)", () => {
    const s = computeLitigationSurface([{ ruleId: "label", url: "/x" }], 1);
    // contribution = 0.19 * 1.0 * 1 = 0.19 ; score = round(9.5) = 10
    expect(s.score).toBe(10);
    expect(s.factors[0].occurrences).toBe(1);
  });

  it("counts distinct affected pages and caps sample URLs", () => {
    const v: SurfaceViolation[] = [];
    for (let i = 0; i < 8; i++) v.push({ ruleId: "color-contrast", impact: "serious", url: `/page${i}` });
    // duplicate URL should not inflate affectedPages or samples
    v.push({ ruleId: "color-contrast", impact: "serious", url: `/page0` });
    const s = computeLitigationSurface(v, 8);
    const f = s.factors[0];
    expect(f.affectedPages).toBe(8);
    expect(f.occurrences).toBe(9);
    expect(f.sampleUrls.length).toBe(4); // capped
    expect(new Set(f.sampleUrls).size).toBe(f.sampleUrls.length); // deduped
  });

  it("is deterministic", () => {
    const v: SurfaceViolation[] = [
      { ruleId: "image-alt", impact: "critical", url: "/a" },
      { ruleId: "label", impact: "serious", url: "/b" },
      { ruleId: "link-name", impact: "serious", url: "/a" },
    ];
    const a = computeLitigationSurface(v, 4);
    const b = computeLitigationSurface(v, 4);
    expect(a).toEqual(b);
    // sorted by contribution desc
    for (let i = 1; i < a.factors.length; i++) {
      expect(a.factors[i - 1].contribution).toBeGreaterThanOrEqual(a.factors[i].contribution);
    }
  });
});
