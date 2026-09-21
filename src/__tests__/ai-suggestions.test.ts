/**
 * Tests for the Proactive AI Suggestions service.
 *
 * Verifies the workspace-state → suggestion-card logic: onboarding nudges,
 * risk alerts, priority ordering, and the max-5 cap.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("server-only", () => ({}));

const scanFindMany = vi.fn();
const scanFindFirst = vi.fn();
const violationCount = vi.fn();
const siteCount = vi.fn();

vi.mock("@/lib/database/prisma", () => ({
  prisma: {
    scan: { findMany: (...a: unknown[]) => scanFindMany(...a), findFirst: (...a: unknown[]) => scanFindFirst(...a) },
    violation: { count: (...a: unknown[]) => violationCount(...a) },
    site: { count: (...a: unknown[]) => siteCount(...a) },
  },
}));

import { generateSuggestions } from "@/lib/ai/suggestions/service";

/** Configure a clean "brand new workspace" baseline (no data). */
function emptyWorkspace() {
  scanFindMany.mockResolvedValue([]);
  scanFindFirst.mockResolvedValue(null);
  violationCount.mockResolvedValue(0);
  siteCount.mockResolvedValue(0);
}

describe("generateSuggestions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    emptyWorkspace();
  });

  it("nudges a brand-new workspace to run its first scan", async () => {
    const suggestions = await generateSuggestions("ws_1");
    expect(suggestions.some((s) => s.id === "onboarding-first-scan")).toBe(true);
  });

  it("recommends re-scanning, not a first scan, for an inactive workspace", async () => {
    scanFindFirst.mockResolvedValue({ id: "scan-old", createdAt: new Date(Date.now() - 30 * 864e5) });
    siteCount.mockResolvedValue(1);
    const suggestions = await generateSuggestions("ws_1");
    expect(suggestions.some((suggestion) => suggestion.id === "onboarding-first-scan")).toBe(false);
    expect(suggestions.some((suggestion) => suggestion.id === "stale-scans")).toBe(true);
  });

  it("raises a critical suggestion when critical violations are open", async () => {
    scanFindFirst.mockResolvedValue({ id: "scan-current", createdAt: new Date() });
    // recent scans exist so the onboarding nudge is skipped
    scanFindMany.mockResolvedValue([{ score: 80, totalViolations: 3 }]);
    // getViolationTrend: first count() = critical open, second = easy fixes
    violationCount.mockResolvedValueOnce(4).mockResolvedValueOnce(0);

    const suggestions = await generateSuggestions("ws_1");
    const critical = suggestions.find((s) => s.id === "critical-violations");
    expect(critical).toBeDefined();
    expect(critical?.priority).toBe("critical");
    expect(critical?.dismissible).toBe(false);
    expect(critical?.actionHref).toBe("/violations?scanId=scan-current&impact=critical&status=OPEN");
    expect(violationCount).toHaveBeenCalledWith({ where: { scan: { workspaceId: "ws_1" }, scanId: "scan-current", impact: "critical", status: "OPEN" } });
  });

  it("orders suggestions by priority (critical first)", async () => {
    scanFindFirst.mockResolvedValue({ id: "scan-current", createdAt: new Date() });
    scanFindMany.mockResolvedValue([{ score: 80, totalViolations: 3 }]);
    violationCount.mockResolvedValueOnce(4).mockResolvedValueOnce(0);

    const suggestions = await generateSuggestions("ws_1");
    const priorityRank = { critical: 0, high: 1, medium: 2, low: 3 } as const;
    for (let i = 1; i < suggestions.length; i++) {
      expect(priorityRank[suggestions[i].priority]).toBeGreaterThanOrEqual(
        priorityRank[suggestions[i - 1].priority],
      );
    }
  });

  it("never returns more than 3 suggestions", async () => {
    // Trigger many generators at once
    scanFindMany.mockResolvedValue([{ score: 50, totalViolations: 20 }]);
    scanFindFirst.mockResolvedValue({ id: "scan-old", createdAt: new Date(Date.now() - 30 * 864e5) });
    violationCount.mockResolvedValueOnce(4).mockResolvedValueOnce(10);
    siteCount.mockResolvedValue(5);

    const suggestions = await generateSuggestions("ws_1");
    expect(suggestions.length).toBeLessThanOrEqual(3);
    expect(suggestions.some((suggestion) => /easy fixes|10-20|under an hour/.test(suggestion.description))).toBe(false);
    expect(suggestions.some((suggestion) => suggestion.id === "compliance-check" || suggestion.id === "setup-monitoring")).toBe(false);
  });

  it("always includes an actionHref on every suggestion", async () => {
    const suggestions = await generateSuggestions("ws_1");
    expect(suggestions.length).toBeGreaterThan(0);
    for (const s of suggestions) {
      expect(typeof s.actionHref).toBe("string");
      expect(s.actionHref?.startsWith("/")).toBe(true);
    }
  });
});
