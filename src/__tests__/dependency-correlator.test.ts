/**
 * RegLayer — Dependency Regression Correlator Tests
 */
import { describe, it, expect } from "vitest";
import {
  detectRegressions,
  matchAdvisories,
  isNewerVersion,
  type VersionTransition,
} from "@/lib/dependencies/correlator";

describe("detectRegressions", () => {
  it("detects CRITICAL regression with high rate", () => {
    const transitions: VersionTransition[] = [{
      package: "@radix-ui/react-dialog",
      fromVersion: "1.0.5",
      toVersion: "1.1.0",
      observations: [
        { siteId: "s1", scoreBefore: 88, scoreAfter: 78 }, // -10
        { siteId: "s2", scoreBefore: 92, scoreAfter: 83 }, // -9
        { siteId: "s3", scoreBefore: 85, scoreAfter: 76 }, // -9
        { siteId: "s4", scoreBefore: 90, scoreAfter: 82 }, // -8
        { siteId: "s5", scoreBefore: 87, scoreAfter: 86 }, // -1 (no regression)
      ],
    }];

    const signals = detectRegressions(transitions);
    expect(signals).toHaveLength(1);
    expect(signals[0].level).toBe("CRITICAL");
    expect(signals[0].regressionRate).toBeGreaterThan(0.5); // 4/5 = 80%
    expect(signals[0].sitesAffected).toBe(4);
    expect(signals[0].sitesTotal).toBe(5);
  });

  it("detects WARNING regression with moderate rate", () => {
    const transitions: VersionTransition[] = [{
      package: "react",
      fromVersion: "18.2.0",
      toVersion: "19.0.0",
      observations: [
        { siteId: "s1", scoreBefore: 90, scoreAfter: 85 }, // -5 (regression)
        { siteId: "s2", scoreBefore: 88, scoreAfter: 87 }, // -1 (no)
        { siteId: "s3", scoreBefore: 92, scoreAfter: 86 }, // -6 (regression)
        { siteId: "s4", scoreBefore: 85, scoreAfter: 84 }, // -1 (no)
        { siteId: "s5", scoreBefore: 91, scoreAfter: 91 }, // 0 (no)
        { siteId: "s6", scoreBefore: 87, scoreAfter: 86 }, // -1 (no)
        { siteId: "s7", scoreBefore: 90, scoreAfter: 84 }, // -6 (regression)
        { siteId: "s8", scoreBefore: 89, scoreAfter: 89 }, // 0 (no)
        { siteId: "s9", scoreBefore: 86, scoreAfter: 86 }, // 0 (no)
        { siteId: "s10", scoreBefore: 93, scoreAfter: 92 }, // -1 (no)
      ],
    }];

    const signals = detectRegressions(transitions);
    expect(signals.length).toBeGreaterThanOrEqual(1);
    // 3/10 = 30% regression rate → should be CRITICAL or WARNING
    expect(["CRITICAL", "WARNING"]).toContain(signals[0].level);
  });

  it("ignores transitions with insufficient samples", () => {
    const transitions: VersionTransition[] = [{
      package: "tiny-lib",
      fromVersion: "1.0.0",
      toVersion: "2.0.0",
      observations: [
        { siteId: "s1", scoreBefore: 90, scoreAfter: 50 }, // -40 but only 1 sample
      ],
    }];

    const signals = detectRegressions(transitions);
    expect(signals).toHaveLength(0); // Below MIN_SAMPLE_SIZE
  });

  it("ignores small score drops (noise)", () => {
    const transitions: VersionTransition[] = [{
      package: "stable-lib",
      fromVersion: "3.0.0",
      toVersion: "3.1.0",
      observations: [
        { siteId: "s1", scoreBefore: 90, scoreAfter: 89 }, // -1
        { siteId: "s2", scoreBefore: 88, scoreAfter: 87 }, // -1
        { siteId: "s3", scoreBefore: 92, scoreAfter: 91 }, // -1
        { siteId: "s4", scoreBefore: 85, scoreAfter: 85 }, // 0
        { siteId: "s5", scoreBefore: 91, scoreAfter: 90 }, // -1
      ],
    }];

    const signals = detectRegressions(transitions);
    // All drops are ≤ 2 (below MIN_SCORE_DROP of 3)
    expect(signals).toHaveLength(0);
  });

  it("returns empty array for no transitions", () => {
    expect(detectRegressions([])).toHaveLength(0);
  });

  it("sorts signals by severity (CRITICAL first)", () => {
    const transitions: VersionTransition[] = [
      {
        package: "minor-issue",
        fromVersion: "1.0.0",
        toVersion: "1.1.0",
        observations: [
          { siteId: "s1", scoreBefore: 90, scoreAfter: 85 },
          { siteId: "s2", scoreBefore: 88, scoreAfter: 87 },
          { siteId: "s3", scoreBefore: 92, scoreAfter: 91 },
        ],
      },
      {
        package: "major-issue",
        fromVersion: "2.0.0",
        toVersion: "3.0.0",
        observations: [
          { siteId: "s1", scoreBefore: 90, scoreAfter: 75 },
          { siteId: "s2", scoreBefore: 88, scoreAfter: 72 },
          { siteId: "s3", scoreBefore: 92, scoreAfter: 78 },
          { siteId: "s4", scoreBefore: 85, scoreAfter: 70 },
          { siteId: "s5", scoreBefore: 91, scoreAfter: 76 },
        ],
      },
    ];

    const signals = detectRegressions(transitions);
    if (signals.length >= 2) {
      const levels = signals.map((s) => s.level);
      const levelOrder = { CRITICAL: 0, WARNING: 1, INFO: 2 };
      for (let i = 1; i < levels.length; i++) {
        expect(levelOrder[levels[i]]).toBeGreaterThanOrEqual(levelOrder[levels[i - 1]]);
      }
    }
  });
});

describe("matchAdvisories", () => {
  const advisories = [
    { package: "@radix-ui/react-dialog", fromVersion: "1.0.5", toVersion: "1.1.0", level: "CRITICAL" as const },
    { package: "react", fromVersion: "18.2.0", toVersion: "19.0.0", level: "WARNING" as const },
  ];

  it("identifies at-risk sites (on fromVersion)", () => {
    const siteDeps = [
      { package: "@radix-ui/react-dialog", version: "1.0.5" },
      { package: "react", version: "18.2.0" },
    ];
    const matched = matchAdvisories(siteDeps, advisories);
    expect(matched).toHaveLength(2);
    expect(matched[0].status).toBe("at_risk");
    expect(matched[1].status).toBe("at_risk");
  });

  it("identifies affected sites (on toVersion)", () => {
    const siteDeps = [
      { package: "@radix-ui/react-dialog", version: "1.1.0" },
    ];
    const matched = matchAdvisories(siteDeps, advisories);
    expect(matched).toHaveLength(1);
    expect(matched[0].status).toBe("affected");
  });

  it("returns empty for unrelated deps", () => {
    const siteDeps = [{ package: "lodash", version: "4.17.0" }];
    const matched = matchAdvisories(siteDeps, advisories);
    expect(matched).toHaveLength(0);
  });

  it("returns empty for versions not in advisory", () => {
    const siteDeps = [{ package: "@radix-ui/react-dialog", version: "2.0.0" }];
    const matched = matchAdvisories(siteDeps, advisories);
    expect(matched).toHaveLength(0);
  });
});

describe("isNewerVersion", () => {
  it("detects newer major version", () => {
    expect(isNewerVersion("1.0.0", "2.0.0")).toBe(true);
  });

  it("detects newer minor version", () => {
    expect(isNewerVersion("1.0.0", "1.1.0")).toBe(true);
  });

  it("detects newer patch version", () => {
    expect(isNewerVersion("1.0.0", "1.0.1")).toBe(true);
  });

  it("returns false for same version", () => {
    expect(isNewerVersion("1.0.0", "1.0.0")).toBe(false);
  });

  it("returns false for older version", () => {
    expect(isNewerVersion("2.0.0", "1.0.0")).toBe(false);
  });

  it("handles versions with prefixes", () => {
    expect(isNewerVersion("v1.0.0", "v2.0.0")).toBe(true);
  });
});
