/**
 * ---------------------------------------------------------
 * RegLayer — Warranty Pricing Engine (pure core)
 * ---------------------------------------------------------
 *
 * WHY: Warranty premiums must be dynamically priced based on actual risk.
 *      A site with score 95 and zero critical violations costs less to insure
 *      than a site with score 76 in a high-litigation industry.
 *
 * WHAT: Computes monthly premium from base tier price × risk multipliers.
 *       Pure function — takes risk data, returns a price. No DB, no side effects.
 *
 * HOW: Actuarial-style pricing using RegLayer's own litigation risk model:
 *      basePremium × industryMultiplier × scoreDiscount × historyFactor
 * ---------------------------------------------------------
 */

import { TIER_PREMIUM, TIER_COVERAGE, type WarrantyTier } from "./eligibility";

// ─── Types ───────────────────────────────────────────────────────────────────

export interface PricingInput {
  tier: WarrantyTier;
  currentScore: number;           // 0-100
  litigationRiskScore: number;    // 0-100 from legalRiskEngine
  industry: string;               // e.g. "ecommerce", "healthcare", "fintech"
  geography: string;              // e.g. "US-NY", "EU", "US-CA"
  historicalScoreAvg: number;     // Average score over last 90 days
  totalScansLast90Days: number;   // Monitoring frequency indicator
  previousClaims: number;         // Claims filed on this policy
}

export interface PricingResult {
  monthlyPremium: number;         // USD cents
  annualPremium: number;          // USD cents (with discount)
  annualDiscount: number;         // Percentage
  coverageLimit: number;          // USD cents
  riskMultiplier: number;         // Total composite multiplier
  breakdown: PricingBreakdown;
}

export interface PricingBreakdown {
  basePremium: number;
  scoreMultiplier: number;
  industryMultiplier: number;
  geoMultiplier: number;
  historyMultiplier: number;
  frequencyDiscount: number;
  claimsMultiplier: number;
}

// ─── Multiplier Tables ───────────────────────────────────────────────────────

/**
 * Industry multipliers — based on actual ADA/EAA lawsuit filing frequency.
 * Higher-risk industries pay more because they're more likely to be targeted.
 */
const INDUSTRY_MULTIPLIERS: Record<string, number> = {
  ecommerce: 1.4,       // Highest filing volume
  retail: 1.35,
  hospitality: 1.3,
  food_service: 1.3,
  healthcare: 1.25,
  fintech: 1.2,
  education: 1.15,
  media: 1.1,
  technology: 1.0,      // Baseline
  government: 0.9,      // Lower risk (already mandated)
  nonprofit: 0.85,
  other: 1.1,
};

/**
 * Geography multipliers — based on litigation volume by state/region.
 * NY and CA have the highest ADA filing rates.
 */
const GEO_MULTIPLIERS: Record<string, number> = {
  "US-NY": 1.5,         // #1 filing state
  "US-CA": 1.4,         // #2 filing state
  "US-FL": 1.3,         // #3 filing state
  "US-OTHER": 1.1,
  "EU": 1.2,            // EAA enforcement starting
  "UK": 1.0,
  "CA": 0.9,            // Canada (AODA)
  "AU": 0.9,
  "OTHER": 0.8,
};

// ─── Pricing Engine ──────────────────────────────────────────────────────────

/**
 * Calculate warranty premium for a site based on its risk profile.
 *
 * Formula: basePremium × scoreMultiplier × industryMultiplier × geoMultiplier
 *          × historyMultiplier × claimsMultiplier × (1 - frequencyDiscount)
 */
export function calculateWarrantyPremium(input: PricingInput): PricingResult {
  const basePremium = TIER_PREMIUM[input.tier];
  const coverageLimit = TIER_COVERAGE[input.tier];

  // Score multiplier: higher scores = lower risk = lower premium
  // Score 100 → 0.7x, Score 75 → 1.0x, Score 50 → 1.5x
  const scoreMultiplier = computeScoreMultiplier(input.currentScore);

  // Industry multiplier from lookup
  const industryMultiplier = INDUSTRY_MULTIPLIERS[input.industry] ?? INDUSTRY_MULTIPLIERS.other;

  // Geography multiplier from lookup
  const geoMultiplier = GEO_MULTIPLIERS[input.geography] ?? GEO_MULTIPLIERS.OTHER;

  // History multiplier: stable high scores over time reduce premium
  const historyMultiplier = computeHistoryMultiplier(
    input.historicalScoreAvg,
    input.currentScore
  );

  // Frequency discount: more scans = better monitoring = lower risk
  const frequencyDiscount = computeFrequencyDiscount(input.totalScansLast90Days);

  // Claims multiplier: previous claims increase premium
  const claimsMultiplier = 1 + input.previousClaims * 0.25; // +25% per claim

  const riskMultiplier =
    scoreMultiplier *
    industryMultiplier *
    geoMultiplier *
    historyMultiplier *
    claimsMultiplier *
    (1 - frequencyDiscount);

  const monthlyPremium = Math.round(basePremium * riskMultiplier);

  // Annual discount: 20% off for annual commitment
  const annualDiscount = 20;
  const annualPremium = Math.round(monthlyPremium * 12 * (1 - annualDiscount / 100));

  return {
    monthlyPremium,
    annualPremium,
    annualDiscount,
    coverageLimit,
    riskMultiplier: Math.round(riskMultiplier * 100) / 100,
    breakdown: {
      basePremium,
      scoreMultiplier,
      industryMultiplier,
      geoMultiplier,
      historyMultiplier,
      frequencyDiscount,
      claimsMultiplier,
    },
  };
}

// ─── Internal Multiplier Functions ───────────────────────────────────────────

/**
 * Score → multiplier. Linear interpolation:
 * - Score 100 → 0.7 (30% discount)
 * - Score 75  → 1.0 (baseline)
 * - Score 50  → 1.5 (50% surcharge)
 * - Below 50  → not eligible (but we cap at 2.0 for edge cases)
 */
function computeScoreMultiplier(score: number): number {
  if (score >= 100) return 0.7;
  if (score >= 75) {
    // 75-100 → 1.0-0.7 (linear)
    return 1.0 - ((score - 75) / 25) * 0.3;
  }
  if (score >= 50) {
    // 50-75 → 1.5-1.0 (linear)
    return 1.5 - ((score - 50) / 25) * 0.5;
  }
  // Below 50 — shouldn't be warranted, but cap at 2.0
  return Math.min(2.0, 1.5 + ((50 - score) / 50) * 0.5);
}

/**
 * History multiplier: if historical average is significantly higher than current,
 * it means the site is trending down → higher risk. Stable high = lower risk.
 */
function computeHistoryMultiplier(historicalAvg: number, currentScore: number): number {
  const trend = currentScore - historicalAvg;
  if (trend >= 5) return 0.9;   // Improving → 10% discount
  if (trend >= 0) return 1.0;   // Stable → baseline
  if (trend >= -5) return 1.1;  // Slight decline → 10% surcharge
  return 1.25;                   // Significant decline → 25% surcharge
}

/**
 * Frequency discount: more scans in the last 90 days = better monitoring.
 * Daily scanning (90 scans in 90 days) earns max 15% discount.
 */
function computeFrequencyDiscount(scansLast90Days: number): number {
  if (scansLast90Days >= 90) return 0.15;  // Daily or more
  if (scansLast90Days >= 30) return 0.10;  // ~Every 3 days
  if (scansLast90Days >= 12) return 0.05;  // Weekly
  return 0;                                 // Infrequent — no discount
}
