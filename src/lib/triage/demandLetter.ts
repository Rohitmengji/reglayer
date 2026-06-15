/**
 * ---------------------------------------------------------
 * RegLayer — Demand-Letter Triage & Exposure-Delta Engine (pure core)
 * ---------------------------------------------------------
 *
 * WHY: Serial-plaintiff ADA demand letters recycle the same ~6 violation types and
 *      demand a settlement before anyone checks whether the alleged barriers were even
 *      present — let alone already fixed. The defensible answer is evidentiary: for each
 *      alleged claim, was it actually present on the alleged date, when was it fixed, and
 *      is there a proof of it? RegLayer already holds that scan/violation/proof history;
 *      no tool turns it into an adversarial, per-claim REBUTTAL with a dollar delta.
 *
 * WHAT: Given a set of parsed claims + the site's scan/violation/proof history, this pure
 *       module assesses each claim (never-detected / not-present-on-date / remediated /
 *       present-open / unrecognized / no-history), computes the exposure the evidence
 *       REBUTS vs. what genuinely remains, and renders an escaped HTML rebuttal dossier.
 *
 * HOW: Intentionally PURE — no Prisma, no Next, no AI, no "server-only". The dollar model
 *      (per-rule settlement figures + industry/geo multipliers + settlement probability) is
 *      INJECTED by the caller, so this module never imports the server-only legalRiskEngine
 *      and stays exhaustively unit-testable. Letter parsing (AI) and history loading (DB)
 *      live in sibling server modules and feed this core plain data.
 * ---------------------------------------------------------
 */

// ─────────────── Inputs ───────────────

export interface DemandClaim {
  /** 1-based position of the claim in the letter. */
  index: number;
  /** The alleged barrier text, verbatim from the letter (untrusted — escaped on render). */
  rawText: string;
  /** Mapped axe rule id (e.g. "image-alt"), or null if it couldn't be recognized. */
  ruleId: string | null;
  /** Mapped WCAG criterion (e.g. "1.4.3"), if the letter cited one. */
  wcagCriteria: string | null;
  /** ISO date the letter alleges the barrier existed, if stated. */
  allegedDate: string | null;
}

export interface TriageScanInput {
  id: string;
  status: string;
  createdAt: Date;
  completedAt: Date | null;
}

export interface TriageViolationInput {
  scanId: string;
  ruleId: string;
  impact: string;
  status: string;
  verifiedAt: Date | null;
  statusUpdatedAt: Date | null;
}

export interface TriageProofInput {
  id: string;
  type: string;
  standard: string;
  issuedAt: Date;
  revokedAt: Date | null;
}

export interface TriageSite {
  id: string;
  url: string;
  name: string | null;
}

/**
 * The dollar model, INJECTED by the caller so the pure core never imports the
 * server-only legalRiskEngine. The route builds this from LITIGATION_WEIGHTS +
 * INDUSTRY_MULTIPLIERS + GEO_MULTIPLIERS for the site's industry/geo context.
 */
export interface ExposureModel {
  /** ruleId → average settlement ($) for that violation pattern. */
  settlements: Record<string, number>;
  industryMultiplier: number;
  geoMultiplier: number;
  /** Probability factor applied to a settlement figure (legalRiskEngine uses 0.15). */
  settlementProbability: number;
  industry: string;
  primaryGeo: string;
}

export interface TriageInput {
  site: TriageSite;
  generatedAt: Date;
  exposure: ExposureModel;
  claims: DemandClaim[];
  scans: TriageScanInput[];
  violations: TriageViolationInput[];
  proofs: TriageProofInput[];
}

// ─────────────── Outputs ───────────────

export type ClaimVerdict =
  | "no_scan_history" // the site has no completed scans → cannot assess from automated evidence
  | "rule_unrecognized" // the claim couldn't be mapped to a known automated rule → manual review
  | "never_detected" // the rule never appeared in any scan → strongest rebuttal
  | "not_present_on_date" // an alleged date was given and the barrier did not exist then → rebuttal
  | "remediated" // the barrier appeared but is verified-fixed / absent from the latest scan → mitigation
  | "present_open"; // the barrier is present in the latest scan and still open → genuine exposure

/** How a verdict counts toward the exposure delta. */
export type ExposureBucket = "rebutted" | "mitigated" | "exposed" | "unquantified";

export interface ClaimAssessment {
  claim: DemandClaim;
  verdict: ClaimVerdict;
  bucket: ExposureBucket;
  /** Human-readable, evidence-grounded rebuttal/finding line (escaped on render). */
  finding: string;
  firstSeenAt: Date | null;
  lastSeenAt: Date | null;
  fixedAt: Date | null;
  openInLatestScan: boolean;
  /** A non-revoked proof issued at/after the fix — corroborating remediation evidence. */
  anchoredProofId: string | null;
  /** Settlement-weighted exposure attributed to this claim ($), 0 if the rule is unweighted. */
  claimExposure: number;
}

export interface TriageSummary {
  totalClaims: number;
  rebuttedClaims: number;
  mitigatedClaims: number;
  exposedClaims: number;
  unquantifiedClaims: number;
  /** Total settlement-weighted exposure the letter implies across all quantifiable claims. */
  grossExposure: number;
  /** Exposure tied to claims that are genuinely still open. */
  netExposure: number;
  /** Exposure the recorded evidence rebuts or mitigates (gross − net). */
  rebuttedExposure: number;
  hasScanHistory: boolean;
  anchoredProofClaims: number;
}

export interface TriageReport {
  site: TriageSite;
  generatedAt: Date;
  context: { industry: string; primaryGeo: string };
  claims: ClaimAssessment[];
  summary: TriageSummary;
}

// ─────────────── Helpers ───────────────

export function escapeHtml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function round0(n: number): number {
  return Math.round(n);
}

function scanTime(s: TriageScanInput): number {
  return (s.completedAt ?? s.createdAt).getTime();
}

function fmtDate(d: Date | null): string {
  return d ? d.toISOString().slice(0, 10) : "—";
}

function money(n: number): string {
  return "$" + round0(n).toLocaleString("en-US");
}

const BUCKET_BY_VERDICT: Record<ClaimVerdict, ExposureBucket> = {
  no_scan_history: "unquantified",
  rule_unrecognized: "unquantified",
  never_detected: "rebutted",
  not_present_on_date: "rebutted",
  remediated: "mitigated",
  present_open: "exposed",
};

// ─────────────── Core assessment ───────────────

/**
 * Assess every claim against the site's recorded scan/violation/proof history and
 * compute the exposure delta. Pure: all data + the dollar model are passed in.
 */
export function assessClaims(input: TriageInput): TriageReport {
  const { scans, violations, proofs, exposure } = input;

  const completedScans = scans
    .filter((s) => s.status === "COMPLETED")
    .sort((a, b) => scanTime(a) - scanTime(b));
  const hasHistory = completedScans.length > 0;
  const latestScan = completedScans.length ? completedScans[completedScans.length - 1] : null;
  const scanTimeById = new Map(scans.map((s) => [s.id, scanTime(s)]));

  // Index violations by ruleId for O(1) per-claim lookup.
  const byRule = new Map<string, TriageViolationInput[]>();
  for (const v of violations) {
    const list = byRule.get(v.ruleId);
    if (list) list.push(v);
    else byRule.set(v.ruleId, [v]);
  }

  const claimExposureBase = (ruleId: string | null): number => {
    if (!ruleId) return 0;
    const settlement = exposure.settlements[ruleId];
    if (!settlement) return 0;
    return settlement * exposure.industryMultiplier * exposure.geoMultiplier * exposure.settlementProbability;
  };

  const assessments: ClaimAssessment[] = input.claims.map((claim) => {
    const base = {
      claim,
      firstSeenAt: null as Date | null,
      lastSeenAt: null as Date | null,
      fixedAt: null as Date | null,
      openInLatestScan: false,
      anchoredProofId: null as string | null,
      claimExposure: claimExposureBase(claim.ruleId),
    };

    if (!hasHistory) {
      return mk(base, "no_scan_history", "No completed scans on record for this site — the claim cannot be assessed from automated monitoring evidence.");
    }
    if (!claim.ruleId) {
      return mk(base, "rule_unrecognized", "The alleged barrier could not be mapped to a known automated accessibility rule; flagged for manual legal/engineering review.");
    }

    const vios = byRule.get(claim.ruleId) ?? [];
    if (vios.length === 0) {
      return mk(base, "never_detected", `RegLayer ran ${completedScans.length} scan(s) of this site and the rule "${claim.ruleId}" was never detected — there is no automated evidence this barrier existed on the monitored pages.`);
    }

    // When was the rule first/last seen (by the scan it belongs to)?
    const times = vios
      .map((v) => scanTimeById.get(v.scanId))
      .filter((t): t is number => t !== undefined)
      .sort((a, b) => a - b);
    const firstSeenAt = times.length ? new Date(times[0]) : null;
    const lastSeenAt = times.length ? new Date(times[times.length - 1]) : null;

    // Earliest re-scan-verified fix (the strongest remediation signal).
    const fixTimes = vios
      .filter((v) => v.verifiedAt !== null)
      .map((v) => v.verifiedAt!.getTime());
    const fixedAt = fixTimes.length ? new Date(Math.min(...fixTimes)) : null;

    // Is the rule present (and open) in the most recent completed scan?
    const openInLatestScan =
      latestScan !== null &&
      vios.some(
        (v) => v.scanId === latestScan.id && (v.status === "OPEN" || v.status === "IN_PROGRESS")
      );

    // A non-revoked proof issued at/after the fix corroborates remediation.
    const anchoredProofId = fixedAt
      ? proofs.find((p) => p.revokedAt === null && p.issuedAt.getTime() >= fixedAt.getTime())?.id ?? null
      : null;

    const ctx = { ...base, firstSeenAt, lastSeenAt, fixedAt, openInLatestScan, anchoredProofId };

    const alleged = claim.allegedDate ? Date.parse(claim.allegedDate) : NaN;
    const hasAlleged = !Number.isNaN(alleged);

    // (a) Alleged date predates the barrier's first appearance → it didn't exist then.
    if (hasAlleged && firstSeenAt && alleged < firstSeenAt.getTime()) {
      return mk(ctx, "not_present_on_date", `The letter alleges this barrier on ${fmtDate(new Date(alleged))}, but the rule "${claim.ruleId}" first appears in RegLayer's record on ${fmtDate(firstSeenAt)} — it was not present on the alleged date.`);
    }
    // (b) Fixed and verified before the alleged date → already remediated when alleged.
    if (hasAlleged && fixedAt && fixedAt.getTime() < alleged) {
      return mk(ctx, "not_present_on_date", `The rule "${claim.ruleId}" was verified fixed by re-scan on ${fmtDate(fixedAt)}, before the alleged date of ${fmtDate(new Date(alleged))}.`);
    }
    // (c) Still present and open in the latest scan → genuine, current exposure.
    if (openInLatestScan) {
      return mk(ctx, "present_open", `The rule "${claim.ruleId}" is present and unresolved in the most recent scan (${fmtDate(lastSeenAt)}); this claim reflects a current, open barrier.`);
    }
    // (d) Appeared historically but verified-fixed or absent from the latest scan → mitigated.
    if (fixedAt) {
      return mk(ctx, "remediated", `The rule "${claim.ruleId}" was detected and subsequently verified fixed by re-scan on ${fmtDate(fixedAt)}${anchoredProofId ? ", with a tamper-evident compliance proof issued afterward" : ""}.`);
    }
    return mk(ctx, "remediated", `The rule "${claim.ruleId}" was detected on ${fmtDate(firstSeenAt)} but is absent from the most recent scan (${fmtDate(lastSeenAt)}), indicating it has since been resolved.`);
  });

  // Roll up exposure by bucket.
  let gross = 0, net = 0;
  let rebutted = 0, mitigated = 0, exposed = 0, unquantified = 0, anchoredCount = 0;
  for (const a of assessments) {
    if (a.claimExposure > 0) gross += a.claimExposure;
    if (a.bucket === "exposed") { net += a.claimExposure; exposed++; }
    else if (a.bucket === "rebutted") rebutted++;
    else if (a.bucket === "mitigated") mitigated++;
    else unquantified++;
    if (a.anchoredProofId) anchoredCount++;
  }

  return {
    site: input.site,
    generatedAt: input.generatedAt,
    context: { industry: exposure.industry, primaryGeo: exposure.primaryGeo },
    claims: assessments,
    summary: {
      totalClaims: assessments.length,
      rebuttedClaims: rebutted,
      mitigatedClaims: mitigated,
      exposedClaims: exposed,
      unquantifiedClaims: unquantified,
      grossExposure: round0(gross),
      netExposure: round0(net),
      rebuttedExposure: round0(gross - net),
      hasScanHistory: hasHistory,
      anchoredProofClaims: anchoredCount,
    },
  };
}

function mk(
  base: Omit<ClaimAssessment, "verdict" | "bucket" | "finding">,
  verdict: ClaimVerdict,
  finding: string
): ClaimAssessment {
  return { ...base, verdict, bucket: BUCKET_BY_VERDICT[verdict], finding };
}

// ─────────────── HTML render (escaped) ───────────────

export const DEFAULT_TRIAGE_DISCLAIMER =
  "This Demand-Letter Triage is an automated analysis of RegLayer's recorded accessibility " +
  "monitoring data against the claims supplied. It is NOT legal advice and is NOT a substitute " +
  "for review by qualified counsel. Exposure figures are settlement-pattern estimates, not " +
  "predictions of any actual award or settlement. Automated scanning detects a subset of " +
  "possible barriers; absence of a detected violation is not proof of full conformance.";

const VERDICT_LABEL: Record<ClaimVerdict, string> = {
  no_scan_history: "No scan history",
  rule_unrecognized: "Manual review",
  never_detected: "Never detected",
  not_present_on_date: "Not present on alleged date",
  remediated: "Remediated",
  present_open: "Open — current exposure",
};

function bucketClass(bucket: ExposureBucket): string {
  return bucket === "rebutted" ? "supports" : bucket === "mitigated" ? "partial" : bucket === "exposed" ? "not-support" : "neutral";
}

export function renderTriageHTML(report: TriageReport, opts?: { disclaimer?: string }): string {
  const disclaimer = opts?.disclaimer ?? DEFAULT_TRIAGE_DISCLAIMER;
  const { site, summary, claims } = report;
  const siteLabel = site.name ? `${site.name} (${site.url})` : site.url;

  const cards: Array<{ label: string; value: string; cls?: string }> = [
    { label: "Alleged claims", value: String(summary.totalClaims) },
    { label: "Rebutted", value: String(summary.rebuttedClaims), cls: "supports" },
    { label: "Mitigated", value: String(summary.mitigatedClaims), cls: "partial" },
    { label: "Open exposure", value: String(summary.exposedClaims), cls: summary.exposedClaims ? "not-support" : "supports" },
    { label: "Gross exposure", value: money(summary.grossExposure) },
    { label: "Exposure rebutted", value: money(summary.rebuttedExposure), cls: "supports" },
    { label: "Net exposure remaining", value: money(summary.netExposure), cls: summary.netExposure ? "not-support" : "supports" },
  ];
  const cardsHtml = cards
    .map((c) => `<div class="summary-card"><div class="value ${c.cls ?? ""}">${escapeHtml(c.value)}</div><div class="label">${escapeHtml(c.label)}</div></div>`)
    .join("");

  const rows = claims
    .map(
      (a) => `<tr>
      <td>${a.claim.index}</td>
      <td>${escapeHtml(a.claim.rawText)}<div class="muted">${escapeHtml(a.claim.ruleId ?? "unmapped")}${a.claim.allegedDate ? " · alleged " + escapeHtml(a.claim.allegedDate) : ""}</div></td>
      <td><span class="badge ${bucketClass(a.bucket)}">${escapeHtml(VERDICT_LABEL[a.verdict])}</span></td>
      <td>${escapeHtml(a.finding)}${a.anchoredProofId ? `<div class="muted">Proof: ${escapeHtml(a.anchoredProofId)}</div>` : ""}</td>
      <td class="nowrap">${a.bucket === "exposed" ? money(a.claimExposure) : a.claimExposure ? `<span class="muted">${money(a.claimExposure)} rebutted</span>` : "—"}</td>
    </tr>`
    )
    .join("");

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Demand-Letter Triage — ${escapeHtml(siteLabel)}</title>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; max-width: 920px; margin: 0 auto; padding: 2rem; color: #1a1a1a; line-height: 1.6; }
    h1 { border-bottom: 3px solid #2563eb; padding-bottom: 0.5rem; margin-bottom: 0.25rem; }
    h2 { color: #1e40af; margin-top: 2.25rem; }
    .metadata { color: #6b7280; font-size: 0.9rem; }
    table { width: 100%; border-collapse: collapse; margin: 1rem 0; font-size: 0.85rem; }
    th, td { border: 1px solid #d1d5db; padding: 0.5rem 0.75rem; text-align: left; vertical-align: top; }
    th { background: #f3f4f6; font-weight: 600; }
    .summary-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(140px, 1fr)); gap: 1rem; margin: 1rem 0; }
    .summary-card { background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; padding: 1rem; text-align: center; }
    .summary-card .value { font-size: 1.3rem; font-weight: 700; }
    .summary-card .label { font-size: 0.78rem; color: #6b7280; }
    .supports { color: #16a34a; font-weight: 600; }
    .partial { color: #d97706; font-weight: 600; }
    .not-support { color: #dc2626; font-weight: 600; }
    .neutral { color: #475569; font-weight: 600; }
    .badge { display: inline-block; padding: 0.1rem 0.45rem; border-radius: 6px; font-size: 0.72rem; font-weight: 600; background: #f1f5f9; }
    .badge.supports { background: #dcfce7; color: #166534; }
    .badge.partial { background: #fef9c3; color: #854d0e; }
    .badge.not-support { background: #fee2e2; color: #991b1b; }
    .badge.neutral { background: #e2e8f0; color: #334155; }
    .muted { color: #6b7280; font-size: 0.8rem; }
    .nowrap { white-space: nowrap; }
    .disclaimer { background: #fef3c7; border: 1px solid #fcd34d; border-radius: 8px; padding: 1rem; margin-top: 2rem; font-size: 0.85rem; }
    footer { margin-top: 2rem; color: #9ca3af; font-size: 0.8rem; text-align: center; }
    @media print { body { padding: 1rem; } tr { page-break-inside: avoid; } }
  </style>
</head>
<body>
  <h1>Demand-Letter Triage &amp; Exposure-Delta Analysis</h1>
  <div class="metadata">
    <p><strong>Site:</strong> ${escapeHtml(siteLabel)}</p>
    <p><strong>Prepared:</strong> ${escapeHtml(fmtDate(report.generatedAt))} · <strong>Context:</strong> ${escapeHtml(report.context.industry)} / ${escapeHtml(report.context.primaryGeo)}</p>
    <p><strong>Scope:</strong> per-claim assessment of the supplied demand letter against RegLayer's recorded scan, remediation, and proof history for this site.</p>
  </div>

  <h2>Exposure Summary</h2>
  <div class="summary-grid">${cardsHtml}</div>
  <p class="muted">${summary.hasScanHistory ? `Of ${summary.totalClaims} alleged claim(s), ${summary.rebuttedClaims} are rebutted and ${summary.mitigatedClaims} mitigated by recorded evidence; ${summary.exposedClaims} reflect open barriers. ${summary.anchoredProofClaims} claim(s) are corroborated by a tamper-evident compliance proof.` : "No completed scan history is on record for this site, so claims cannot be assessed from automated evidence."}</p>

  <h2>Per-Claim Assessment</h2>
  <table>
    <thead><tr><th>#</th><th>Alleged claim</th><th>Verdict</th><th>Evidence-grounded finding</th><th>Exposure</th></tr></thead>
    <tbody>${rows || `<tr><td colspan="5" class="muted">No claims supplied.</td></tr>`}</tbody>
  </table>

  <div class="disclaimer"><strong>Legal Disclaimer:</strong> ${escapeHtml(disclaimer)}</div>
  <footer>Generated by RegLayer — Accessibility Compliance &amp; Evidence Platform</footer>
</body>
</html>`;
}
