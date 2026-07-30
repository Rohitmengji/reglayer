/**
 * RegLayer — violation summary formatting (pure)
 *
 * Deliberately free of `server-only` and Prisma so the wording can be tested directly.
 * The database read lives in `./violation-summary`; this file only decides how the
 * numbers are presented to the model — the part that has to be exactly right.
 *
 * WHY THIS EXISTS
 *
 * Retrieval hands the model the ten most *relevant* violations, and the prompt told it
 * "you have access to the user's ACTUAL scan data". It never said the list was a
 * sample. So when someone asked "how many colour-contrast violations does my site
 * have?", the model counted what it could see and answered with the size of the
 * retrieval window — and the UI stamped that answer "grounded in 10 sources", which
 * made a wrong number look verified.
 *
 * That is not hallucination. The model reported exactly what we gave it. The defect
 * was that we gave it a sample and described it as the whole.
 *
 * WHICH NUMBER
 *
 * These totals use the SAME definition as the dashboard (`/api/dashboard/stats`): the
 * sum of `Scan.totalViolations` over every completed scan in scope, plus a `Violation`
 * groupBy for per-rule counts. Chat agreeing with the dashboard matters more than chat
 * being clever — a user told two different numbers by the same product stops trusting
 * both. If that definition should change, it changes there and this follows.
 *
 * UNITS
 *
 * One `Violation` row is one rule finding within a scan; `affectedElements` holds the
 * individual nodes. `Scan.totalViolations` is row count — `violations.length` at every
 * write site in the codebase (severityEngine, score route, ais-engine, competitive).
 * Because the total spans every scan, a site scanned repeatedly contributes findings
 * once per scan. That is what the dashboard shows, so the prompt states the scope
 * explicitly rather than letting it pass as a current-state count.
 */

export interface ViolationSummary {
  /** Completed scans included in these totals. */
  scanCount: number;
  /** Distinct URLs scanned. */
  siteCount: number;
  /** Mean accessibility score across those scans, or null when unscored. */
  avgScore: number | null;
  /** Most recent scan, so the model can phrase "your latest scan of X". */
  latest: { url: string; scannedAt: Date; violations: number } | null;
  total: number;
  critical: number;
  serious: number;
  moderate: number;
  minor: number;
  /** Per-rule finding counts, largest first. */
  byRule: Array<{ ruleId: string; impact: string; count: number }>;
}

/**
 * Render the summary as prompt text.
 *
 * `retrievedCount` is stated explicitly so the model can see the gap between what it
 * was shown and what exists. Telling it "this is a sample" in the abstract is weaker
 * than letting it compare 10 against 173 itself.
 */
export function formatViolationSummaryForPrompt(
  summary: ViolationSummary,
  retrievedCount: number,
): string {
  if (summary.scanCount === 0) {
    // "No scans yet" and "no violations" are different answers and only one of them is
    // good news. Never let the second be inferred from the first.
    return [
      "This workspace has no completed scans yet, so there are no violation totals to report.",
      "Do NOT say the user has zero violations — say nothing has been scanned yet, and offer to help them run a scan.",
    ].join("\n");
  }

  const lines: string[] = [
    `Scope: ${summary.scanCount} completed scan${summary.scanCount === 1 ? "" : "s"} across ${summary.siteCount} site${summary.siteCount === 1 ? "" : "s"}.`,
  ];

  if (summary.latest) {
    lines.push(
      `Most recent scan: ${summary.latest.url} on ${summary.latest.scannedAt.toISOString().slice(0, 10)} (${summary.latest.violations} violations in that scan).`,
    );
  }
  if (summary.avgScore !== null) {
    lines.push(`Average accessibility score: ${summary.avgScore}`);
  }

  lines.push(
    "",
    "AUTHORITATIVE TOTALS — these match the figures on the user's dashboard.",
    "Each counts rule findings (not affected elements), summed across every completed scan in scope:",
    `- Total violations: ${summary.total}`,
    `- Critical: ${summary.critical}`,
    `- Serious: ${summary.serious}`,
    `- Moderate: ${summary.moderate}`,
    `- Minor: ${summary.minor}`,
  );

  if (summary.byRule.length > 0) {
    const named = summary.byRule.reduce((sum, r) => sum + r.count, 0);
    lines.push("", "Per-rule counts (largest first):");
    for (const rule of summary.byRule) {
      lines.push(`- ${rule.ruleId} (${rule.impact}): ${rule.count}`);
    }
    // The rule list is truncated. Without this line the model can sum the visible
    // rules and confidently report a total smaller than the real one — the same
    // failure as counting the context, one step further along.
    const remainder = summary.total - named;
    if (remainder > 0) {
      lines.push(`- ...and ${remainder} further findings across other rules`);
    }
  }

  lines.push(
    "",
    `COUNTING RULE: the violations in the context section are a relevance-ranked SAMPLE of ${retrievedCount}, not a complete list. Never state or imply a total by counting them. Every count you give must come from the totals above; if a figure you need is not listed here, say you do not have it rather than inferring one. When quoting a total, say it covers all completed scans, so it is not mistaken for the current state of a single page.`,
  );

  return lines.join("\n");
}
