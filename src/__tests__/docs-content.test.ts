import { existsSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { DOC_GUIDES, DOC_PLAN_ROWS, CI_SCAN_EXAMPLE } from "@/lib/docs/content";
import { PLAN_LIMITS } from "@/lib/credits/plan-limits";

describe("maintained public docs", () => {
  it("keeps every original guide URL with unique sections and review metadata", () => {
    expect(DOC_GUIDES.map(guide => guide.slug).sort()).toEqual(["getting-started", "scanning", "monitoring", "reports", "team-management", "integrations"].sort());
    for (const guide of DOC_GUIDES) {
      expect(guide.quickStart.length).toBeGreaterThan(0);
      expect(guide.reviewedAt).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(new Set(guide.sections.map(section => section.id)).size).toBe(guide.sections.length);
      for (const section of guide.sections) for (const link of section.links ?? []) {
        const pathname = link.href.split(/[?#]/)[0];
        const isGuide = DOC_GUIDES.some(doc => pathname === `/docs/${doc.slug}`);
        expect(isGuide || existsSync(path.join(process.cwd(), "src/app", pathname, "page.tsx")), link.href).toBe(true);
      }
    }
  });
  it("derives every documented quota from the shared plan configuration", () => {
    for (const row of DOC_PLAN_ROWS) {
      const limits = PLAN_LIMITS[row.plan as keyof typeof PLAN_LIMITS];
      expect([row.scans, row.pages, row.members, row.auditDays]).toEqual([limits.scansPerMonth, limits.pagesPerScan, limits.teamMembers, limits.auditLogDays]);
    }
  });
  it("uses the API-key scan endpoint and requires a persisted result for CI success", () => {
    expect(CI_SCAN_EXAMPLE).toContain("set -euo pipefail");
    expect(CI_SCAN_EXAMPLE).toContain("/api/ci/scan");
    expect(CI_SCAN_EXAMPLE).toContain(".passed == true and .scanId != null");
    expect(CI_SCAN_EXAMPLE).not.toContain("app.reglayer.dev");
  });
});