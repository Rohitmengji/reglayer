/**
 * RegLayer — Vendor Accessibility Liability Graph tests (pure core)
 *
 * Cross-tenant aggregation, reach-weighted liability scoring, and regression-trend
 * detection. No Prisma, no Next.
 */

import { describe, it, expect } from "vitest";
import {
  aggregateVendorObservations,
  computeLiabilityScore,
  detectVendorTrend,
  TREND_THRESHOLD_PCT,
  type VendorObservationInput,
} from "@/lib/vendorgraph/vendorGraph";

const at = (n: number) => new Date(Date.UTC(2026, 0, 1 + n, 12));

function obs(over: Partial<VendorObservationInput> = {}): VendorObservationInput {
  return { vendor: "Intercom", category: "chat-widget", siteId: "site-a", violationCount: 3, riskScore: 60, observedAt: at(0), ...over };
}

describe("computeLiabilityScore", () => {
  it("equals the avg risk for a single site (reach multiplier 1.0)", () => {
    expect(computeLiabilityScore(50, 1)).toBe(50);
  });
  it("scales up with reach and caps at 100", () => {
    expect(computeLiabilityScore(40, 10)).toBe(60); // ×1.5
    expect(computeLiabilityScore(60, 100)).toBe(100); // ×2.0 → capped
  });
});

describe("aggregateVendorObservations", () => {
  it("counts distinct sites, totals, and averages per vendor", () => {
    const data = [
      obs({ siteId: "site-a", riskScore: 60, violationCount: 3 }),
      obs({ siteId: "site-b", riskScore: 80, violationCount: 5 }),
    ];
    const [agg] = aggregateVendorObservations(data);
    expect(agg.vendor).toBe("Intercom");
    expect(agg.sitesAffected).toBe(2);
    expect(agg.observations).toBe(2);
    expect(agg.totalViolations).toBe(8);
    expect(agg.avgViolationsPerObservation).toBe(4);
    expect(agg.avgRiskScore).toBe(70);
    expect(agg.liabilityScore).toBe(computeLiabilityScore(70, 2));
  });

  it("ranks vendors by liability score (reach-weighted) descending", () => {
    const data = [
      // Wide-reach moderate-risk vendor across 3 sites
      obs({ vendor: "OneTrust", category: "consent-banner", siteId: "s1", riskScore: 45 }),
      obs({ vendor: "OneTrust", category: "consent-banner", siteId: "s2", riskScore: 45 }),
      obs({ vendor: "OneTrust", category: "consent-banner", siteId: "s3", riskScore: 45 }),
      // High-risk vendor seen once
      obs({ vendor: "RareWidget", category: "personalization", siteId: "s1", riskScore: 55 }),
    ];
    const aggs = aggregateVendorObservations(data);
    // OneTrust: 45 × (1 + log10(3)·0.5) ≈ 45×1.24 ≈ 56  > RareWidget 55×1.0 = 55
    expect(aggs[0].vendor).toBe("OneTrust");
  });

  it("dedupes the same site embedding a vendor many times into one affected site", () => {
    const data = [obs({ siteId: "site-a" }), obs({ siteId: "site-a" }), obs({ siteId: "site-a" })];
    const [agg] = aggregateVendorObservations(data);
    expect(agg.sitesAffected).toBe(1);
    expect(agg.observations).toBe(3);
  });
});

describe("detectVendorTrend", () => {
  const splitAt = at(10);
  const series = (vendor: string, priorRisk: number[], recentRisk: number[]): VendorObservationInput[] => [
    ...priorRisk.map((r, i) => obs({ vendor, riskScore: r, observedAt: at(i) })), // before split
    ...recentRisk.map((r, i) => obs({ vendor, riskScore: r, observedAt: at(11 + i) })), // after split
  ];

  it("flags a regression when recent risk is materially higher", () => {
    const t = detectVendorTrend(series("V", [30, 30], [60, 60]), "V", splitAt);
    expect(t.direction).toBe("regressed");
    expect(t.deltaPct).toBe(30);
  });

  it("flags an improvement when recent risk is materially lower", () => {
    const t = detectVendorTrend(series("V", [60, 60], [30, 30]), "V", splitAt);
    expect(t.direction).toBe("improved");
  });

  it("is stable within the noise threshold", () => {
    const t = detectVendorTrend(series("V", [50], [50 + TREND_THRESHOLD_PCT - 1]), "V", splitAt);
    expect(t.direction).toBe("stable");
  });

  it("reports insufficient-data when a period has no observations", () => {
    const t = detectVendorTrend(series("V", [], [40, 50]), "V", splitAt);
    expect(t.direction).toBe("insufficient-data");
    expect(t.priorAvgRiskScore).toBeNull();
  });

  it("only considers the named vendor", () => {
    const data = [...series("V", [30], [70]), ...series("Other", [10], [10])];
    const t = detectVendorTrend(data, "V", splitAt);
    expect(t.recentCount).toBe(1);
    expect(t.direction).toBe("regressed");
  });
});
