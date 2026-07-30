/**
 * The bug this pins down: asked "how many colour-contrast violations does my site
 * have?", the assistant answered with the number of violations in its retrieval window
 * (10) rather than the number in the database (173) — and the UI labelled that answer
 * "grounded in 10 sources", so a wrong figure carried a verification badge.
 *
 * The model was not inventing anything. It was counting exactly what we handed it,
 * under a prompt that called the sample "the user's ACTUAL scan data". These tests
 * cover the block that now supplies the real totals, and the properties that make it
 * safe to quote: the unit is stated, the scope is stated, the sample size is stated,
 * the truncated tail is accounted for, and "no scans" never reads as "no violations".
 */
import { describe, it, expect } from "vitest";
import {
  formatViolationSummaryForPrompt,
  type ViolationSummary,
} from "@/lib/ai/chat/violation-summary-format";

const summary = (over: Partial<ViolationSummary> = {}): ViolationSummary => ({
  scanCount: 12,
  siteCount: 3,
  avgScore: 72,
  latest: {
    url: "https://example.com",
    scannedAt: new Date("2026-07-30T10:00:00Z"),
    violations: 41,
  },
  total: 173,
  critical: 4,
  serious: 61,
  moderate: 90,
  minor: 18,
  byRule: [
    { ruleId: "color-contrast", impact: "serious", count: 58 },
    { ruleId: "region", impact: "moderate", count: 21 },
  ],
  ...over,
});

describe("formatViolationSummaryForPrompt", () => {
  it("states the real total, not the size of the retrieval window", () => {
    const text = formatViolationSummaryForPrompt(summary(), 10);
    expect(text).toContain("Total violations: 173");
  });

  it("breaks the total down by severity", () => {
    const text = formatViolationSummaryForPrompt(summary(), 10);
    expect(text).toContain("Critical: 4");
    expect(text).toContain("Serious: 61");
    expect(text).toContain("Moderate: 90");
    expect(text).toContain("Minor: 18");
  });

  it("gives the per-rule count that the failing question actually asked for", () => {
    const text = formatViolationSummaryForPrompt(summary(), 10);
    expect(text).toContain("color-contrast (serious): 58");
  });

  it("names the unit, because a count without one is how two correct numbers disagree", () => {
    const text = formatViolationSummaryForPrompt(summary(), 10);
    expect(text).toMatch(/rule findings \(not affected elements\)/i);
  });

  it("states the scope, so a cross-scan total is not read as one page's current state", () => {
    const text = formatViolationSummaryForPrompt(summary(), 10);
    expect(text).toContain("12 completed scans across 3 sites");
    expect(text).toMatch(/summed across every completed scan/i);
  });

  it("tells the model the context is a sample and how big that sample is", () => {
    const text = formatViolationSummaryForPrompt(summary(), 10);
    expect(text).toMatch(/SAMPLE of 10/);
    expect(text).toMatch(/[Nn]ever state or imply a total by counting them/);
  });

  it("accounts for findings beyond the listed rules instead of dropping them", () => {
    // 58 + 21 = 79 named, of 173 total. The remaining 94 must not vanish, or the model
    // can sum the visible rules and land on a smaller wrong number than before.
    const text = formatViolationSummaryForPrompt(summary(), 10);
    expect(text).toContain("and 94 further findings across other rules");
  });

  it("omits the remainder line when the listed rules already account for everything", () => {
    const text = formatViolationSummaryForPrompt(summary({ total: 79 }), 10);
    expect(text).not.toMatch(/further findings/);
  });

  it("never lets 'no scans yet' be reported as 'no violations'", () => {
    const text = formatViolationSummaryForPrompt(
      summary({ scanCount: 0, siteCount: 0, total: 0, critical: 0, serious: 0, moderate: 0, minor: 0, byRule: [], latest: null, avgScore: null }),
      0,
    );
    expect(text).toMatch(/no completed scans yet/i);
    expect(text).toMatch(/Do NOT say the user has zero violations/);
    expect(text).not.toContain("Total violations: 0");
  });

  it("reports a genuinely clean workspace as zero, which is different from having no scans", () => {
    const text = formatViolationSummaryForPrompt(
      summary({ total: 0, critical: 0, serious: 0, moderate: 0, minor: 0, byRule: [] }),
      0,
    );
    expect(text).toContain("Total violations: 0");
    expect(text).not.toMatch(/no completed scans/i);
  });

  it("singularises correctly for a single scan of a single site", () => {
    const text = formatViolationSummaryForPrompt(summary({ scanCount: 1, siteCount: 1 }), 5);
    expect(text).toContain("1 completed scan across 1 site.");
  });

  it("includes the latest scan URL and date so the model can qualify which scan it means", () => {
    const text = formatViolationSummaryForPrompt(summary(), 10);
    expect(text).toContain("https://example.com");
    expect(text).toContain("2026-07-30");
  });

  it("omits the score line when there is no score rather than printing null", () => {
    const text = formatViolationSummaryForPrompt(summary({ avgScore: null }), 10);
    expect(text).not.toMatch(/score: *null/i);
    expect(text).not.toMatch(/Average accessibility score/);
  });
});
