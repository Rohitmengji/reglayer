/**
 * ---------------------------------------------------------
 * RegLayer — Warranty Eligibility Engine (pure core)
 * ---------------------------------------------------------
 *
 * WHY: Determines whether a site's compliance warranty is active, suspended,
 *      or pending — and whether a claim is eligible for coverage.
 *
 * WHAT: Pure functions that evaluate warranty status from scan history,
 *       evidence chain integrity, and monitoring continuity. No Prisma,
 *       no Next, no "server-only" — independently testable by an auditor.
 *
 * HOW: Takes plain data (scan scores, timestamps, policy config) and returns
 *      typed verdicts. The server-only loader fetches data; this core decides.
 *
 * DESIGN: Strict eligibility rules — the warranty MUST be defensible:
 *   1. Score must be ≥ floor continuously (no "dipping and recovering" tricks)
 *   2. Monitoring must be continuous (no scanning gap > threshold)
 *   3. Evidence chain must be intact (proves data wasn't tampered)
 *   4. Qualifying period must be complete (30 days of clean monitoring)
 * ---------------------------------------------------------
 */

// ─── Types ───────────────────────────────────────────────────────────────────

export type WarrantyTier = "SHIELD" | "FORTRESS" | "VAULT";
export type WarrantyStatus = "ACTIVE" | "SUSPENDED" | "CANCELLED" | "EXPIRED" | "PENDING";
export type ClaimStatus = "SUBMITTED" | "UNDER_REVIEW" | "APPROVED" | "DENIED" | "RESOLVED";

export interface PolicyConfig {
  tier: WarrantyTier;
  status: WarrantyStatus;
  scoreFloor: number;
  monitoringGapHours: number;
  coverageLimit: number; // USD cents
  enrolledAt: Date;
  activatedAt: Date | null;
  expiresAt: Date | null;
  suspensionCount: number;
  consecutiveDaysAboveFloor: number;
}

export interface ScanHistoryEntry {
  score: number;
  scannedAt: Date;
}

export interface EligibilityInput {
  policy: PolicyConfig;
  recentScans: ScanHistoryEntry[]; // Ordered newest-first
  evidenceChainIntact: boolean;
  now?: Date; // For testability
}

export interface EligibilityVerdict {
  eligible: boolean;
  status: WarrantyStatus;
  reasons: string[];
  currentScore: number | null;
  consecutiveDaysAboveFloor: number;
  monitoringGapDetected: boolean;
  lastScanAge: { hours: number } | null;
  qualifyingProgress: number; // 0-100% of qualifying period complete
}

export interface ClaimEligibilityInput {
  policy: PolicyConfig;
  incidentDate: Date;
  scansAroundIncident: ScanHistoryEntry[]; // Scans from 7 days before to incident date
  evidenceChainIntact: boolean;
  now?: Date;
}

export interface ClaimVerdict {
  eligible: boolean;
  coverageAmount: number; // USD cents — 0 if ineligible
  reasons: string[];
  scoreAtIncident: number | null;
  wasActiveAtIncident: boolean;
}

// ─── Constants ───────────────────────────────────────────────────────────────

const QUALIFYING_PERIOD_DAYS = 30;

/** Max suspensions before warranty is permanently invalidated. */
const MAX_SUSPENSIONS = 3;

/** Coverage by tier (USD cents). */
export const TIER_COVERAGE: Record<WarrantyTier, number> = {
  SHIELD: 25_000_00,    // $25,000
  FORTRESS: 50_000_00,  // $50,000
  VAULT: 100_000_00,    // $100,000
};

/** Base monthly premium by tier (USD cents). */
export const TIER_PREMIUM: Record<WarrantyTier, number> = {
  SHIELD: 499_00,       // $499/mo
  FORTRESS: 999_00,     // $999/mo
  VAULT: 2_999_00,      // $2,999/mo
};

// ─── Eligibility Engine ──────────────────────────────────────────────────────

/**
 * Evaluate whether a warranty policy is currently eligible (ACTIVE) or should
 * be suspended/pending. Called after every scan and on-demand from the dashboard.
 *
 * Rules:
 * 1. Policy must not be CANCELLED or EXPIRED
 * 2. Evidence chain must be intact
 * 3. Current score must be ≥ scoreFloor
 * 4. No monitoring gap exceeding the allowed threshold
 * 5. If PENDING: must have ≥ QUALIFYING_PERIOD_DAYS above floor
 * 6. Max suspension count not exceeded
 */
export function evaluateEligibility(input: EligibilityInput): EligibilityVerdict {
  const { policy, recentScans, evidenceChainIntact } = input;
  const now = input.now ?? new Date();
  const reasons: string[] = [];

  // Terminal states — nothing changes
  if (policy.status === "CANCELLED") {
    return {
      eligible: false,
      status: "CANCELLED",
      reasons: ["Policy was cancelled"],
      currentScore: null,
      consecutiveDaysAboveFloor: 0,
      monitoringGapDetected: false,
      lastScanAge: null,
      qualifyingProgress: 0,
    };
  }
  if (policy.status === "EXPIRED") {
    return {
      eligible: false,
      status: "EXPIRED",
      reasons: ["Policy has expired"],
      currentScore: null,
      consecutiveDaysAboveFloor: 0,
      monitoringGapDetected: false,
      lastScanAge: null,
      qualifyingProgress: 0,
    };
  }

  // Check expiry
  if (policy.expiresAt && now > policy.expiresAt) {
    return {
      eligible: false,
      status: "EXPIRED",
      reasons: ["Contract period has ended"],
      currentScore: null,
      consecutiveDaysAboveFloor: policy.consecutiveDaysAboveFloor,
      monitoringGapDetected: false,
      lastScanAge: null,
      qualifyingProgress: 100,
    };
  }

  // Must have scans
  if (recentScans.length === 0) {
    reasons.push("No scan history available");
    return {
      eligible: false,
      status: "SUSPENDED",
      reasons,
      currentScore: null,
      consecutiveDaysAboveFloor: 0,
      monitoringGapDetected: true,
      lastScanAge: null,
      qualifyingProgress: 0,
    };
  }

  const latestScan = recentScans[0];
  const currentScore = latestScan.score;
  const lastScanAgeMs = now.getTime() - latestScan.scannedAt.getTime();
  const lastScanAgeHours = lastScanAgeMs / (1000 * 60 * 60);

  // Evidence chain integrity
  if (!evidenceChainIntact) {
    reasons.push("Evidence chain integrity check failed — tamper detected or chain broken");
  }

  // Score floor check
  const scoreBelowFloor = currentScore < policy.scoreFloor;
  if (scoreBelowFloor) {
    reasons.push(
      `Current score (${currentScore}) is below the warranty floor (${policy.scoreFloor})`
    );
  }

  // Monitoring gap check
  const monitoringGapDetected = lastScanAgeHours > policy.monitoringGapHours;
  if (monitoringGapDetected) {
    reasons.push(
      `Monitoring gap detected: last scan was ${Math.round(lastScanAgeHours)}h ago (max allowed: ${policy.monitoringGapHours}h)`
    );
  }

  // Consecutive gap detection within scan history
  const hasInternalGap = detectInternalGap(recentScans, policy.monitoringGapHours);
  if (hasInternalGap) {
    reasons.push("Monitoring gap detected within recent scan history");
  }

  // Suspension count check
  if (policy.suspensionCount >= MAX_SUSPENSIONS) {
    reasons.push(
      `Maximum suspension count (${MAX_SUSPENSIONS}) reached — warranty permanently invalidated`
    );
    return {
      eligible: false,
      status: "CANCELLED",
      reasons,
      currentScore,
      consecutiveDaysAboveFloor: 0,
      monitoringGapDetected,
      lastScanAge: { hours: Math.round(lastScanAgeHours) },
      qualifyingProgress: 0,
    };
  }

  // Calculate consecutive days above floor
  const consecutiveDays = calculateConsecutiveDaysAboveFloor(
    recentScans,
    policy.scoreFloor,
    now
  );

  // Qualifying period check (PENDING → ACTIVE transition)
  const qualifyingProgress = Math.min(
    100,
    Math.round((consecutiveDays / QUALIFYING_PERIOD_DAYS) * 100)
  );

  const shouldSuspend =
    scoreBelowFloor || monitoringGapDetected || hasInternalGap || !evidenceChainIntact;

  if (shouldSuspend) {
    return {
      eligible: false,
      status: "SUSPENDED",
      reasons,
      currentScore,
      consecutiveDaysAboveFloor: shouldSuspend ? 0 : consecutiveDays,
      monitoringGapDetected: monitoringGapDetected || hasInternalGap,
      lastScanAge: { hours: Math.round(lastScanAgeHours) },
      qualifyingProgress,
    };
  }

  // PENDING → check if qualifying period is complete
  if (policy.status === "PENDING") {
    if (consecutiveDays < QUALIFYING_PERIOD_DAYS) {
      return {
        eligible: false,
        status: "PENDING",
        reasons: [
          `Qualifying period in progress: ${consecutiveDays}/${QUALIFYING_PERIOD_DAYS} days completed`,
        ],
        currentScore,
        consecutiveDaysAboveFloor: consecutiveDays,
        monitoringGapDetected: false,
        lastScanAge: { hours: Math.round(lastScanAgeHours) },
        qualifyingProgress,
      };
    }
    // Qualified!
    reasons.push("Qualifying period complete — warranty activated");
  }

  return {
    eligible: true,
    status: "ACTIVE",
    reasons: reasons.length > 0 ? reasons : ["All eligibility conditions met"],
    currentScore,
    consecutiveDaysAboveFloor: consecutiveDays,
    monitoringGapDetected: false,
    lastScanAge: { hours: Math.round(lastScanAgeHours) },
    qualifyingProgress: 100,
  };
}

// ─── Claim Eligibility ───────────────────────────────────────────────────────

/**
 * Evaluate whether a specific claim is eligible for coverage.
 *
 * Rules:
 * 1. Policy must have been ACTIVE at the time of the incident
 * 2. Score must have been ≥ floor at incident time (not just now)
 * 3. Evidence chain must be intact (proves the score wasn't faked)
 * 4. Incident must fall within the policy's contract period
 */
export function evaluateClaimEligibility(input: ClaimEligibilityInput): ClaimVerdict {
  const { policy, incidentDate, scansAroundIncident, evidenceChainIntact } = input;
  const reasons: string[] = [];

  // Policy must have been active
  if (policy.status === "CANCELLED" || policy.status === "EXPIRED") {
    return {
      eligible: false,
      coverageAmount: 0,
      reasons: ["Policy is no longer active"],
      scoreAtIncident: null,
      wasActiveAtIncident: false,
    };
  }

  // Check the policy was activated BEFORE the incident
  if (!policy.activatedAt || incidentDate < policy.activatedAt) {
    reasons.push("Incident occurred before warranty was activated");
    return {
      eligible: false,
      coverageAmount: 0,
      reasons,
      scoreAtIncident: null,
      wasActiveAtIncident: false,
    };
  }

  // Check the incident is within contract period
  if (policy.expiresAt && incidentDate > policy.expiresAt) {
    reasons.push("Incident occurred after warranty expiration");
    return {
      eligible: false,
      coverageAmount: 0,
      reasons,
      scoreAtIncident: null,
      wasActiveAtIncident: false,
    };
  }

  // Evidence chain must be intact
  if (!evidenceChainIntact) {
    reasons.push("Evidence chain integrity compromised — cannot verify compliance history");
    return {
      eligible: false,
      coverageAmount: 0,
      reasons,
      scoreAtIncident: null,
      wasActiveAtIncident: false,
    };
  }

  // Find the score closest to (but before) the incident date
  const scansBeforeIncident = scansAroundIncident
    .filter((s) => s.scannedAt <= incidentDate)
    .sort((a, b) => b.scannedAt.getTime() - a.scannedAt.getTime());

  if (scansBeforeIncident.length === 0) {
    reasons.push("No scan data available at the time of the incident");
    return {
      eligible: false,
      coverageAmount: 0,
      reasons,
      scoreAtIncident: null,
      wasActiveAtIncident: false,
    };
  }

  const scoreAtIncident = scansBeforeIncident[0].score;

  // Score must have been above floor at incident time
  if (scoreAtIncident < policy.scoreFloor) {
    reasons.push(
      `Score at incident time (${scoreAtIncident}) was below warranty floor (${policy.scoreFloor})`
    );
    return {
      eligible: false,
      coverageAmount: 0,
      reasons,
      scoreAtIncident,
      wasActiveAtIncident: false,
    };
  }

  // Check for monitoring gaps near the incident (7 days before)
  const sevenDaysBefore = new Date(incidentDate.getTime() - 7 * 24 * 60 * 60 * 1000);
  const scansInWindow = scansAroundIncident.filter(
    (s) => s.scannedAt >= sevenDaysBefore && s.scannedAt <= incidentDate
  );

  if (scansInWindow.length < 2) {
    reasons.push("Insufficient monitoring activity in the 7 days before the incident");
    return {
      eligible: false,
      coverageAmount: 0,
      reasons,
      scoreAtIncident,
      wasActiveAtIncident: false,
    };
  }

  // All checks passed
  reasons.push("Claim is eligible for coverage");
  reasons.push(`Score at incident: ${scoreAtIncident} (floor: ${policy.scoreFloor})`);
  reasons.push(`Evidence chain verified intact`);
  reasons.push(`${scansInWindow.length} scans verified in the 7 days before incident`);

  return {
    eligible: true,
    coverageAmount: policy.coverageLimit,
    reasons,
    scoreAtIncident,
    wasActiveAtIncident: true,
  };
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

/**
 * Detect if there's a gap between consecutive scans exceeding the threshold.
 */
function detectInternalGap(scans: ScanHistoryEntry[], maxGapHours: number): boolean {
  for (let i = 0; i < scans.length - 1; i++) {
    const gapMs = scans[i].scannedAt.getTime() - scans[i + 1].scannedAt.getTime();
    const gapHours = gapMs / (1000 * 60 * 60);
    if (gapHours > maxGapHours) return true;
  }
  return false;
}

/**
 * Calculate how many consecutive days (from now backwards) the score has been ≥ floor.
 * Resets to 0 on any scan below floor.
 */
function calculateConsecutiveDaysAboveFloor(
  scans: ScanHistoryEntry[],
  floor: number,
  now: Date
): number {
  if (scans.length === 0) return 0;

  // Walk backwards from newest scan
  let oldestAboveFloor = now;
  for (const scan of scans) {
    if (scan.score < floor) break;
    oldestAboveFloor = scan.scannedAt;
  }

  const msAbove = now.getTime() - oldestAboveFloor.getTime();
  return Math.floor(msAbove / (1000 * 60 * 60 * 24));
}
