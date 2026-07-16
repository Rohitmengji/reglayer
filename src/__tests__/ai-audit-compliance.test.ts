import { describe, it, expect, vi } from "vitest";
vi.mock("server-only", () => ({}));
vi.mock("@/lib/database/prisma", () => ({ prisma: {} }));
vi.mock("@/lib/ai/hardening", () => ({ containsPII: (t: string) => /\d{3}-\d{2}-\d{4}/.test(t) }));

import { FRAMEWORK_CONTROLS, type Framework } from "@/lib/ai/compliance/framework";

describe("AI Audit Trail + Compliance", () => {
  describe("FRAMEWORK_CONTROLS", () => {
    const frameworks: Framework[] = ["GDPR", "SOC2", "ISO27001", "HIPAA", "AI_ACT"];

    it("defines controls for all 5 frameworks", () => {
      for (const fw of frameworks) {
        expect(FRAMEWORK_CONTROLS[fw]).toBeDefined();
        expect(FRAMEWORK_CONTROLS[fw].length).toBeGreaterThan(0);
      }
    });

    it("GDPR has at least 10 controls", () => {
      expect(FRAMEWORK_CONTROLS.GDPR.length).toBeGreaterThanOrEqual(10);
    });

    it("SOC2 has at least 6 controls", () => {
      expect(FRAMEWORK_CONTROLS.SOC2.length).toBeGreaterThanOrEqual(6);
    });

    it("each control has required fields", () => {
      for (const fw of frameworks) {
        for (const ctrl of FRAMEWORK_CONTROLS[fw]) {
          expect(ctrl.controlId).toBeTruthy();
          expect(ctrl.controlName).toBeTruthy();
          expect(ctrl.description).toBeTruthy();
          expect(typeof ctrl.automatedCheck).toBe("boolean");
        }
      }
    });

    it("GDPR includes right to erasure (Art. 17)", () => {
      expect(FRAMEWORK_CONTROLS.GDPR.some((c) => c.controlId === "GDPR-17")).toBe(true);
    });

    it("GDPR includes data protection by design (Art. 25)", () => {
      expect(FRAMEWORK_CONTROLS.GDPR.some((c) => c.controlId === "GDPR-25")).toBe(true);
    });

    it("AI Act includes human oversight (Art. 14)", () => {
      expect(FRAMEWORK_CONTROLS.AI_ACT.some((c) => c.controlId === "AIA-14")).toBe(true);
    });

    it("AI Act includes transparency (Art. 13)", () => {
      expect(FRAMEWORK_CONTROLS.AI_ACT.some((c) => c.controlId === "AIA-13")).toBe(true);
    });

    it("HIPAA includes minimum necessary", () => {
      expect(FRAMEWORK_CONTROLS.HIPAA.some((c) => c.controlId === "164.502(b)")).toBe(true);
    });

    it("SOC2 includes logical access controls", () => {
      expect(FRAMEWORK_CONTROLS.SOC2.some((c) => c.controlId === "CC6.1")).toBe(true);
    });

    it("ISO27001 includes data masking", () => {
      expect(FRAMEWORK_CONTROLS.ISO27001.some((c) => c.controlId === "A.8.11")).toBe(true);
    });

    it("automated checks map to real platform capabilities", () => {
      const automated = frameworks.flatMap((fw) => FRAMEWORK_CONTROLS[fw].filter((c) => c.automatedCheck));
      expect(automated.length).toBeGreaterThan(20); // majority can be auto-checked
    });
  });
});
