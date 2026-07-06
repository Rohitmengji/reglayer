/**
 * RegLayer — Adversarial Agent Persona Constraints Tests
 */
import { describe, it, expect } from "vitest";
import {
  enforceConstraints,
  getPerception,
  updateCognitiveState,
  PERSONA_CONSTRAINTS,
  type ActionProposal,
} from "@/lib/agents/personas";

describe("enforceConstraints", () => {
  it("blocks mouse clicks for KEYBOARD persona", () => {
    const violations = enforceConstraints("KEYBOARD", { type: "click", selector: "#btn" });
    expect(violations).toHaveLength(1);
    expect(violations[0].blocked).toBe(true);
    expect(violations[0].rule).toBe("no-mouse");
  });

  it("allows keyboard press for KEYBOARD persona", () => {
    const violations = enforceConstraints("KEYBOARD", { type: "press", key: "Tab" });
    expect(violations).toHaveLength(0);
  });

  it("blocks restricted keys for KEYBOARD persona", () => {
    const violations = enforceConstraints("KEYBOARD", { type: "press", key: "Delete" });
    expect(violations).toHaveLength(1);
    expect(violations[0].rule).toBe("restricted-key");
  });

  it("blocks mouse for SCREEN_READER persona", () => {
    const violations = enforceConstraints("SCREEN_READER", { type: "hover", selector: "#menu" });
    expect(violations).toHaveLength(1);
    expect(violations[0].blocked).toBe(true);
  });

  it("blocks small targets for MOTOR persona", () => {
    const action: ActionProposal = {
      type: "click",
      selector: "#tiny-btn",
      targetSize: { width: 20, height: 20 },
    };
    const violations = enforceConstraints("MOTOR", action);
    expect(violations).toHaveLength(1);
    expect(violations[0].rule).toBe("target-too-small");
  });

  it("allows large targets for MOTOR persona", () => {
    const action: ActionProposal = {
      type: "click",
      selector: "#big-btn",
      targetSize: { width: 48, height: 48 },
    };
    const violations = enforceConstraints("MOTOR", action);
    expect(violations).toHaveLength(0);
  });

  it("blocks drag for MOTOR persona", () => {
    const violations = enforceConstraints("MOTOR", { type: "drag" });
    expect(violations).toHaveLength(1);
    expect(violations[0].rule).toBe("no-drag");
  });

  it("blocks drag for COGNITIVE persona", () => {
    const violations = enforceConstraints("COGNITIVE", { type: "drag" });
    expect(violations).toHaveLength(1);
  });

  it("allows all actions for LOW_VISION persona (except drag)", () => {
    expect(enforceConstraints("LOW_VISION", { type: "click", selector: "#x" })).toHaveLength(0);
    expect(enforceConstraints("LOW_VISION", { type: "press", key: "Enter" })).toHaveLength(0);
    expect(enforceConstraints("LOW_VISION", { type: "type", selector: "#input" })).toHaveLength(0);
  });
});

describe("getPerception", () => {
  it("SCREEN_READER only gets accessibility tree", () => {
    const p = getPerception("SCREEN_READER");
    expect(p.mode).toBe("accessibility-tree");
    expect(p.includeVisualLayout).toBe(false);
    expect(p.includeAccessibilityTree).toBe(true);
    expect(p.includeColorInfo).toBe(false);
  });

  it("KEYBOARD gets full visual + a11y tree", () => {
    const p = getPerception("KEYBOARD");
    expect(p.mode).toBe("visual");
    expect(p.includeVisualLayout).toBe(true);
    expect(p.includeAccessibilityTree).toBe(true);
  });

  it("LOW_VISION gets high-contrast mode with zoom", () => {
    const p = getPerception("LOW_VISION");
    expect(p.mode).toBe("high-contrast");
    expect(p.zoom).toBe(2.0);
    expect(p.includeColorInfo).toBe(false);
  });

  it("MOTOR gets normal visual perception", () => {
    const p = getPerception("MOTOR");
    expect(p.mode).toBe("visual");
    expect(p.zoom).toBe(1.0);
  });
});

describe("updateCognitiveState", () => {
  it("detects cognitive overload for COGNITIVE persona", () => {
    const state = updateCognitiveState("COGNITIVE", {
      totalSteps: 0,
      decisionsThisPage: 0,
      fatigued: false,
      overwhelmed: false,
    }, 20); // 20 interactive elements > threshold of 7
    expect(state.overwhelmed).toBe(true);
    expect(state.totalSteps).toBe(1);
  });

  it("detects fatigue after max steps", () => {
    const state = updateCognitiveState("COGNITIVE", {
      totalSteps: 14, // One away from threshold of 15
      decisionsThisPage: 5,
      fatigued: false,
      overwhelmed: false,
    }, 5);
    expect(state.fatigued).toBe(true);
    expect(state.totalSteps).toBe(15);
  });

  it("KEYBOARD persona has high fatigue threshold", () => {
    const state = updateCognitiveState("KEYBOARD", {
      totalSteps: 50,
      decisionsThisPage: 0,
      fatigued: false,
      overwhelmed: false,
    }, 30);
    expect(state.fatigued).toBe(false); // KEYBOARD threshold is 100
    expect(state.overwhelmed).toBe(false); // KEYBOARD threshold is 50
  });
});

describe("PERSONA_CONSTRAINTS", () => {
  it("defines all 5 personas", () => {
    expect(Object.keys(PERSONA_CONSTRAINTS)).toHaveLength(5);
    expect(PERSONA_CONSTRAINTS.KEYBOARD).toBeDefined();
    expect(PERSONA_CONSTRAINTS.SCREEN_READER).toBeDefined();
    expect(PERSONA_CONSTRAINTS.MOTOR).toBeDefined();
    expect(PERSONA_CONSTRAINTS.LOW_VISION).toBeDefined();
    expect(PERSONA_CONSTRAINTS.COGNITIVE).toBeDefined();
  });

  it("KEYBOARD cannot use mouse", () => {
    expect(PERSONA_CONSTRAINTS.KEYBOARD.allowMouse).toBe(false);
  });

  it("SCREEN_READER cannot see visual content", () => {
    expect(PERSONA_CONSTRAINTS.SCREEN_READER.canSeeVisualContent).toBe(false);
  });

  it("MOTOR requires large targets", () => {
    expect(PERSONA_CONSTRAINTS.MOTOR.minTargetSize).toBe(44);
  });

  it("LOW_VISION uses 200% zoom", () => {
    expect(PERSONA_CONSTRAINTS.LOW_VISION.viewportZoom).toBe(2.0);
  });

  it("COGNITIVE has low fatigue threshold", () => {
    expect(PERSONA_CONSTRAINTS.COGNITIVE.maxStepsBeforeFatigue).toBe(15);
    expect(PERSONA_CONSTRAINTS.COGNITIVE.maxDecisionsPerPage).toBe(7);
  });
});
