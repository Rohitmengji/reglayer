/**
 * ---------------------------------------------------------
 * RegLayer — Adversarial Agent: Persona Constraints (pure core)
 * ---------------------------------------------------------
 *
 * WHY: Each disability persona operates under specific constraints that
 *      PREVENT certain interactions — forcing the agent to experience the
 *      site as a disabled user would. This is the enforcement layer.
 *
 * WHAT: Defines which browser interactions are ALLOWED vs BLOCKED per persona,
 *       what "sensing" is available (full DOM vs accessibility tree only),
 *       and what thresholds trigger failure.
 *
 * HOW: Pure functions — no Playwright, no LLM, no side effects. The runner
 *      calls these to determine what the agent CAN do next.
 * ---------------------------------------------------------
 */

export type AgentPersona = "KEYBOARD" | "SCREEN_READER" | "MOTOR" | "LOW_VISION" | "COGNITIVE";

// ─── Constraint Definitions ──────────────────────────────────────────────────

export interface PersonaConstraints {
  persona: AgentPersona;
  label: string;
  description: string;

  // Input constraints
  allowMouse: boolean;
  allowKeyboard: boolean;
  allowedKeys: string[] | "all";    // Restricted key set (keyboard persona)
  minTargetSize: number;            // Minimum click target in px (motor)
  maxInputDelay: number;            // Max ms before timeout triggers (motor)
  allowDrag: boolean;

  // Sensing constraints
  canSeeVisualContent: boolean;     // false = only accessibility tree
  canSeeColors: boolean;
  viewportZoom: number;             // 1.0 = normal, 2.0 = 200% zoom
  highContrastMode: boolean;

  // Cognitive constraints
  maxStepsBeforeFatigue: number;    // Steps before cognitive overload
  maxDecisionsPerPage: number;      // Interactive elements before overwhelm
  requireProgressIndicator: boolean;

  // Timeouts
  stepTimeoutMs: number;            // Max time for a single step
  totalTimeoutMs: number;           // Max total run time
}

export const PERSONA_CONSTRAINTS: Record<AgentPersona, PersonaConstraints> = {
  KEYBOARD: {
    persona: "KEYBOARD",
    label: "Keyboard-Only User",
    description: "Cannot use a mouse. Navigates exclusively with keyboard: Tab, Shift+Tab, Enter, Space, Arrow keys, Escape.",
    allowMouse: false,
    allowKeyboard: true,
    allowedKeys: ["Tab", "Shift+Tab", "Enter", "Space", "ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", "Escape", "Home", "End"],
    minTargetSize: 0,
    maxInputDelay: 0,
    allowDrag: false,
    canSeeVisualContent: true,
    canSeeColors: true,
    viewportZoom: 1.0,
    highContrastMode: false,
    maxStepsBeforeFatigue: 100,
    maxDecisionsPerPage: 50,
    requireProgressIndicator: false,
    stepTimeoutMs: 10_000,
    totalTimeoutMs: 120_000,
  },

  SCREEN_READER: {
    persona: "SCREEN_READER",
    label: "Screen Reader User",
    description: "Cannot see the visual page. Perceives ONLY the accessibility tree: roles, names, states, live region announcements. Navigates by landmarks, headings, and focus order.",
    allowMouse: false,
    allowKeyboard: true,
    allowedKeys: "all",
    minTargetSize: 0,
    maxInputDelay: 0,
    allowDrag: false,
    canSeeVisualContent: false,
    canSeeColors: false,
    viewportZoom: 1.0,
    highContrastMode: false,
    maxStepsBeforeFatigue: 100,
    maxDecisionsPerPage: 50,
    requireProgressIndicator: false,
    stepTimeoutMs: 15_000,
    totalTimeoutMs: 180_000,
  },

  MOTOR: {
    persona: "MOTOR",
    label: "Motor-Impaired User",
    description: "Slow, imprecise input. Cannot hit small targets. Cannot perform drag operations. Needs extended timeouts. Switch/voice input simulation.",
    allowMouse: true,
    allowKeyboard: true,
    allowedKeys: "all",
    minTargetSize: 44,              // WCAG 2.5.8 minimum
    maxInputDelay: 3000,            // 3s delay between actions
    allowDrag: false,
    canSeeVisualContent: true,
    canSeeColors: true,
    viewportZoom: 1.0,
    highContrastMode: false,
    maxStepsBeforeFatigue: 50,
    maxDecisionsPerPage: 30,
    requireProgressIndicator: false,
    stepTimeoutMs: 30_000,
    totalTimeoutMs: 300_000,
  },

  LOW_VISION: {
    persona: "LOW_VISION",
    label: "Low Vision User",
    description: "Requires 200% zoom. High contrast mode. Content must reflow without horizontal scrolling. Information must not depend solely on color.",
    allowMouse: true,
    allowKeyboard: true,
    allowedKeys: "all",
    minTargetSize: 44,
    maxInputDelay: 0,
    allowDrag: true,
    canSeeVisualContent: true,
    canSeeColors: false,            // Cannot distinguish color-only info
    viewportZoom: 2.0,
    highContrastMode: true,
    maxStepsBeforeFatigue: 80,
    maxDecisionsPerPage: 40,
    requireProgressIndicator: false,
    stepTimeoutMs: 15_000,
    totalTimeoutMs: 180_000,
  },

  COGNITIVE: {
    persona: "COGNITIVE",
    label: "Cognitive Disability User",
    description: "Limited working memory. Overwhelmed by too many choices. Needs clear progress indicators. Confused by inconsistent navigation. Timeout pressure causes abandonment.",
    allowMouse: true,
    allowKeyboard: true,
    allowedKeys: "all",
    minTargetSize: 44,
    maxInputDelay: 2000,
    allowDrag: false,
    canSeeVisualContent: true,
    canSeeColors: true,
    viewportZoom: 1.0,
    highContrastMode: false,
    maxStepsBeforeFatigue: 15,      // Very low fatigue threshold
    maxDecisionsPerPage: 7,         // Miller's law: 7 ± 2
    requireProgressIndicator: true,
    stepTimeoutMs: 20_000,
    totalTimeoutMs: 240_000,
  },
};

// ─── Constraint Enforcement ──────────────────────────────────────────────────

export interface ActionProposal {
  type: "click" | "type" | "press" | "navigate" | "scroll" | "drag" | "hover" | "wait";
  key?: string;
  selector?: string;
  targetSize?: { width: number; height: number };
  url?: string;
}

export interface ConstraintViolation {
  rule: string;
  description: string;
  blocked: boolean; // true = action CANNOT proceed
}

/**
 * Evaluate whether a proposed action is ALLOWED under the persona's constraints.
 * Returns violations (if any). An action with `blocked: true` violations must not execute.
 */
export function enforceConstraints(
  persona: AgentPersona,
  action: ActionProposal
): ConstraintViolation[] {
  const c = PERSONA_CONSTRAINTS[persona];
  const violations: ConstraintViolation[] = [];

  // Mouse prohibition
  if (!c.allowMouse && (action.type === "click" || action.type === "hover")) {
    violations.push({
      rule: "no-mouse",
      description: `${c.label} cannot use mouse interactions (${action.type})`,
      blocked: true,
    });
  }

  // Drag prohibition
  if (!c.allowDrag && action.type === "drag") {
    violations.push({
      rule: "no-drag",
      description: `${c.label} cannot perform drag operations`,
      blocked: true,
    });
  }

  // Key restriction
  if (action.type === "press" && action.key && c.allowedKeys !== "all") {
    if (!c.allowedKeys.includes(action.key)) {
      violations.push({
        rule: "restricted-key",
        description: `${c.label} cannot press "${action.key}" — only allowed: ${c.allowedKeys.join(", ")}`,
        blocked: true,
      });
    }
  }

  // Target size (motor/low-vision)
  if (c.minTargetSize > 0 && action.type === "click" && action.targetSize) {
    const size = Math.min(action.targetSize.width, action.targetSize.height);
    if (size < c.minTargetSize) {
      violations.push({
        rule: "target-too-small",
        description: `Target is ${size}px — minimum ${c.minTargetSize}px required for ${c.label}`,
        blocked: true,
      });
    }
  }

  return violations;
}

// ─── Sensing / Perception ────────────────────────────────────────────────────

/**
 * Determine what "view" of the page the agent gets based on its persona.
 * Used by the runner to build the LLM prompt with only the allowed information.
 */
export interface PagePerception {
  mode: "visual" | "accessibility-tree" | "zoomed" | "high-contrast";
  includeVisualLayout: boolean;
  includeAccessibilityTree: boolean;
  includeColorInfo: boolean;
  zoom: number;
}

export function getPerception(persona: AgentPersona): PagePerception {
  const c = PERSONA_CONSTRAINTS[persona];

  if (!c.canSeeVisualContent) {
    return {
      mode: "accessibility-tree",
      includeVisualLayout: false,
      includeAccessibilityTree: true,
      includeColorInfo: false,
      zoom: 1.0,
    };
  }

  if (c.viewportZoom > 1.0 || c.highContrastMode) {
    return {
      mode: c.highContrastMode ? "high-contrast" : "zoomed",
      includeVisualLayout: true,
      includeAccessibilityTree: true,
      includeColorInfo: !c.highContrastMode,
      zoom: c.viewportZoom,
    };
  }

  return {
    mode: "visual",
    includeVisualLayout: true,
    includeAccessibilityTree: true,
    includeColorInfo: c.canSeeColors,
    zoom: 1.0,
  };
}

// ─── Cognitive Load Tracking ─────────────────────────────────────────────────

export interface CognitiveState {
  totalSteps: number;
  decisionsThisPage: number;
  fatigued: boolean;
  overwhelmed: boolean;
}

/**
 * Update cognitive state and check for overload conditions.
 */
export function updateCognitiveState(
  persona: AgentPersona,
  current: CognitiveState,
  interactiveElementsOnPage: number
): CognitiveState {
  const c = PERSONA_CONSTRAINTS[persona];
  const newSteps = current.totalSteps + 1;

  return {
    totalSteps: newSteps,
    decisionsThisPage: interactiveElementsOnPage,
    fatigued: newSteps >= c.maxStepsBeforeFatigue,
    overwhelmed: interactiveElementsOnPage > c.maxDecisionsPerPage,
  };
}
