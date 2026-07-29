/**
 * Evaluation regression gate.
 *
 * This gate decides what ships. Its own failure modes are therefore the expensive kind:
 * passing a regression, or blocking on noise. The tests below pin the ordering rules
 * that the existing `analyzeResults` comparator gets wrong — above all, that no gain in
 * speed or cost can outvote a correctness loss.
 */

import { describe, it, expect } from "vitest";
import {
  DEFAULT_POLICY,
  detectRegressions,
  exitCodeFor,
  type EvalMetrics,
} from "@/lib/ai/eval/regression";

function metrics(overrides: Partial<EvalMetrics> = {}): EvalMetrics {
  return {
    sampleSize: 50,
    qualityScore: 0.9,
    hallucinationRate: 0,
    citationAccuracy: 1,
    p50LatencyMs: 800,
    p95LatencyMs: 1500,
    costPerRequestUsd: 0.004,
    tokensPerRequest: 1200,
    satisfactionRate: 0.85,
    ...overrides,
  };
}

describe("correctness outranks economics", () => {
  it("blocks a candidate that hallucinates more, however fast and cheap", () => {
    const baseline = metrics();
    const candidate = metrics({
      hallucinationRate: 0.02,
      p95LatencyMs: 400,          // dramatically faster
      costPerRequestUsd: 0.0005,  // dramatically cheaper
    });

    const report = detectRegressions(baseline, candidate);

    // The existing point-scoring comparator would declare this the winner 2–1.
    expect(report.verdict).toBe("block");
    expect(report.findings[0].metric).toBe("hallucinationRate");
  });

  it("treats any hallucination increase as blocking, not a percentage", () => {
    // 0% → 0.5% is an infinite ratio; the rule must not depend on that arithmetic.
    const report = detectRegressions(metrics(), metrics({ hallucinationRate: 0.005 }));
    expect(report.verdict).toBe("block");
  });

  it("allows a candidate that reduces hallucination", () => {
    const report = detectRegressions(
      metrics({ hallucinationRate: 0.03 }),
      metrics({ hallucinationRate: 0.01 }),
    );
    expect(report.verdict).toBe("pass");
  });

  it("blocks a meaningful quality drop", () => {
    const report = detectRegressions(metrics({ qualityScore: 0.9 }), metrics({ qualityScore: 0.8 }));

    expect(report.verdict).toBe("block");
    expect(report.findings.map((f) => f.metric)).toContain("qualityScore");
  });

  it("tolerates quality noise within the policy band", () => {
    const report = detectRegressions(metrics({ qualityScore: 0.9 }), metrics({ qualityScore: 0.895 }));
    expect(report.verdict).toBe("pass");
  });
});

describe("citations", () => {
  it("blocks on an absolute accuracy floor, not a delta", () => {
    // A citation that does not resolve is wrong whether or not the previous version
    // was equally wrong, so a matching baseline must not excuse it.
    const report = detectRegressions(
      metrics({ citationAccuracy: 0.5 }),
      metrics({ citationAccuracy: 0.5 }),
    );

    expect(report.verdict).toBe("block");
    expect(report.findings.map((f) => f.metric)).toContain("citationAccuracy");
  });
});

describe("evidence sufficiency", () => {
  it("blocks rather than passes when there is too little data", () => {
    const report = detectRegressions(metrics(), metrics({ sampleSize: 5 }));

    // A gate that reports green when it has no evidence is a rubber stamp.
    expect(report.verdict).toBe("block");
    expect(report.findings[0].metric).toBe("sampleSize");
  });

  it("accepts a run at exactly the minimum sample size", () => {
    const report = detectRegressions(metrics(), metrics({ sampleSize: DEFAULT_POLICY.minSampleSize }));
    expect(report.verdict).toBe("pass");
  });
});

describe("economics warn rather than block", () => {
  it("warns on a large latency increase without blocking the release", () => {
    const report = detectRegressions(metrics(), metrics({ p95LatencyMs: 3000 }));

    // A slower release is a trade-off a human can knowingly accept.
    expect(report.verdict).toBe("warn");
    expect(exitCodeFor(report)).toBe(0);
  });

  it("warns on cost and token growth", () => {
    const report = detectRegressions(
      metrics(),
      metrics({ costPerRequestUsd: 0.01, tokensPerRequest: 2000 }),
    );

    expect(report.findings.map((f) => f.metric).sort())
      .toEqual(["costPerRequestUsd", "tokensPerRequest"]);
  });

  it("warns, not blocks, on falling satisfaction", () => {
    // Thumbs data is sparse, self-selected, and lags a release.
    const report = detectRegressions(
      metrics({ satisfactionRate: 0.9 }),
      metrics({ satisfactionRate: 0.6 }),
    );

    expect(report.verdict).toBe("warn");
  });

  it("skips satisfaction entirely when a run has no production signal", () => {
    const report = detectRegressions(
      metrics({ satisfactionRate: undefined }),
      metrics({ satisfactionRate: undefined }),
    );
    expect(report.verdict).toBe("pass");
  });

  it("does not flag improvements", () => {
    const report = detectRegressions(
      metrics(),
      metrics({ p95LatencyMs: 500, costPerRequestUsd: 0.001, qualityScore: 0.95 }),
    );
    expect(report.verdict).toBe("pass");
  });
});

describe("reporting", () => {
  it("fails CI only when something blocks", () => {
    expect(exitCodeFor(detectRegressions(metrics(), metrics()))).toBe(0);
    expect(exitCodeFor(detectRegressions(metrics(), metrics({ hallucinationRate: 0.1 })))).toBe(1);
  });

  it("names the offending metrics in the summary", () => {
    const report = detectRegressions(metrics(), metrics({ hallucinationRate: 0.1 }));
    expect(report.summary).toContain("hallucinationRate");
  });

  it("handles a zero baseline without producing NaN", () => {
    const report = detectRegressions(
      metrics({ costPerRequestUsd: 0 }),
      metrics({ costPerRequestUsd: 0.01 }),
    );

    expect(report.summary).not.toContain("NaN");
    expect(report.findings.some((f) => f.metric === "costPerRequestUsd")).toBe(true);
  });

  it("reports every finding, not just the first", () => {
    const report = detectRegressions(
      metrics(),
      metrics({ hallucinationRate: 0.05, qualityScore: 0.5, p95LatencyMs: 9000 }),
    );

    expect(report.findings.length).toBeGreaterThanOrEqual(3);
  });
});
