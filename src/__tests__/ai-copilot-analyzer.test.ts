/**
 * Tests for the Accessibility Copilot real-time analyzer — the exact scenarios
 * from the product spec plus positional accuracy and fragment tolerance.
 */
import { describe, it, expect } from "vitest";

import { analyzeSource } from "@/lib/ai/ide/realtime-analyzer";

const ids = (src: string) => analyzeSource(src).diagnostics.map((d) => d.ruleId);

describe("Accessibility Copilot — realtime analyzer", () => {
  describe("the spec scenarios", () => {
    it("<img> → missing alt", () => {
      const res = analyzeSource(`<img src="hero.png" />`);
      const d = res.diagnostics.find((x) => x.ruleId === "img-missing-alt")!;
      expect(d).toBeTruthy();
      expect(d.severity).toBe("error");
      expect(d.wcag).toContain("1.1.1");
      expect(d.message).toMatch(/alt/i);
    });

    it("<div onClick> → keyboard inaccessible", () => {
      const d = analyzeSource(`<div onClick={select}>Pick</div>`).diagnostics.find(
        (x) => x.ruleId === "no-static-element-interactions",
      )!;
      expect(d).toBeTruthy();
      expect(d.message).toMatch(/keyboard/i);
      expect(d.wcag).toContain("2.1.1");
    });

    it("Modal → missing focus trap (pattern-level, invisible to scanners)", () => {
      const src = `function ConfirmModal() {\n  return <div className="backdrop"><div role="dialog">Sure?</div></div>;\n}`;
      const res = analyzeSource(src);
      expect(res.pattern).toBe("dialog");
      const trap = res.diagnostics.find((d) => d.ruleId === "pattern/dialog-focus-trap");
      expect(trap).toBeTruthy();
      expect(trap!.invisibleToScanners).toBe(true);
      expect(res.diagnostics.some((d) => d.ruleId === "pattern/dialog-escape")).toBe(true);
    });
  });

  describe("element rules", () => {
    it("does not flag an img that has alt", () => {
      expect(ids(`<img src="x.png" alt="A cat" />`)).not.toContain("img-missing-alt");
    });

    it("does not flag decorative aria-hidden images", () => {
      expect(ids(`<img src="x.png" aria-hidden="true" />`)).not.toContain("img-missing-alt");
    });

    it("does not flag a div onClick that also has a key handler", () => {
      expect(ids(`<div onClick={f} onKeyDown={f} role="button" tabIndex={0}>x</div>`)).not.toContain(
        "no-static-element-interactions",
      );
    });

    it("skips custom components (PascalCase) for the click rule", () => {
      expect(ids(`<Card onClick={f}>x</Card>`)).not.toContain("no-static-element-interactions");
    });

    it("flags an anchor with a click handler but no href", () => {
      expect(ids(`<a onClick={go}>Home</a>`)).toContain("anchor-missing-href");
    });

    it("does not flag an anchor with href", () => {
      expect(ids(`<a href="/home" onClick={go}>Home</a>`)).not.toContain("anchor-missing-href");
    });

    it("flags positive tabindex but not tabIndex={0}", () => {
      expect(ids(`<div tabIndex={3}>x</div>`)).toContain("no-positive-tabindex");
      expect(ids(`<div tabIndex={0}>x</div>`)).not.toContain("no-positive-tabindex");
    });

    it("flags autoFocus", () => {
      expect(ids(`<input autoFocus />`)).toContain("no-autofocus");
    });
  });

  describe("positions & tolerance", () => {
    it("reports 1-based line and column of the offending tag", () => {
      const src = `const x = 1;\n  <img src="a.png" />`;
      const d = analyzeSource(src).diagnostics.find((x) => x.ruleId === "img-missing-alt")!;
      expect(d.line).toBe(2);
      expect(d.column).toBe(3); // two spaces then '<'
    });

    it("lints an incomplete, still-being-typed tag", () => {
      // No closing '>' yet — as-you-type.
      expect(ids(`<div onClick={handle`)).toContain("no-static-element-interactions");
    });

    it("returns clean for accessible markup", () => {
      const res = analyzeSource(`<button onClick={save}>Save</button>\n<img src="a.png" alt="chart" />`);
      expect(res.diagnostics).toHaveLength(0);
      expect(res.summary).toMatch(/No accessibility issues/);
    });

    it("handles empty input", () => {
      expect(analyzeSource("").diagnostics).toHaveLength(0);
      expect(analyzeSource("   ").counts.error).toBe(0);
    });

    it("aggregates counts and sorts by position", () => {
      const src = `<img src="a">\n<div onClick={x}>y</div>`;
      const res = analyzeSource(src);
      expect(res.counts.error).toBeGreaterThanOrEqual(1);
      expect(res.diagnostics[0].line).toBeLessThanOrEqual(res.diagnostics[1].line);
    });
  });
});
