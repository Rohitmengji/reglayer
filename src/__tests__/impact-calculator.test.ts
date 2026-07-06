/**
 * RegLayer — Impact Calculator Tests
 */
import { describe, it, expect } from "vitest";
import { calculateImpact, type ImpactInput } from "@/lib/impact/calculator";

function makeInput(overrides: Partial<ImpactInput> = {}): ImpactInput {
  return {
    scoreBefore: 45,
    violationsBefore: 120,
    riskExposureBefore: 2_100_000_00, // $2.1M
    personasPassingBefore: 1,
    scoreAfter: 92,
    violationsAfter: 8,
    riskExposureAfter: 180_000_00,    // $180K
    personasPassingAfter: 5,
    monthlyTraffic: 100_000,
    disabilityPrevalence: 0.15,
    conversionRate: 0.03,
    avgOrderValue: 85_00, // $85
    industry: "ecommerce",
    proofChainLength: 94,
    monitoringDays: 30,
    scansInPeriod: 30,
    periodStart: new Date("2026-06-01"),
    periodEnd: new Date("2026-06-30"),
    ...overrides,
  };
}

describe("calculateImpact", () => {
  it("computes users unblocked from traffic × prevalence × gain", () => {
    const result = calculateImpact(makeInput());
    // 100K × 0.15 = 15K disabled visitors × ~0.93 gain = ~14K
    expect(result.usersUnblocked).toBeGreaterThan(10000);
    expect(result.usersUnblocked).toBeLessThan(16000);
  });

  it("computes revenue enabled from unblocked × conversion × AOV", () => {
    const result = calculateImpact(makeInput());
    // ~14K users × 3% conversion × $85 ≈ $35K+
    expect(result.revenueEnabled).toBeGreaterThan(20_000_00); // > $20K
    expect(result.revenueEnabled).toBeLessThan(100_000_00);   // < $100K
  });

  it("computes risk reduced as exposure delta", () => {
    const result = calculateImpact(makeInput());
    // $2.1M - $180K = $1.92M risk reduced
    expect(result.riskReduced).toBe(2_100_000_00 - 180_000_00);
  });

  it("computes violations fixed", () => {
    const result = calculateImpact(makeInput());
    expect(result.violationsFixed).toBe(112); // 120 - 8
  });

  it("computes score improvement", () => {
    const result = calculateImpact(makeInput());
    expect(result.scoreImprovement).toBe(47); // 92 - 45
  });

  it("returns zero impact when no improvement", () => {
    const result = calculateImpact(makeInput({
      scoreBefore: 80,
      scoreAfter: 80,
      violationsBefore: 10,
      violationsAfter: 10,
      riskExposureBefore: 50_000_00,
      riskExposureAfter: 50_000_00,
    }));
    expect(result.usersUnblocked).toBe(0);
    expect(result.revenueEnabled).toBe(0);
    expect(result.riskReduced).toBe(0);
    expect(result.violationsFixed).toBe(0);
    expect(result.scoreImprovement).toBe(0);
  });

  it("caps accessibility gain at 1.0", () => {
    const result = calculateImpact(makeInput({
      scoreBefore: 0,
      scoreAfter: 100,
      violationsBefore: 500,
      violationsAfter: 0,
    }));
    expect(result.accessibilityGain).toBeLessThanOrEqual(1.0);
  });

  it("handles zero violations gracefully", () => {
    const result = calculateImpact(makeInput({
      violationsBefore: 0,
      violationsAfter: 0,
    }));
    // Still computes from score improvement alone
    expect(result.usersUnblocked).toBeGreaterThan(0);
  });

  it("uses industry defaults when conversion/AOV not provided", () => {
    const result = calculateImpact(makeInput({
      conversionRate: null,
      avgOrderValue: null,
      industry: "ecommerce",
    }));
    expect(result.revenueEnabled).toBeGreaterThan(0);
    expect(result.methodology.assumptions).toEqual(
      expect.arrayContaining([expect.stringContaining("industry average")])
    );
  });

  it("produces a verifiable evidence hash", () => {
    const input = makeInput();
    const result1 = calculateImpact(input);
    const result2 = calculateImpact(input);
    expect(result1.evidenceHash).toBe(result2.evidenceHash);
    expect(result1.evidenceHash).toHaveLength(64); // SHA-256
  });

  it("different inputs produce different hashes", () => {
    const result1 = calculateImpact(makeInput({ scoreAfter: 92 }));
    const result2 = calculateImpact(makeInput({ scoreAfter: 91 }));
    expect(result1.evidenceHash).not.toBe(result2.evidenceHash);
  });

  it("provides industry percentile", () => {
    const result = calculateImpact(makeInput({ industry: "ecommerce" }));
    expect(result.industryPercentile).toBeGreaterThan(90); // Score 92 = top 5%
  });

  it("returns null percentile without industry", () => {
    const result = calculateImpact(makeInput({ industry: null }));
    expect(result.industryPercentile).toBeNull();
  });

  it("determines confidence level based on data quality", () => {
    // High confidence: all data provided
    const high = calculateImpact(makeInput());
    expect(high.methodology.confidence).toBe("high");

    // Low confidence: missing data
    const low = calculateImpact(makeInput({
      monthlyTraffic: 0,
      conversionRate: null,
      avgOrderValue: null,
      scansInPeriod: 2,
      monitoringDays: 5,
      proofChainLength: 0,
      violationsBefore: 3,
    }));
    expect(low.methodology.confidence).toBe("low");
  });

  it("includes transparent methodology", () => {
    const result = calculateImpact(makeInput());
    expect(result.methodology.formula).toContain("usersUnblocked");
    expect(result.methodology.assumptions.length).toBeGreaterThan(3);
    expect(result.methodology.inputs).toHaveProperty("monthlyTraffic");
  });
});
