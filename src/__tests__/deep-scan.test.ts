/**
 * Unit tests for the Deep Scan pure analyzers (keyboard heuristics + revealed-state dedup).
 * The in-page collectors are browser-driven and covered by integration, not here.
 */

import { describe, it, expect } from "vitest";
import {
  analyzeKeyboard,
  dedupeNewViolations,
  type KbElement,
  type AxeViolationLike,
} from "@/lib/scanner/accessibility/deepScan";

const baseEl: KbElement = {
  selector: "x",
  tag: "div",
  role: null,
  tabindex: null,
  nativelyFocusable: false,
  hasClickAffordance: false,
  ariaHidden: false,
  disabled: false,
};

describe("analyzeKeyboard", () => {
  it("flags a mouse-only (non-focusable) interactive control as keyboard-unreachable", () => {
    const findings = analyzeKeyboard([
      { ...baseEl, selector: "div.btn", role: "button", hasClickAffordance: true },
    ]);
    expect(findings).toHaveLength(1);
    expect(findings[0].ruleId).toBe("keyboard-reachable");
    expect(findings[0].impact).toBe("serious");
  });

  it("does NOT flag a natively focusable control", () => {
    const findings = analyzeKeyboard([
      { ...baseEl, tag: "button", nativelyFocusable: true, hasClickAffordance: true },
    ]);
    expect(findings).toHaveLength(0);
  });

  it("does NOT flag a div made focusable via tabindex=0", () => {
    const findings = analyzeKeyboard([
      { ...baseEl, role: "button", hasClickAffordance: true, tabindex: 0 },
    ]);
    expect(findings).toHaveLength(0);
  });

  it("flags positive tabindex as a focus-order risk", () => {
    const findings = analyzeKeyboard([
      { ...baseEl, tag: "button", nativelyFocusable: true, tabindex: 3 },
    ]);
    expect(findings.some((f) => f.ruleId === "tabindex-positive")).toBe(true);
  });

  it("ignores aria-hidden and disabled elements", () => {
    const findings = analyzeKeyboard([
      { ...baseEl, role: "button", hasClickAffordance: true, ariaHidden: true },
      { ...baseEl, role: "button", hasClickAffordance: true, disabled: true },
    ]);
    expect(findings).toHaveLength(0);
  });

  it("does not double-report the same selector", () => {
    const findings = analyzeKeyboard([
      { ...baseEl, selector: "div.dup", role: "button", hasClickAffordance: true },
      { ...baseEl, selector: "div.dup", role: "button", hasClickAffordance: true },
    ]);
    expect(findings).toHaveLength(1);
  });
});

describe("dedupeNewViolations", () => {
  const mk = (id: string, target: string): AxeViolationLike => ({
    id,
    impact: "serious",
    description: "",
    help: "",
    helpUrl: "",
    tags: [],
    nodes: [{ html: "", target: [target], failureSummary: "" }],
  });

  it("returns only violations not already present in the base scan", () => {
    const out = dedupeNewViolations(
      [mk("color-contrast", "#a")],
      [mk("color-contrast", "#a"), mk("aria-required-children", "#menu")],
    );
    expect(out).toHaveLength(1);
    expect(out[0].id).toBe("aria-required-children");
  });

  it("keeps a new node of a rule that already fired on a different node", () => {
    const out = dedupeNewViolations([mk("color-contrast", "#a")], [mk("color-contrast", "#b")]);
    expect(out).toHaveLength(1);
    expect(out[0].nodes[0].target[0]).toBe("#b");
  });

  it("returns empty when the revealed pass adds nothing new", () => {
    expect(dedupeNewViolations([mk("x", "#a")], [mk("x", "#a")])).toHaveLength(0);
  });
});
