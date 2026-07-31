/**
 * Tests for the Accessibility Intelligence Network — the privacy-critical pure
 * core: k-anonymity gating, insight wording, and confidence grading.
 */
import { describe, it, expect, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/database/prisma", () => ({ prisma: {} }));

import { buildNetworkInsight, MIN_CONTRIBUTORS } from "@/lib/network/intelligenceNetwork";

const baseInput = {
  fingerprint: "button-name::.icon-btn",
  ruleId: "button-name",
  timesSeen: 8132,
  successes: 7888,
  successRate: 97,
  medianDaysToEffect: 2,
  distinctOrgs: 40,
};

describe("Accessibility Intelligence Network — buildNetworkInsight", () => {
  it("surfaces the network benchmark when k-anonymity is satisfied", () => {
    const insight = buildNetworkInsight(baseInput);
    expect(insight.available).toBe(true);
    expect(insight.message).toContain("8,132");
    expect(insight.message).toContain("97%");
    expect(insight.message).toContain("40 organisations");
    expect(insight.confidence).toBe("high");
  });

  it("WITHHOLDS the aggregate when too few organisations contribute (k-anonymity)", () => {
    const insight = buildNetworkInsight({ ...baseInput, distinctOrgs: MIN_CONTRIBUTORS - 1 });
    expect(insight.available).toBe(false);
    expect(insight.reason).toMatch(/Too few contributing organisations/);
    // Must not leak the numbers in the human message.
    expect(insight.message).not.toContain("97%");
    expect(insight.message).not.toContain("8,132");
  });

  it("treats exactly MIN_CONTRIBUTORS as sufficient", () => {
    const insight = buildNetworkInsight({ ...baseInput, distinctOrgs: MIN_CONTRIBUTORS });
    expect(insight.available).toBe(true);
  });

  it("reports no history distinctly from a k-anonymity block", () => {
    const insight = buildNetworkInsight({ ...baseInput, timesSeen: 0, successes: 0, successRate: 0, distinctOrgs: 0 });
    expect(insight.available).toBe(false);
    expect(insight.reason).toMatch(/No network history/);
  });

  it("respects a custom minContributors threshold", () => {
    const strict = buildNetworkInsight({ ...baseInput, distinctOrgs: 5, minContributors: 10 });
    expect(strict.available).toBe(false);
  });

  it("grades confidence by total observations", () => {
    expect(buildNetworkInsight({ ...baseInput, timesSeen: 12 }).confidence).toBe("high");
    expect(buildNetworkInsight({ ...baseInput, timesSeen: 5 }).confidence).toBe("medium");
    expect(buildNetworkInsight({ ...baseInput, timesSeen: 2 }).confidence).toBe("low");
  });

  it("omits the duration clause when timing is unknown", () => {
    const insight = buildNetworkInsight({ ...baseInput, medianDaysToEffect: null });
    expect(insight.available).toBe(true);
    expect(insight.message).not.toContain("median");
  });
});
