/**
 * RegLayer — Incremental Audit Intelligence
 *
 * WHAT ALREADY EXISTS (and is deliberately not rebuilt here):
 *   - Route discovery and crawling      → `scanner/crawler/siteCrawler`
 *   - Violation detection                → `scanner/accessibility`
 *   - Clustering, effort, fix strategy   → `remediation/smartPipeline`
 *   - Plain-English explanation          → `ai/explainers/violationExplainer`
 *   - Agent planning                     → `ai/agents/orchestrator`
 *
 * WHAT WAS MISSING: those capabilities are each wired behind a SEPARATE user-triggered
 * route. Nothing chains them, and nothing reasons across time. An audit is therefore a
 * sequence of things a human remembers to click, not a process that runs itself.
 *
 * This module supplies the longitudinal decisions an autonomous agent needs:
 *   - which pages are worth re-scanning, under a budget
 *   - how far through remediation the site actually is
 *   - which fixes REGRESSED, which is the signal that makes a recurring audit
 *     trustworthy rather than merely repeated
 *
 * Pure and deterministic: a re-scan decision that cannot be reproduced cannot be
 * explained to a customer asking why their page was skipped.
 */

export type Impact = "critical" | "serious" | "moderate" | "minor";

const IMPACT_WEIGHT: Record<Impact, number> = {
  critical: 4,
  serious: 3,
  moderate: 2,
  minor: 1,
};

export interface PageState {
  url: string;
  /**
   * Fingerprint of the rendered page at last scan.
   *
   * WHY CONTENT-BASED AND NOT `lastModified`: server-rendered apps and CDNs report
   * modification times that have no relationship to what a user sees, and SPAs often
   * report none at all. A hash of the rendered DOM is the only signal that tracks the
   * thing being audited.
   */
  contentHash: string | null;
  lastScannedAt: Date | null;
  /** Worst impact observed at last scan. Null when clean or never scanned. */
  worstImpact: Impact | null;
  openViolations: number;
  /** Current fingerprint, if the crawler has cheaply re-fetched the page. */
  currentHash?: string | null;
}

export type RescanReason =
  | "never-scanned"
  | "content-changed"
  | "severity-stale"
  | "stale";

export interface RescanDecision {
  url: string;
  reason: RescanReason;
  /** Higher runs first. Exposed so an operator can see the ordering, not just the result. */
  priority: number;
}

export interface RescanPolicy {
  /** A page untouched for longer than this is re-scanned regardless of content. */
  maxAgeDays: number;
  /** Pages carrying critical/serious findings are re-checked sooner. */
  severeMaxAgeDays: number;
  /** Budget. Crawling costs money and wall-clock time, so the agent must choose. */
  maxPages: number;
}

export const DEFAULT_RESCAN_POLICY: RescanPolicy = {
  maxAgeDays: 30,
  severeMaxAgeDays: 7,
  maxPages: 100,
};

const DAY_MS = 86_400_000;

function ageDays(since: Date | null, now: Date): number {
  if (!since) return Infinity;
  return (now.getTime() - since.getTime()) / DAY_MS;
}

/**
 * Choose which pages to re-scan.
 *
 * ORDERING RATIONALE. Never-scanned pages come first because unknown risk outranks
 * known risk — a page nobody has ever looked at could contain anything. Changed content
 * comes next, since a change is the only direct evidence that a previous result is
 * stale. Severity-driven staleness follows, because a page with critical findings that
 * has not been rechecked is where a regression does the most damage.
 */
export function selectPagesForRescan(
  pages: readonly PageState[],
  policy: RescanPolicy = DEFAULT_RESCAN_POLICY,
  now: Date = new Date(),
): RescanDecision[] {
  const decisions: RescanDecision[] = [];

  for (const page of pages) {
    const age = ageDays(page.lastScannedAt, now);
    const severe = page.worstImpact === "critical" || page.worstImpact === "serious";

    if (!page.lastScannedAt || !page.contentHash) {
      decisions.push({ url: page.url, reason: "never-scanned", priority: 1000 });
      continue;
    }

    // A hash we have not refreshed tells us nothing; absence of evidence must not be
    // read as evidence the page is unchanged.
    if (page.currentHash != null && page.currentHash !== page.contentHash) {
      decisions.push({
        url: page.url,
        reason: "content-changed",
        // Weight by what the page previously carried: a changed page that already had
        // critical findings is the likeliest place for a serious regression.
        priority: 800 + (page.worstImpact ? IMPACT_WEIGHT[page.worstImpact] * 10 : 0),
      });
      continue;
    }

    if (severe && age >= policy.severeMaxAgeDays) {
      decisions.push({ url: page.url, reason: "severity-stale", priority: 600 + age });
      continue;
    }

    if (age >= policy.maxAgeDays) {
      decisions.push({ url: page.url, reason: "stale", priority: 400 + age });
    }
  }

  return decisions
    .sort((a, b) => b.priority - a.priority || a.url.localeCompare(b.url))
    .slice(0, policy.maxPages);
}

// ── Progress ─────────────────────────────────────────────────────────────────

export interface AuditProgress {
  totalPages: number;
  pagesScanned: number;
  /** 0..1 — share of discovered pages with a scan result. */
  coverage: number;
  openViolations: number;
  pagesClean: number;
  /** Worst impact still open anywhere on the site. */
  worstOpenImpact: Impact | null;
}

/**
 * Summarise where an audit actually stands.
 *
 * Coverage is reported separately from violation counts on purpose: "zero violations"
 * means something very different at 10% coverage than at 100%, and collapsing them into
 * one number is how an audit becomes misleading.
 */
export function computeAuditProgress(pages: readonly PageState[]): AuditProgress {
  const scanned = pages.filter((p) => p.lastScannedAt !== null);
  const openViolations = pages.reduce((sum, p) => sum + p.openViolations, 0);

  let worst: Impact | null = null;
  for (const page of pages) {
    if (page.openViolations === 0 || !page.worstImpact) continue;
    if (!worst || IMPACT_WEIGHT[page.worstImpact] > IMPACT_WEIGHT[worst]) {
      worst = page.worstImpact;
    }
  }

  return {
    totalPages: pages.length,
    pagesScanned: scanned.length,
    coverage: pages.length === 0 ? 0 : scanned.length / pages.length,
    openViolations,
    pagesClean: scanned.filter((p) => p.openViolations === 0).length,
    worstOpenImpact: worst,
  };
}

// ── Regression detection ─────────────────────────────────────────────────────

export interface RuleSnapshot {
  url: string;
  ruleId: string;
  impact: Impact;
}

export interface Regression {
  url: string;
  ruleId: string;
  impact: Impact;
}

/**
 * Find violations that had been resolved and have returned.
 *
 * WHY THIS IS THE MOST IMPORTANT LONGITUDINAL SIGNAL: a newly-appearing violation is
 * ordinary and expected as a site evolves. A violation that was FIXED and came back
 * means the fix did not hold — a component was reverted, a regression escaped review,
 * or the remediation was applied to a page rather than to its source. Reporting it as
 * merely "a new violation" hides the fact that effort was already spent here.
 */
export function detectRegressions(
  /** Findings from the scan before last — where the issue was present. */
  original: readonly RuleSnapshot[],
  /** Findings from the previous scan — where it was absent, i.e. fixed. */
  resolved: readonly RuleSnapshot[],
  /** Findings from the current scan. */
  current: readonly RuleSnapshot[],
): Regression[] {
  const key = (s: RuleSnapshot) => `${s.url}::${s.ruleId}`;

  const wasPresent = new Set(original.map(key));
  const stillPresentLastTime = new Set(resolved.map(key));

  return current
    .filter((finding) => {
      const id = key(finding);
      // Present originally, absent at the previous scan, present again now.
      return wasPresent.has(id) && !stillPresentLastTime.has(id);
    })
    .map(({ url, ruleId, impact }) => ({ url, ruleId, impact }));
}
