/**
 * Structured remediation guidance.
 *
 * The assertion that matters most: every WCAG citation resolves against the real
 * criteria database. A remediation report is read by auditors, and a fabricated
 * criterion number is the one defect this product cannot ship.
 */

import { describe, it, expect } from "vitest";
import {
  buildRemediationGuidance,
  supportedRules,
} from "@/lib/ai/remediation/guidance";
import { lookupCriterion } from "@/lib/ai/safety/wcag-fact-check";

const BUTTON_SNIPPET = `<button type="button" onClick={onClose}>\n  <XIcon />\n</button>`;

describe("WCAG citations are looked up, never generated", () => {
  it("cites only criteria that exist in the WCAG database", () => {
    for (const ruleId of supportedRules()) {
      const guidance = buildRemediationGuidance(ruleId, "<div/>");
      expect(guidance).not.toBeNull();

      for (const ref of guidance!.wcag) {
        // An invented criterion in an audit report is worse than no report.
        expect(lookupCriterion(ref.id)).toBeDefined();
      }
    }
  });

  it("reports the authoritative level and version, not a guess", () => {
    const guidance = buildRemediationGuidance("button-name", BUTTON_SNIPPET)!;
    const nameRoleValue = guidance.wcag.find((w) => w.id === "4.1.2")!;

    expect(nameRoleValue.name).toBe("Name, Role, Value");
    expect(nameRoleValue.level).toBe("A");
    expect(nameRoleValue.version).toBe("2.0");
  });

  it("explains why each criterion applies, not just that it does", () => {
    const guidance = buildRemediationGuidance("button-name", BUTTON_SNIPPET)!;
    for (const ref of guidance.wcag) {
      expect(ref.relevance.length).toBeGreaterThan(40);
    }
  });

  it("links to the criterion's understanding document", () => {
    const guidance = buildRemediationGuidance("button-name", BUTTON_SNIPPET)!;
    expect(guidance.wcag[0].url).toContain("w3.org/WAI/WCAG22/Understanding");
  });
});

describe("button-name guidance", () => {
  const guidance = () => buildRemediationGuidance("button-name", BUTTON_SNIPPET)!;

  it("produces all seven sections", () => {
    const g = guidance();
    expect(g.problem.length).toBeGreaterThan(0);
    expect(g.wcag.length).toBeGreaterThan(0);
    expect(g.currentCode).toBe(BUTTON_SNIPPET);
    expect(g.fixedCode.length).toBeGreaterThan(0);
    expect(g.whyThisWorks.length).toBeGreaterThan(0);
    expect(g.regressionRisk.length).toBeGreaterThan(0);
    expect(g.testingSteps.length).toBeGreaterThan(0);
  });

  it("cites 4.1.2 Name, Role, Value", () => {
    expect(guidance().wcag.map((w) => w.id)).toContain("4.1.2");
  });

  it("warns that aria-label can break Label in Name", () => {
    // The standard "just add aria-label" advice trades SC 4.1.2 for SC 2.5.3.
    const risks = guidance().regressionRisk.map((r) => r.risk).join(" ");
    expect(risks).toContain("2.5.3");
    expect(risks.toLowerCase()).toContain("voice");
  });

  it("warns that aria-label is commonly missed by translation", () => {
    const risks = guidance().regressionRisk.map((r) => r.risk).join(" ").toLowerCase();
    expect(risks).toMatch(/translat|localis|locale/);
  });

  it("warns against a generic label that passes the scan but does not help", () => {
    const risks = guidance().regressionRisk.map((r) => r.risk).join(" ").toLowerCase();
    expect(risks).toMatch(/generic|click here/);
  });

  it("pairs every risk with a mitigation", () => {
    // A risk without a mitigation is a warning, not guidance.
    for (const risk of guidance().regressionRisk) {
      expect(risk.mitigation.length).toBeGreaterThan(20);
    }
  });

  it("prefers a visible label over an ARIA-only fix", () => {
    const g = guidance();
    expect(g.fixedCode).toContain("aria-label");
    expect(g.fixedCode).toContain("<span>Close</span>");
    expect(g.whyThisWorks.toLowerCase()).toContain("visible");
  });

  it("hides the decorative icon so the name is not duplicated", () => {
    expect(guidance().fixedCode).toContain('aria-hidden="true"');
  });

  it("includes manual verification, not only a re-scan", () => {
    const steps = guidance().testingSteps.join(" ").toLowerCase();
    // An automated pass is necessary but nowhere near sufficient.
    expect(steps).toMatch(/voiceover|nvda|screen reader/);
    expect(steps).toMatch(/voice control|voice access/);
  });
});

describe("coverage and safety", () => {
  it("returns null for a rule with no authored guidance", () => {
    // Vague filler teaches developers to distrust the tool.
    expect(buildRemediationGuidance("unknown-rule", "<div/>")).toBeNull();
  });

  it("preserves the offending snippet verbatim", () => {
    const snippet = `<button class="x"><svg/></button>`;
    expect(buildRemediationGuidance("button-name", snippet)!.currentCode).toBe(snippet);
  });

  it("distinguishes informative from decorative images", () => {
    const g = buildRemediationGuidance("image-alt", "<img src='/a.png'/>")!;
    expect(g.fixedCode).toContain('alt=""');
    expect(g.whyThisWorks.toLowerCase()).toContain("decorative");
  });

  it("is deterministic across calls", () => {
    const a = buildRemediationGuidance("button-name", BUTTON_SNIPPET);
    const b = buildRemediationGuidance("button-name", BUTTON_SNIPPET);
    expect(a).toEqual(b);
  });
});
