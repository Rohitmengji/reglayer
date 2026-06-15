/**
 * RegLayer — Demand-Letter Triage tests (pure core)
 *
 * Exercises the per-claim verdict logic, the exposure-delta math, and HTML escaping.
 * No Prisma, no AI, no Next — the dollar model is injected.
 */

import { describe, it, expect } from "vitest";
import {
  assessClaims,
  renderTriageHTML,
  escapeHtml,
  DEFAULT_TRIAGE_DISCLAIMER,
  type TriageInput,
  type DemandClaim,
  type TriageScanInput,
  type TriageViolationInput,
  type TriageProofInput,
  type ExposureModel,
} from "@/lib/triage/demandLetter";

const d = (y: number, mo: number, day: number) => new Date(Date.UTC(y, mo, day, 12, 0, 0));

const MODEL: ExposureModel = {
  settlements: { "image-alt": 28000, "color-contrast": 22000, label: 25000 },
  industryMultiplier: 1.8, // ecommerce
  geoMultiplier: 1.6, // CA
  settlementProbability: 0.15,
  industry: "ecommerce",
  primaryGeo: "CA",
};
// image-alt exposure = 28000 * 1.8 * 1.6 * 0.15 = 12096
const IMG_ALT_EXPOSURE = 12096;
const CONTRAST_EXPOSURE = 9504; // 22000 * 1.8 * 1.6 * 0.15

function scan(over: Partial<TriageScanInput> = {}): TriageScanInput {
  return { id: "s1", status: "COMPLETED", createdAt: d(2026, 0, 1), completedAt: d(2026, 0, 1), ...over };
}
function vio(over: Partial<TriageViolationInput> = {}): TriageViolationInput {
  return { scanId: "s1", ruleId: "image-alt", impact: "critical", status: "OPEN", verifiedAt: null, statusUpdatedAt: null, ...over };
}
function claim(over: Partial<DemandClaim> = {}): DemandClaim {
  return { index: 1, rawText: "Images lack alternative text", ruleId: "image-alt", wcagCriteria: "1.1.1", allegedDate: null, ...over };
}
function input(over: Partial<TriageInput> = {}): TriageInput {
  return {
    site: { id: "site-1", url: "https://shop.example", name: "Shop" },
    generatedAt: d(2026, 5, 1),
    exposure: MODEL,
    claims: [],
    scans: [],
    violations: [],
    proofs: [],
    ...over,
  };
}

describe("escapeHtml", () => {
  it("escapes the five dangerous characters", () => {
    expect(escapeHtml(`<a href="x" class='y'>&`)).toBe("&lt;a href=&quot;x&quot; class=&#039;y&#039;&gt;&amp;");
  });
});

describe("assessClaims — verdicts", () => {
  it("no_scan_history when the site has no completed scans", () => {
    const r = assessClaims(input({ claims: [claim()] }));
    expect(r.claims[0].verdict).toBe("no_scan_history");
    expect(r.claims[0].bucket).toBe("unquantified");
  });

  it("rule_unrecognized when the claim has no mapped ruleId", () => {
    const r = assessClaims(input({ scans: [scan()], claims: [claim({ ruleId: null })] }));
    expect(r.claims[0].verdict).toBe("rule_unrecognized");
  });

  it("never_detected when the rule never appears in any scan (strong rebuttal)", () => {
    const r = assessClaims(
      input({ scans: [scan()], violations: [], claims: [claim({ ruleId: "color-contrast" })] })
    );
    expect(r.claims[0].verdict).toBe("never_detected");
    expect(r.claims[0].bucket).toBe("rebutted");
  });

  it("present_open when the rule is open in the most recent scan", () => {
    const scans = [scan({ id: "s1", completedAt: d(2026, 0, 1) }), scan({ id: "s2", completedAt: d(2026, 1, 1) })];
    const r = assessClaims(
      input({ scans, violations: [vio({ scanId: "s2", status: "OPEN" })], claims: [claim()] })
    );
    expect(r.claims[0].verdict).toBe("present_open");
    expect(r.claims[0].bucket).toBe("exposed");
    expect(r.claims[0].openInLatestScan).toBe(true);
  });

  it("remediated when the rule was verified-fixed and is absent from the latest scan", () => {
    const scans = [scan({ id: "s1", completedAt: d(2026, 0, 1) }), scan({ id: "s2", completedAt: d(2026, 1, 1) })];
    const r = assessClaims(
      input({
        scans,
        violations: [vio({ scanId: "s1", status: "VERIFIED", verifiedAt: d(2026, 0, 15) })],
        claims: [claim()],
      })
    );
    expect(r.claims[0].verdict).toBe("remediated");
    expect(r.claims[0].bucket).toBe("mitigated");
    expect(r.claims[0].fixedAt).toEqual(d(2026, 0, 15));
  });

  it("not_present_on_date when the alleged date predates the barrier's first appearance", () => {
    const scans = [scan({ id: "s1", completedAt: d(2026, 0, 10) })];
    const r = assessClaims(
      input({
        scans,
        violations: [vio({ scanId: "s1", status: "OPEN" })],
        claims: [claim({ allegedDate: "2025-11-01" })],
      })
    );
    expect(r.claims[0].verdict).toBe("not_present_on_date");
    expect(r.claims[0].bucket).toBe("rebutted");
  });

  it("not_present_on_date when verified-fixed before the alleged date", () => {
    const scans = [scan({ id: "s1", completedAt: d(2026, 0, 1) }), scan({ id: "s2", completedAt: d(2026, 2, 1) })];
    const r = assessClaims(
      input({
        scans,
        violations: [vio({ scanId: "s1", status: "VERIFIED", verifiedAt: d(2026, 0, 15) })],
        claims: [claim({ allegedDate: "2026-02-01" })],
      })
    );
    expect(r.claims[0].verdict).toBe("not_present_on_date");
  });

  it("attaches an anchored proof issued at/after the fix", () => {
    const scans = [scan({ id: "s1", completedAt: d(2026, 0, 1) }), scan({ id: "s2", completedAt: d(2026, 1, 1) })];
    const proofs: TriageProofInput[] = [
      { id: "p-1", type: "REMEDIATION_RECORD", standard: "WCAG 2.1 AA", issuedAt: d(2026, 0, 20), revokedAt: null },
    ];
    const r = assessClaims(
      input({
        scans,
        violations: [vio({ scanId: "s1", status: "VERIFIED", verifiedAt: d(2026, 0, 15) })],
        proofs,
        claims: [claim()],
      })
    );
    expect(r.claims[0].anchoredProofId).toBe("p-1");
  });

  it("does not attach a revoked proof", () => {
    const scans = [scan({ id: "s1", completedAt: d(2026, 0, 1) }), scan({ id: "s2", completedAt: d(2026, 1, 1) })];
    const proofs: TriageProofInput[] = [
      { id: "p-1", type: "REMEDIATION_RECORD", standard: "WCAG 2.1 AA", issuedAt: d(2026, 0, 20), revokedAt: d(2026, 0, 25) },
    ];
    const r = assessClaims(
      input({
        scans,
        violations: [vio({ scanId: "s1", status: "VERIFIED", verifiedAt: d(2026, 0, 15) })],
        proofs,
        claims: [claim()],
      })
    );
    expect(r.claims[0].anchoredProofId).toBeNull();
  });
});

describe("assessClaims — exposure delta", () => {
  it("splits gross exposure into net (open) and rebutted, and counts buckets", () => {
    const scans = [scan({ id: "s1", completedAt: d(2026, 0, 1) }), scan({ id: "s2", completedAt: d(2026, 1, 1) })];
    const claims: DemandClaim[] = [
      claim({ index: 1, ruleId: "image-alt" }), // present_open → exposed
      claim({ index: 2, ruleId: "color-contrast", rawText: "Low contrast" }), // never_detected → rebutted
      claim({ index: 3, ruleId: "keyboard", rawText: "Keyboard trap" }), // never_detected, unweighted → rebutted, $0
    ];
    const r = assessClaims(
      input({ scans, violations: [vio({ scanId: "s2", status: "OPEN" })], claims })
    );
    expect(r.summary.exposedClaims).toBe(1);
    expect(r.summary.rebuttedClaims).toBe(2);
    expect(r.summary.grossExposure).toBe(IMG_ALT_EXPOSURE + CONTRAST_EXPOSURE);
    expect(r.summary.netExposure).toBe(IMG_ALT_EXPOSURE);
    expect(r.summary.rebuttedExposure).toBe(CONTRAST_EXPOSURE);
  });

  it("an unweighted rule contributes 0 exposure but is still assessed", () => {
    const r = assessClaims(
      input({ scans: [scan()], claims: [claim({ ruleId: "keyboard", rawText: "kbd" })] })
    );
    expect(r.claims[0].claimExposure).toBe(0);
    expect(r.claims[0].verdict).toBe("never_detected");
  });
});

describe("renderTriageHTML", () => {
  it("escapes an XSS payload in the claim text", () => {
    const r = assessClaims(
      input({ scans: [scan()], claims: [claim({ rawText: `<script>alert(1)</script>` })] })
    );
    const html = renderTriageHTML(r);
    expect(html).not.toContain("<script>alert(1)</script>");
    expect(html).toContain("&lt;script&gt;");
  });

  it("is a self-contained document carrying the disclaimer", () => {
    const html = renderTriageHTML(assessClaims(input({ scans: [scan()], claims: [claim()] })));
    expect(html.startsWith("<!DOCTYPE html>")).toBe(true);
    expect(html).toContain(escapeHtml(DEFAULT_TRIAGE_DISCLAIMER));
  });

  it("renders a no-history report without throwing", () => {
    const html = renderTriageHTML(assessClaims(input({ claims: [claim()] })));
    expect(html).toContain("No completed scan history");
  });
});
