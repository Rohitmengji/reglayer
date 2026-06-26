/**
 * Unit tests for computeViolationVelocity — the per-URL fix/introduction
 * velocity that replaced the hardcoded `violationsFixedPerWeek: 0` in the
 * analytics engine.
 */
import { describe, it, expect } from "vitest";
import { computeViolationVelocity } from "@/lib/intelligence/velocity";

describe("computeViolationVelocity", () => {
  it("returns zeros for no data (weeks clamps to >= 1)", () => {
    expect(computeViolationVelocity([], 0)).toEqual({
      violationsFixedPerWeek: 0,
      violationsIntroducedPerWeek: 0,
      netChangePerWeek: 0,
    });
  });

  it("ignores single-scan series (no consecutive pair to diff)", () => {
    const v = computeViolationVelocity([[{ totalViolations: 5 }]], 1);
    expect(v.violationsFixedPerWeek).toBe(0);
    expect(v.violationsIntroducedPerWeek).toBe(0);
    expect(v.netChangePerWeek).toBe(0);
  });

  it("counts drops as fixes and rises as introductions within one URL", () => {
    // 10 -> 7 = 3 fixed; 7 -> 12 = 5 introduced. Over 2 weeks.
    const v = computeViolationVelocity([[{ totalViolations: 10 }, { totalViolations: 7 }, { totalViolations: 12 }]], 2);
    expect(v.violationsFixedPerWeek).toBe(1.5); // 3 / 2
    expect(v.violationsIntroducedPerWeek).toBe(2.5); // 5 / 2
    expect(v.netChangePerWeek).toBe(1); // (5 - 3) / 2
  });

  it("sums independently across multiple URLs (never cross-diffs sites)", () => {
    const v = computeViolationVelocity(
      [
        [{ totalViolations: 8 }, { totalViolations: 3 }], // -5 fixed
        [{ totalViolations: 2 }, { totalViolations: 6 }], // +4 introduced
      ],
      1
    );
    expect(v.violationsFixedPerWeek).toBe(5);
    expect(v.violationsIntroducedPerWeek).toBe(4);
    expect(v.netChangePerWeek).toBe(-1); // 4 - 5
  });

  it("net change is negative when a workspace is steadily fixing violations", () => {
    const v = computeViolationVelocity([[{ totalViolations: 20 }, { totalViolations: 15 }, { totalViolations: 5 }]], 1);
    expect(v.violationsFixedPerWeek).toBe(15); // 5 + 10
    expect(v.violationsIntroducedPerWeek).toBe(0);
    expect(v.netChangePerWeek).toBe(-15);
  });
});
