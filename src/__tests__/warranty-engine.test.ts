/**
 * RegLayer — Warranty Eligibility Engine Tests
 *
 * Unit tests for the pure warranty core: eligibility evaluation,
 * claim eligibility, and pricing calculations.
 */
import { describe, it, expect } from "vitest";
import {
  evaluateEligibility,
  evaluateClaimEligibility,
  TIER_COVERAGE,
  TIER_PREMIUM,
  type PolicyConfig,
  type ScanHistoryEntry,
} from "@/lib/warranty/eligibility";
import { calculateWarrantyPremium } from "@/lib/warranty/pricing";

// ─── Test Helpers ────────────────────────────────────────────────────────────

function makePolicy(overrides: Partial<PolicyConfig> = {}): PolicyConfig {
  return {
    tier: "SHIELD",
    status: "ACTIVE",
    scoreFloor: 75,
    monitoringGapHours: 48,
    coverageLimit: TIER_COVERAGE.SHIELD,
    enrolledAt: new Date("2026-01-01"),
    activatedAt: new Date("2026-02-01"),
    expiresAt: null,
    suspensionCount: 0,
    consecutiveDaysAboveFloor: 60,
    ...overrides,
  };
}

function makeScans(
  count: number,
  score: number,
  startDate: Date,
  intervalHours = 24
): ScanHistoryEntry[] {
  const scans: ScanHistoryEntry[] = [];
  for (let i = 0; i < count; i++) {
    scans.push({
      score,
      scannedAt: new Date(startDate.getTime() - i * intervalHours * 60 * 60 * 1000),
    });
  }
  return scans;
}

const NOW = new Date("2026-07-05T12:00:00Z");

// ─── Eligibility Tests ───────────────────────────────────────────────────────

describe("evaluateEligibility", () => {
  it("returns ACTIVE when all conditions met", () => {
    const result = evaluateEligibility({
      policy: makePolicy(),
      recentScans: makeScans(30, 85, NOW),
      evidenceChainIntact: true,
      now: NOW,
    });
    expect(result.eligible).toBe(true);
    expect(result.status).toBe("ACTIVE");
    expect(result.currentScore).toBe(85);
  });

  it("suspends when score drops below floor", () => {
    const result = evaluateEligibility({
      policy: makePolicy(),
      recentScans: [{ score: 70, scannedAt: new Date(NOW.getTime() - 3600000) }],
      evidenceChainIntact: true,
      now: NOW,
    });
    expect(result.eligible).toBe(false);
    expect(result.status).toBe("SUSPENDED");
    expect(result.reasons).toEqual(
      expect.arrayContaining([expect.stringContaining("below the warranty floor")])
    );
  });

  it("suspends when monitoring gap detected", () => {
    const threeDaysAgo = new Date(NOW.getTime() - 72 * 60 * 60 * 1000);
    const result = evaluateEligibility({
      policy: makePolicy({ monitoringGapHours: 48 }),
      recentScans: [{ score: 90, scannedAt: threeDaysAgo }],
      evidenceChainIntact: true,
      now: NOW,
    });
    expect(result.eligible).toBe(false);
    expect(result.status).toBe("SUSPENDED");
    expect(result.monitoringGapDetected).toBe(true);
  });

  it("suspends when evidence chain is broken", () => {
    const result = evaluateEligibility({
      policy: makePolicy(),
      recentScans: makeScans(10, 90, NOW),
      evidenceChainIntact: false,
      now: NOW,
    });
    expect(result.eligible).toBe(false);
    expect(result.status).toBe("SUSPENDED");
    expect(result.reasons).toEqual(
      expect.arrayContaining([expect.stringContaining("Evidence chain integrity")])
    );
  });

  it("stays PENDING during qualifying period", () => {
    const result = evaluateEligibility({
      policy: makePolicy({ status: "PENDING", consecutiveDaysAboveFloor: 10 }),
      recentScans: makeScans(15, 85, NOW),
      evidenceChainIntact: true,
      now: NOW,
    });
    expect(result.eligible).toBe(false);
    expect(result.status).toBe("PENDING");
    expect(result.qualifyingProgress).toBeLessThan(100);
  });

  it("transitions PENDING → ACTIVE after 30 days", () => {
    const result = evaluateEligibility({
      policy: makePolicy({ status: "PENDING", consecutiveDaysAboveFloor: 30 }),
      recentScans: makeScans(35, 85, NOW),
      evidenceChainIntact: true,
      now: NOW,
    });
    expect(result.eligible).toBe(true);
    expect(result.status).toBe("ACTIVE");
    expect(result.qualifyingProgress).toBe(100);
  });

  it("cancels after max suspensions", () => {
    const result = evaluateEligibility({
      policy: makePolicy({ suspensionCount: 3 }),
      recentScans: makeScans(5, 90, NOW),
      evidenceChainIntact: true,
      now: NOW,
    });
    expect(result.eligible).toBe(false);
    expect(result.status).toBe("CANCELLED");
  });

  it("returns EXPIRED when past expiry date", () => {
    const result = evaluateEligibility({
      policy: makePolicy({ expiresAt: new Date("2026-06-01") }),
      recentScans: makeScans(5, 90, NOW),
      evidenceChainIntact: true,
      now: NOW,
    });
    expect(result.status).toBe("EXPIRED");
  });

  it("returns CANCELLED for already-cancelled policy", () => {
    const result = evaluateEligibility({
      policy: makePolicy({ status: "CANCELLED" }),
      recentScans: makeScans(5, 90, NOW),
      evidenceChainIntact: true,
      now: NOW,
    });
    expect(result.status).toBe("CANCELLED");
  });

  it("suspends when no scans exist", () => {
    const result = evaluateEligibility({
      policy: makePolicy(),
      recentScans: [],
      evidenceChainIntact: true,
      now: NOW,
    });
    expect(result.eligible).toBe(false);
    expect(result.status).toBe("SUSPENDED");
  });
});

// ─── Claim Eligibility Tests ─────────────────────────────────────────────────

describe("evaluateClaimEligibility", () => {
  const incidentDate = new Date("2026-07-01T10:00:00Z");

  it("approves claim when all conditions met", () => {
    const scans = makeScans(10, 88, incidentDate, 12);
    const result = evaluateClaimEligibility({
      policy: makePolicy({ activatedAt: new Date("2026-03-01") }),
      incidentDate,
      scansAroundIncident: scans,
      evidenceChainIntact: true,
    });
    expect(result.eligible).toBe(true);
    expect(result.coverageAmount).toBe(TIER_COVERAGE.SHIELD);
    expect(result.scoreAtIncident).toBe(88);
  });

  it("denies claim before policy activation", () => {
    const result = evaluateClaimEligibility({
      policy: makePolicy({ activatedAt: new Date("2026-08-01") }),
      incidentDate,
      scansAroundIncident: makeScans(5, 90, incidentDate),
      evidenceChainIntact: true,
    });
    expect(result.eligible).toBe(false);
    expect(result.reasons).toEqual(
      expect.arrayContaining([expect.stringContaining("before warranty was activated")])
    );
  });

  it("denies claim when score was below floor at incident", () => {
    const scans = makeScans(10, 65, incidentDate, 12);
    const result = evaluateClaimEligibility({
      policy: makePolicy({ activatedAt: new Date("2026-03-01") }),
      incidentDate,
      scansAroundIncident: scans,
      evidenceChainIntact: true,
    });
    expect(result.eligible).toBe(false);
    expect(result.scoreAtIncident).toBe(65);
  });

  it("denies claim when evidence chain broken", () => {
    const result = evaluateClaimEligibility({
      policy: makePolicy({ activatedAt: new Date("2026-03-01") }),
      incidentDate,
      scansAroundIncident: makeScans(10, 90, incidentDate, 12),
      evidenceChainIntact: false,
    });
    expect(result.eligible).toBe(false);
    expect(result.reasons).toEqual(
      expect.arrayContaining([expect.stringContaining("Evidence chain integrity")])
    );
  });

  it("denies claim with insufficient monitoring near incident", () => {
    // Only 1 scan in the 7-day window
    const result = evaluateClaimEligibility({
      policy: makePolicy({ activatedAt: new Date("2026-03-01") }),
      incidentDate,
      scansAroundIncident: [{ score: 90, scannedAt: new Date("2026-06-30") }],
      evidenceChainIntact: true,
    });
    expect(result.eligible).toBe(false);
    expect(result.reasons).toEqual(
      expect.arrayContaining([expect.stringContaining("Insufficient monitoring")])
    );
  });
});

// ─── Pricing Tests ───────────────────────────────────────────────────────────

describe("calculateWarrantyPremium", () => {
  const baseInput = {
    tier: "SHIELD" as const,
    currentScore: 85,
    litigationRiskScore: 50,
    industry: "technology",
    geography: "US-OTHER",
    historicalScoreAvg: 85,
    totalScansLast90Days: 30,
    previousClaims: 0,
  };

  it("returns base premium for baseline risk profile", () => {
    const result = calculateWarrantyPremium(baseInput);
    expect(result.monthlyPremium).toBeGreaterThan(0);
    expect(result.coverageLimit).toBe(TIER_COVERAGE.SHIELD);
    expect(result.annualDiscount).toBe(20);
  });

  it("higher score reduces premium", () => {
    const lowScore = calculateWarrantyPremium({ ...baseInput, currentScore: 76 });
    const highScore = calculateWarrantyPremium({ ...baseInput, currentScore: 95 });
    expect(highScore.monthlyPremium).toBeLessThan(lowScore.monthlyPremium);
  });

  it("high-litigation industry increases premium", () => {
    const tech = calculateWarrantyPremium({ ...baseInput, industry: "technology" });
    const ecom = calculateWarrantyPremium({ ...baseInput, industry: "ecommerce" });
    expect(ecom.monthlyPremium).toBeGreaterThan(tech.monthlyPremium);
  });

  it("NY geography increases premium vs OTHER", () => {
    const other = calculateWarrantyPremium({ ...baseInput, geography: "US-OTHER" });
    const ny = calculateWarrantyPremium({ ...baseInput, geography: "US-NY" });
    expect(ny.monthlyPremium).toBeGreaterThan(other.monthlyPremium);
  });

  it("previous claims increase premium by 25% each", () => {
    const noClaims = calculateWarrantyPremium({ ...baseInput, previousClaims: 0 });
    const twoClaims = calculateWarrantyPremium({ ...baseInput, previousClaims: 2 });
    // Should be ~50% more
    expect(twoClaims.monthlyPremium).toBeGreaterThan(noClaims.monthlyPremium * 1.4);
  });

  it("frequent scanning provides discount", () => {
    const rare = calculateWarrantyPremium({ ...baseInput, totalScansLast90Days: 5 });
    const daily = calculateWarrantyPremium({ ...baseInput, totalScansLast90Days: 90 });
    expect(daily.monthlyPremium).toBeLessThan(rare.monthlyPremium);
  });

  it("VAULT tier has highest coverage and premium", () => {
    const shield = calculateWarrantyPremium({ ...baseInput, tier: "SHIELD" });
    const vault = calculateWarrantyPremium({ ...baseInput, tier: "VAULT" });
    expect(vault.monthlyPremium).toBeGreaterThan(shield.monthlyPremium);
    expect(vault.coverageLimit).toBe(TIER_COVERAGE.VAULT);
  });

  it("annual premium applies 20% discount", () => {
    const result = calculateWarrantyPremium(baseInput);
    const expectedAnnual = Math.round(result.monthlyPremium * 12 * 0.8);
    expect(result.annualPremium).toBe(expectedAnnual);
  });
});
