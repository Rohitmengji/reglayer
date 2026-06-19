/**
 * ---------------------------------------------------------
 * RegLayer — Litigation Defense File (pure assembly core)
 * ---------------------------------------------------------
 *
 * WHY: ADA / EAA legal defense does not hinge on a single point-in-time report —
 *      it hinges on demonstrating an *ongoing good-faith remediation effort*: that
 *      the organization scanned continuously, worked its violations, verified fixes
 *      by re-scan, and recorded tamper-evident proofs over time. RegLayer already
 *      records every one of those facts but never assembles them into the one
 *      artifact a defense attorney actually needs.
 *
 * WHAT: A one-click, chronological, hash-verified dossier of remediation activity
 *       for a single site — scan time series (including failed attempts), per-
 *       violation status transitions, re-scan verifications, and the workspace's
 *       Anchored Evidence Chain proofs — plus the good-faith metrics that summarize
 *       the effort (monitoring span, % verified-fixed, mean time-to-remediate,
 *       score trend, chain integrity).
 *
 * HOW: This module is intentionally PURE — no "server-only", no Prisma, no Next.js.
 *      It takes already-loaded plain data (see loadDefenseFileData.ts) and emits the
 *      timeline, metrics, and an escaped, self-contained HTML document. Being pure
 *      makes the legally-load-bearing logic exhaustively unit-testable, exactly like
 *      the chain module it builds on. It deliberately reuses the chain's own
 *      `verifyProofIntegrity` so the dossier's integrity claims are computed by the
 *      same code an external auditor would run.
 *
 * Honesty constraints baked in (no over-claiming in a legal document):
 *  - hashValid / revoked / expired are reported SEPARATELY, never collapsed into a
 *    single "valid" — a revoked or expired proof is a lifecycle state, NOT tampering.
 *  - An empty chain is reported as "empty (no proofs issued)", never "verified".
 *  - No external timestamp anchoring is claimed (anchoring is a no-op stub today);
 *    only self-contained SHA-256 chain integrity is asserted.
 *  - Status-transition history is best-effort (the audit log has no prior-status and
 *    no FK), so the dossier is framed as a "record of activity", not an exhaustive
 *    audit trail.
 * ---------------------------------------------------------
 */

import {
  verifyProofIntegrity,
  type ChainLink,
  type ChainVerificationReport,
} from "@/lib/vault/chain";

// ─────────────── Types ───────────────

export type DefenseEventKind =
  | "scan_run"
  | "scan_failed"
  | "violation_status_changed"
  | "violation_verified"
  | "proof_issued"
  | "proof_revoked"
  | "manual_test_attested";

export interface TimelineEvent {
  at: Date;
  kind: DefenseEventKind;
  title: string;
  detail: string;
  scanId?: string;
  violationId?: string;
  ruleId?: string;
  proofId?: string;
  chainIndex?: number;
  fromStatus?: string | null;
  toStatus?: string | null;
  actorId?: string | null;
}

export interface DefenseScanInput {
  id: string;
  status: string;
  score: number | null;
  totalViolations: number;
  critical: number;
  serious: number;
  moderate: number;
  minor: number;
  compliance: number | null;
  pageTitle: string | null;
  url: string;
  createdAt: Date;
  completedAt: Date | null;
  startedAt: Date | null;
  duration: number | null;
  errorMessage: string | null;
}

export interface DefenseViolationInput {
  id: string;
  scanId: string;
  ruleId: string;
  impact: string;
  wcagCriteria: string | null;
  wcagLevel: string | null;
  status: string;
  statusNote: string | null;
  statusUpdatedAt: Date | null;
  statusUpdatedBy: string | null;
  verifiedAt: Date | null;
}

export interface DefenseAuditInput {
  id: string;
  action: string;
  actor: string | null;
  target: string | null;
  metadata: unknown;
  createdAt: Date;
}

export interface DefenseProofInput {
  id: string;
  type: string;
  title: string;
  standard: string;
  score: number | null;
  evidence: unknown;
  prevHash: string | null;
  chainIndex: number;
  /** Stored as a Date; hashing requires the ISO string form (see verifyProofsLocally). */
  issuedAt: Date;
  expiresAt: Date | null;
  revokedAt: Date | null;
  revokedReason: string | null;
  hash: string;
  siteId: string;
}

export interface DefenseSite {
  id: string;
  url: string;
  name: string | null;
  workspaceId: string | null;
}

export interface DefenseFileInput {
  site: DefenseSite;
  /** The "now" for the dossier — used for expiry checks so the output is deterministic. */
  generatedAt: Date;
  scans: DefenseScanInput[];
  violations: DefenseViolationInput[];
  auditLogs: DefenseAuditInput[];
  proofs: DefenseProofInput[];
  chainReport: ChainVerificationReport;
  /** Manual test attestations from AI-guided manual testing (v1) */
  manualTestAttestations?: Array<{
    criterion: string;
    verdict: string;
    attestedBy: string | null;
    attestedAt: string | null;
    auditRequestId: string;
  }>;
}

export type ExposureTrend = "improving" | "worsening" | "flat" | "insufficient-data";
export type ChainIntegrity = "verified" | "broken" | "empty";

export interface GoodFaithMetrics {
  totalScans: number;
  completedScans: number;
  failedScans: number;
  firstScanAt: Date | null;
  lastScanAt: Date | null;
  monitoringSpanDays: number;
  meanScanIntervalDays: number | null;
  distinctRulesEverOpen: number;
  violationsTotal: number;
  violationsResolved: number;
  violationsVerified: number;
  violationsOpen: number;
  percentVerifiedFixed: number;
  meanTimeToRemediateDays: number | null;
  medianTimeToRemediateDays: number | null;
  exposureTrend: ExposureTrend;
  firstScore: number | null;
  lastScore: number | null;
  scoreDelta: number | null;
  chainIntegrity: ChainIntegrity;
  proofCount: number;
  revokedProofCount: number;
  /** Manual test coverage (from AI-guided manual testing v1) */
  manualCriteriaAttested: number;
  manualCriteriaTotal: number;
  manualCoveragePercent: number;
}

export interface ProofVerification {
  proofId: string;
  type: string;
  title: string;
  standard: string;
  chainIndex: number;
  issuedAt: Date;
  hash: string;
  /** True iff the proof's stored hash recomputes from its own evidence + chain fields. */
  hashValid: boolean;
  revoked: boolean;
  revokedReason: string | null;
  /** Computed against generatedAt (NOT wall-clock) so the dossier is reproducible. */
  expired: boolean;
}

export interface AssembledDefenseFile {
  site: DefenseSite;
  generatedAt: Date;
  timeline: TimelineEvent[];
  metrics: GoodFaithMetrics;
  chainReport: ChainVerificationReport;
  proofVerifications: ProofVerification[];
}

// ─────────────── Constants ───────────────

const DAY_MS = 86_400_000;

/** Deterministic secondary sort weight so equal-timestamp events render reproducibly. */
const KIND_ORDER: Record<DefenseEventKind, number> = {
  scan_run: 0,
  scan_failed: 0,
  violation_status_changed: 1,
  violation_verified: 2,
  proof_issued: 3,
  proof_revoked: 4,
  manual_test_attested: 5,
};

// ─────────────── Small pure helpers ───────────────

/**
 * Escape a string for safe interpolation into HTML. Ported verbatim from the
 * statement generator (the repo's established safe pattern) so the dossier renderer
 * closes the same XSS gap the VPAT renderer still has.
 */
export function escapeHtml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function round1(n: number): number {
  return Math.round(n * 10) / 10;
}

/** UTC calendar-day key, used to de-duplicate synthesized vs. audit-derived events. */
function dayKey(date: Date): string {
  return date.toISOString().slice(0, 10);
}

/**
 * Is this (violationId, date) already covered by an audit-derived event? Checks the
 * day before / of / after, because the audit row's createdAt and the violation's own
 * verifiedAt/statusUpdatedAt come from two separate clocks and can straddle UTC
 * midnight — so an exact same-day check would let the same event be listed twice.
 */
function coveredNearDay(covered: Set<string>, violationId: string, date: Date): boolean {
  const t = date.getTime();
  return (
    covered.has(`${violationId}|${dayKey(new Date(t - DAY_MS))}`) ||
    covered.has(`${violationId}|${dayKey(date)}`) ||
    covered.has(`${violationId}|${dayKey(new Date(t + DAY_MS))}`)
  );
}

/** Safely read a string-ish field from untrusted JSON metadata. */
function readMetaString(metadata: unknown, key: string): string | null {
  if (metadata && typeof metadata === "object" && !Array.isArray(metadata)) {
    const v = (metadata as Record<string, unknown>)[key];
    if (typeof v === "string") return v;
    if (typeof v === "number" && Number.isFinite(v)) return String(v);
  }
  return null;
}

function stableId(e: TimelineEvent): string {
  return e.proofId ?? e.violationId ?? e.scanId ?? "";
}

// ─────────────── Timeline assembly ───────────────

/**
 * Merge the five chronological sources into one good-faith narrative:
 *  1. Scan runs (completed) and failed scan attempts — failures still evidence effort.
 *  2. Violation status transitions, from the audit log.
 *  3. Re-scan verifications, from the audit log.
 *  4. A current-state fallback for violations whose change predates audit logging
 *     (logging is best-effort), de-duplicated against (1-3) by (violationId, kind, day).
 *  5. Proof issuance / revocation, ordered by the canonical chainIndex (NOT issuedAt).
 */
export function buildTimeline(input: DefenseFileInput): TimelineEvent[] {
  const events: TimelineEvent[] = [];

  // (1) Scans. Only terminal states belong in a historical dossier; PENDING/RUNNING
  // are in-flight and carry no evidentiary value.
  for (const scan of input.scans) {
    if (scan.status === "COMPLETED") {
      events.push({
        at: scan.completedAt ?? scan.createdAt,
        kind: "scan_run",
        title: `Accessibility scan completed — ${scan.url}`,
        detail:
          `Score ${scan.score ?? "n/a"}/100 · ${scan.totalViolations} violation(s) ` +
          `(${scan.critical} critical, ${scan.serious} serious, ${scan.moderate} moderate, ${scan.minor} minor)`,
        scanId: scan.id,
      });
    } else if (scan.status === "FAILED") {
      events.push({
        at: scan.completedAt ?? scan.createdAt,
        kind: "scan_failed",
        title: `Scan attempt failed — ${scan.url}`,
        detail: scan.errorMessage
          ? `Attempt recorded; error: ${scan.errorMessage}`
          : "Attempt recorded (no error detail).",
        scanId: scan.id,
      });
    }
  }

  // Track which (violationId, day) buckets are already covered by audit-derived events
  // so the fallback in (4) never double-counts.
  const verifiedCovered = new Set<string>();
  const statusCovered = new Set<string>();

  // (2) + (3) Audit-derived transitions and verifications.
  for (const log of input.auditLogs) {
    if (!log.target) continue;
    if (log.action === "violation.status_updated") {
      const toStatus = readMetaString(log.metadata, "status");
      const note = readMetaString(log.metadata, "note");
      // The status route records the real prior status in metadata. Logs written
      // before that fix carry no value → readMetaString returns null (never fabricated).
      const fromStatus = readMetaString(log.metadata, "previousStatus");
      events.push({
        at: log.createdAt,
        kind: "violation_status_changed",
        title: `Violation status updated${fromStatus && toStatus ? ` ${fromStatus} → ${toStatus}` : toStatus ? ` → ${toStatus}` : ""}`,
        detail: note ? `Note: ${note}` : "Status change recorded.",
        violationId: log.target,
        fromStatus,
        toStatus,
        actorId: log.actor,
      });
      statusCovered.add(`${log.target}|${dayKey(log.createdAt)}`);
    } else if (log.action === "violation.verified") {
      const verifiedAt = readMetaString(log.metadata, "verifiedAt");
      events.push({
        at: log.createdAt,
        kind: "violation_verified",
        title: "Fix verified by re-scan",
        detail: verifiedAt
          ? `Re-scan confirmed the rule no longer fails (recorded ${verifiedAt}).`
          : "Re-scan confirmed the rule no longer fails.",
        violationId: log.target,
        actorId: log.actor,
      });
      verifiedCovered.add(`${log.target}|${dayKey(log.createdAt)}`);
    }
  }

  // (4) Current-state fallback. The audit log is best-effort; if a violation's
  // verifiedAt / statusUpdatedAt has no matching audit row, synthesize one event so
  // the timeline is not silently empty. verifiedAt takes precedence over a status
  // change so a verified fix is not double-listed.
  for (const v of input.violations) {
    if (v.verifiedAt) {
      const key = `${v.id}|${dayKey(v.verifiedAt)}`;
      if (!coveredNearDay(verifiedCovered, v.id, v.verifiedAt)) {
        events.push({
          at: v.verifiedAt,
          kind: "violation_verified",
          title: "Fix verified by re-scan",
          detail: `Rule "${v.ruleId}" confirmed fixed (recorded on the violation record).`,
          violationId: v.id,
          ruleId: v.ruleId,
          toStatus: "VERIFIED",
          actorId: v.statusUpdatedBy,
        });
        verifiedCovered.add(key);
      }
    } else if (v.statusUpdatedAt) {
      const key = `${v.id}|${dayKey(v.statusUpdatedAt)}`;
      if (!coveredNearDay(statusCovered, v.id, v.statusUpdatedAt)) {
        events.push({
          at: v.statusUpdatedAt,
          kind: "violation_status_changed",
          title: `Violation status updated → ${v.status}`,
          detail: v.statusNote
            ? `Rule "${v.ruleId}" · Note: ${v.statusNote}`
            : `Rule "${v.ruleId}" status recorded as ${v.status}.`,
          violationId: v.id,
          ruleId: v.ruleId,
          fromStatus: null,
          toStatus: v.status,
          actorId: v.statusUpdatedBy,
        });
        statusCovered.add(key);
      }
    }
  }

  // (5) Proofs — ordered by chainIndex (the cryptographic order), which can diverge
  // from issuedAt under concurrent-issuance retries.
  const proofsByChain = [...input.proofs].sort((a, b) => a.chainIndex - b.chainIndex);
  for (const proof of proofsByChain) {
    events.push({
      at: proof.issuedAt,
      kind: "proof_issued",
      title: `Compliance proof issued (#${proof.chainIndex}) — ${proof.type}`,
      detail: `${proof.title} · ${proof.standard} · hash ${proof.hash.slice(0, 12)}…`,
      proofId: proof.id,
      chainIndex: proof.chainIndex,
    });
    if (proof.revokedAt) {
      events.push({
        at: proof.revokedAt,
        kind: "proof_revoked",
        title: `Compliance proof revoked (#${proof.chainIndex})`,
        detail: proof.revokedReason
          ? `Reason: ${proof.revokedReason}`
          : "Proof revoked (no reason recorded).",
        proofId: proof.id,
        chainIndex: proof.chainIndex,
      });
    }
  }

  // (6) Manual test attestations — human-verified WCAG criteria verdicts.
  if (input.manualTestAttestations) {
    for (const att of input.manualTestAttestations) {
      if (att.attestedAt) {
        events.push({
          at: new Date(att.attestedAt),
          kind: "manual_test_attested" as DefenseEventKind,
          title: `Manual test: WCAG ${att.criterion} — ${att.verdict}`,
          detail: `Human-attested verdict for criterion ${att.criterion}. Audit ID: ${att.auditRequestId}`,
          actorId: att.attestedBy,
        });
      }
    }
  }

  // Chronological sort with a deterministic, content-based tie-break.
  events.sort((a, b) => {
    const dt = a.at.getTime() - b.at.getTime();
    if (dt !== 0) return dt;
    const ko = KIND_ORDER[a.kind] - KIND_ORDER[b.kind];
    if (ko !== 0) return ko;
    const ci = (a.chainIndex ?? -1) - (b.chainIndex ?? -1);
    if (ci !== 0) return ci;
    return stableId(a).localeCompare(stableId(b));
  });

  return events;
}

// ─────────────── Good-faith metrics ───────────────

function median(sorted: number[]): number {
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];
}

export function computeGoodFaithMetrics(input: DefenseFileInput): GoodFaithMetrics {
  const { scans, violations, proofs, chainReport } = input;

  const completed = scans.filter((s) => s.status === "COMPLETED");
  const failed = scans.filter((s) => s.status === "FAILED");

  // Monitoring span is measured over TERMINAL-state scans only (COMPLETED + FAILED) —
  // matching buildTimeline's rule that in-flight PENDING/RUNNING scans carry no
  // evidentiary value and must not inflate the span. FAILED attempts are retained as
  // evidence of ongoing effort.
  const terminalTimes = scans
    .filter((s) => s.status === "COMPLETED" || s.status === "FAILED")
    .map((s) => (s.completedAt ?? s.createdAt).getTime());
  const firstScanMs = terminalTimes.length ? Math.min(...terminalTimes) : null;
  const lastScanMs = terminalTimes.length ? Math.max(...terminalTimes) : null;
  const monitoringSpanDays =
    firstScanMs !== null && lastScanMs !== null ? round1((lastScanMs - firstScanMs) / DAY_MS) : 0;

  // Mean interval is the cadence between COMPLETED scans specifically — derived from
  // the completed-scan span (NOT the all-scan span), so a single late failed attempt
  // cannot distort a legally load-bearing cadence figure.
  const completedTimes = completed.map((s) => (s.completedAt ?? s.createdAt).getTime());
  const completedSpanDays =
    completedTimes.length >= 2
      ? (Math.max(...completedTimes) - Math.min(...completedTimes)) / DAY_MS
      : 0;
  const meanScanIntervalDays =
    completed.length >= 2 ? round1(completedSpanDays / (completed.length - 1)) : null;

  const distinctRulesEverOpen = new Set(violations.map((v) => v.ruleId)).size;
  const violationsResolved = violations.filter(
    (v) => v.status === "FIXED" || v.status === "VERIFIED"
  ).length;
  const violationsVerified = violations.filter((v) => v.status === "VERIFIED").length;
  const violationsOpen = violations.filter(
    (v) => v.status === "OPEN" || v.status === "IN_PROGRESS"
  ).length;
  const percentVerifiedFixed =
    violations.length === 0 ? 0 : round1((100 * violationsVerified) / violations.length);

  // Time-to-remediate: for each verified violation, days from its scan's createdAt to
  // verifiedAt. Negative samples (clock skew) are excluded rather than mis-reported.
  const scanCreatedById = new Map(scans.map((s) => [s.id, s.createdAt.getTime()]));
  const ttrSamples: number[] = [];
  for (const v of violations) {
    if (!v.verifiedAt) continue;
    const created = scanCreatedById.get(v.scanId);
    if (created === undefined) continue;
    const ttr = (v.verifiedAt.getTime() - created) / DAY_MS;
    if (ttr >= 0) ttrSamples.push(ttr);
  }
  const meanTimeToRemediateDays = ttrSamples.length
    ? round1(ttrSamples.reduce((a, b) => a + b, 0) / ttrSamples.length)
    : null;
  const medianTimeToRemediateDays = ttrSamples.length
    ? round1(median([...ttrSamples].sort((a, b) => a - b)))
    : null;

  // Score trend uses the accessibility score of completed scans as a stable,
  // always-present proxy (per-scan risk-score rows are sparse). Higher score over
  // time ⇒ improving ⇒ lower exposure.
  const completedByTime = [...completed].sort(
    (a, b) => (a.completedAt ?? a.createdAt).getTime() - (b.completedAt ?? b.createdAt).getTime()
  );
  // Only completed scans that actually carry a score count toward the trend — a
  // null-score boundary scan (legacy row, or a completion without a computed score)
  // must not collapse a genuine improving/worsening trend to "insufficient-data".
  const scored = completedByTime.filter((s) => s.score !== null);
  const firstScore = scored.length ? scored[0].score : null;
  const lastScore = scored.length ? scored[scored.length - 1].score : null;
  const scoreDelta =
    firstScore !== null && lastScore !== null ? round1(lastScore - firstScore) : null;
  let exposureTrend: ExposureTrend;
  if (scored.length < 2 || scoreDelta === null) {
    exposureTrend = "insufficient-data";
  } else if (scoreDelta > 2) {
    exposureTrend = "improving";
  } else if (scoreDelta < -2) {
    exposureTrend = "worsening";
  } else {
    exposureTrend = "flat";
  }

  const chainIntegrity: ChainIntegrity =
    chainReport.length === 0 ? "empty" : chainReport.valid ? "verified" : "broken";

  // Manual test coverage (from AI-guided manual testing)
  const manualAttestations = input.manualTestAttestations ?? [];
  const manualCriteriaAttested = manualAttestations.length;
  // Total WCAG A/AA criteria = 52 (canonical)
  const manualCriteriaTotal = 52;
  const manualCoveragePercent = manualCriteriaTotal > 0
    ? round1((100 * manualCriteriaAttested) / manualCriteriaTotal)
    : 0;

  return {
    totalScans: scans.length,
    completedScans: completed.length,
    failedScans: failed.length,
    firstScanAt: firstScanMs !== null ? new Date(firstScanMs) : null,
    lastScanAt: lastScanMs !== null ? new Date(lastScanMs) : null,
    monitoringSpanDays,
    meanScanIntervalDays,
    distinctRulesEverOpen,
    violationsTotal: violations.length,
    violationsResolved,
    violationsVerified,
    violationsOpen,
    percentVerifiedFixed,
    meanTimeToRemediateDays,
    medianTimeToRemediateDays,
    exposureTrend,
    firstScore,
    lastScore,
    scoreDelta,
    chainIntegrity,
    proofCount: proofs.length,
    revokedProofCount: proofs.filter((p) => p.revokedAt !== null).length,
    manualCriteriaAttested,
    manualCriteriaTotal,
    manualCoveragePercent,
  };
}

// ─────────────── Proof verification (reuses chain.ts) ───────────────

/**
 * Independently verify each proof's hash and report its lifecycle flags. Crucially:
 *  - issuedAt is converted Date → ISO string before hashing, because the chain hashes
 *    the ISO string form (issueProof/verifyProof both do this) — without the
 *    conversion every proof would falsely read as tampered.
 *  - `expired` is computed against `now` (the dossier's generatedAt) rather than
 *    wall-clock time, so the output is deterministic and testable.
 *  - hashValid, revoked, and expired are independent — a revoked or expired proof can
 *    still be cryptographically intact; revocation/expiry is NOT tampering.
 */
export function verifyProofsLocally(proofs: DefenseProofInput[], now: Date): ProofVerification[] {
  return [...proofs]
    .sort((a, b) => a.chainIndex - b.chainIndex)
    .map((proof) => {
      const link: ChainLink = {
        id: proof.id,
        evidence: proof.evidence,
        prevHash: proof.prevHash,
        chainIndex: proof.chainIndex,
        issuedAt: proof.issuedAt.toISOString(),
        hash: proof.hash,
      };
      const { hashValid } = verifyProofIntegrity(link);
      return {
        proofId: proof.id,
        type: proof.type,
        title: proof.title,
        standard: proof.standard,
        chainIndex: proof.chainIndex,
        issuedAt: proof.issuedAt,
        hash: proof.hash,
        hashValid,
        revoked: proof.revokedAt !== null,
        revokedReason: proof.revokedReason,
        expired: proof.expiresAt !== null && proof.expiresAt.getTime() < now.getTime(),
      };
    });
}

// ─────────────── Top-level assembly ───────────────

export function assembleDefenseFile(input: DefenseFileInput): AssembledDefenseFile {
  return {
    site: input.site,
    generatedAt: input.generatedAt,
    timeline: buildTimeline(input),
    metrics: computeGoodFaithMetrics(input),
    chainReport: input.chainReport,
    proofVerifications: verifyProofsLocally(input.proofs, input.generatedAt),
  };
}

// ─────────────── HTML render (escaped, self-contained) ───────────────

export const DEFAULT_DEFENSE_DISCLAIMER =
  "This Litigation Defense File is an auto-generated chronological record of accessibility " +
  "monitoring and remediation activity recorded by RegLayer. It documents good-faith effort " +
  "but is NOT legal advice and is NOT a guarantee of conformance with the ADA, EAA, WCAG, or " +
  "any other standard. Cryptographic integrity statements reflect RegLayer's self-contained " +
  "SHA-256 hash chain only; no third-party timestamp anchoring is claimed. Consult qualified " +
  "legal counsel before relying on this document in any proceeding.";

function fmtDate(d: Date | null): string {
  return d ? d.toISOString().replace("T", " ").slice(0, 19) + " UTC" : "—";
}

function integrityClass(v: ChainIntegrity): string {
  return v === "verified" ? "supports" : v === "broken" ? "not-support" : "neutral";
}

function trendClass(v: ExposureTrend): string {
  return v === "improving" ? "supports" : v === "worsening" ? "not-support" : "neutral";
}

function eventBadgeClass(kind: DefenseEventKind): string {
  switch (kind) {
    case "scan_failed":
    case "proof_revoked":
      return "not-support";
    case "violation_verified":
    case "proof_issued":
      return "supports";
    default:
      return "neutral";
  }
}

/**
 * Render the assembled dossier as a single, self-contained, downloadable HTML
 * document. EVERY interpolated untrusted value is escapeHtml-wrapped; only derived
 * enums/numbers are interpolated raw (used in class names), matching the repo's
 * established convention.
 */
export function renderDefenseFileHTML(
  file: AssembledDefenseFile,
  opts?: { disclaimer?: string }
): string {
  const disclaimer = opts?.disclaimer ?? DEFAULT_DEFENSE_DISCLAIMER;
  const { site, metrics, chainReport, proofVerifications, timeline } = file;
  const siteLabel = site.name ? `${site.name} (${site.url})` : site.url;

  const integrityCopy =
    metrics.chainIntegrity === "verified"
      ? `Verified — all ${chainReport.length} proof(s) recompute and link correctly.`
      : metrics.chainIntegrity === "broken"
        ? `Integrity FAILED — first problem at chain position ${chainReport.brokenAt ?? "?"}.`
        : "Empty — no compliance proofs have been issued for this workspace yet. This is not a compliance claim.";

  const metricCards: Array<{ label: string; value: string; cls?: string }> = [
    { label: "Monitoring span", value: `${metrics.monitoringSpanDays} days` },
    { label: "Total scans", value: `${metrics.completedScans} completed / ${metrics.failedScans} failed` },
    { label: "Violations verified-fixed", value: `${metrics.percentVerifiedFixed}%`, cls: "supports" },
    {
      label: "Mean time to remediate",
      value: metrics.meanTimeToRemediateDays === null ? "—" : `${metrics.meanTimeToRemediateDays} days`,
    },
    { label: "Accessibility score trend", value: metrics.exposureTrend, cls: trendClass(metrics.exposureTrend) },
    { label: "Chain integrity", value: metrics.chainIntegrity, cls: integrityClass(metrics.chainIntegrity) },
  ];

  const cardsHtml = metricCards
    .map(
      (c) =>
        `<div class="summary-card"><div class="value ${c.cls ?? ""}">${escapeHtml(c.value)}</div><div class="label">${escapeHtml(c.label)}</div></div>`
    )
    .join("");

  const timelineRows = timeline.length
    ? timeline
        .map(
          (e) => `<tr>
        <td class="nowrap">${escapeHtml(fmtDate(e.at))}</td>
        <td><span class="badge ${eventBadgeClass(e.kind)}">${escapeHtml(e.kind)}</span></td>
        <td>${escapeHtml(e.title)}<div class="muted">${escapeHtml(e.detail)}</div></td>
      </tr>`
        )
        .join("")
    : `<tr><td colspan="3" class="muted">No recorded monitoring or remediation activity for this site yet.</td></tr>`;

  const proofRows = proofVerifications.length
    ? proofVerifications
        .map(
          (p) => `<tr>
        <td>#${p.chainIndex}</td>
        <td>${escapeHtml(p.type)}<div class="muted">${escapeHtml(p.title)}</div></td>
        <td>${escapeHtml(p.standard)}</td>
        <td class="nowrap">${escapeHtml(fmtDate(p.issuedAt))}</td>
        <td class="mono">${escapeHtml(p.hash.slice(0, 16))}…</td>
        <td><span class="badge ${p.hashValid ? "supports" : "not-support"}">${p.hashValid ? "hash OK" : "HASH MISMATCH"}</span></td>
        <td>${p.revoked ? `<span class="badge not-support">revoked</span>` : ""}${p.expired ? `<span class="badge neutral">expired</span>` : ""}${!p.revoked && !p.expired ? `<span class="badge supports">active</span>` : ""}</td>
      </tr>`
        )
        .join("")
    : `<tr><td colspan="7" class="muted">No compliance proofs issued.</td></tr>`;

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Litigation Defense File — ${escapeHtml(siteLabel)}</title>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; max-width: 900px; margin: 0 auto; padding: 2rem; color: #1a1a1a; line-height: 1.6; }
    h1 { border-bottom: 3px solid #2563eb; padding-bottom: 0.5rem; margin-bottom: 0.25rem; }
    h2 { color: #1e40af; margin-top: 2.25rem; }
    .metadata { color: #6b7280; font-size: 0.9rem; }
    table { width: 100%; border-collapse: collapse; margin: 1rem 0; font-size: 0.85rem; }
    th, td { border: 1px solid #d1d5db; padding: 0.5rem 0.75rem; text-align: left; vertical-align: top; }
    th { background: #f3f4f6; font-weight: 600; }
    .summary-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(160px, 1fr)); gap: 1rem; margin: 1rem 0; }
    .summary-card { background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; padding: 1rem; text-align: center; }
    .summary-card .value { font-size: 1.4rem; font-weight: 700; }
    .summary-card .label { font-size: 0.8rem; color: #6b7280; }
    .supports { color: #16a34a; font-weight: 600; }
    .partial { color: #d97706; font-weight: 600; }
    .not-support { color: #dc2626; font-weight: 600; }
    .neutral { color: #475569; font-weight: 600; }
    .badge { display: inline-block; padding: 0.1rem 0.45rem; border-radius: 6px; font-size: 0.72rem; font-weight: 600; background: #f1f5f9; }
    .badge.supports { background: #dcfce7; color: #166534; }
    .badge.not-support { background: #fee2e2; color: #991b1b; }
    .badge.neutral { background: #e2e8f0; color: #334155; }
    .muted { color: #6b7280; font-size: 0.8rem; }
    .mono { font-family: ui-monospace, SFMono-Regular, Menlo, monospace; }
    .nowrap { white-space: nowrap; }
    .integrity { padding: 0.85rem 1rem; border-radius: 8px; margin: 0.5rem 0; }
    .integrity.verified { background: #dcfce7; border: 1px solid #86efac; }
    .integrity.broken { background: #fee2e2; border: 1px solid #fca5a5; }
    .integrity.empty { background: #f1f5f9; border: 1px solid #cbd5e1; }
    .disclaimer { background: #fef3c7; border: 1px solid #fcd34d; border-radius: 8px; padding: 1rem; margin-top: 2rem; font-size: 0.85rem; }
    footer { margin-top: 2rem; color: #9ca3af; font-size: 0.8rem; text-align: center; }
    @media print { body { padding: 1rem; } h2 { page-break-after: avoid; } tr { page-break-inside: avoid; } }
  </style>
</head>
<body>
  <h1>Litigation Defense File</h1>
  <div class="metadata">
    <p><strong>Site:</strong> ${escapeHtml(siteLabel)}</p>
    <p><strong>Generated:</strong> ${escapeHtml(fmtDate(file.generatedAt))}</p>
    <p><strong>Scope:</strong> chronological record of accessibility monitoring and remediation activity recorded by RegLayer for this site.</p>
  </div>

  <h2>Good-Faith Remediation Summary</h2>
  <div class="summary-grid">${cardsHtml}</div>
  <p class="muted">
    First scan ${escapeHtml(fmtDate(metrics.firstScanAt))} · latest scan ${escapeHtml(fmtDate(metrics.lastScanAt))} ·
    ${metrics.distinctRulesEverOpen} distinct rule(s) tracked · ${metrics.violationsVerified} of ${metrics.violationsTotal}
    violation(s) verified-fixed by re-scan${metrics.scoreDelta !== null ? ` · score change ${metrics.scoreDelta >= 0 ? "+" : ""}${metrics.scoreDelta}` : ""}.
  </p>

  <h2>Cryptographic Chain Integrity</h2>
  <div class="integrity ${metrics.chainIntegrity}">${escapeHtml(integrityCopy)}</div>

  <h2>Chronological Activity Timeline</h2>
  <table>
    <thead><tr><th>When (UTC)</th><th>Event</th><th>Detail</th></tr></thead>
    <tbody>${timelineRows}</tbody>
  </table>

  <h2>Compliance Proof Ledger</h2>
  <table>
    <thead><tr><th>#</th><th>Type</th><th>Standard</th><th>Issued (UTC)</th><th>Hash</th><th>Integrity</th><th>Status</th></tr></thead>
    <tbody>${proofRows}</tbody>
  </table>

  <div class="disclaimer"><strong>Legal Disclaimer:</strong> ${escapeHtml(disclaimer)}</div>
  <footer>Generated by RegLayer — Accessibility Compliance &amp; Evidence Platform</footer>
</body>
</html>`;
}
