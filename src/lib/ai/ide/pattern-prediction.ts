/**
 * RegLayer — Interaction Pattern Prediction
 *
 * "Predict accessibility issues before they occur" sounds speculative. It is not.
 *
 * The moment a developer starts building a KNOWN interaction pattern — a dialog, tabs,
 * a menu — the full set of accessibility requirements is already determined by the ARIA
 * Authoring Practices. There is no need to wait for them to get it wrong and then
 * report a violation: the requirements can be offered while the component is still being
 * written, when acting on them costs minutes rather than a remediation cycle.
 *
 * This is a categorically better developer experience than diagnosis. A linter tells you
 * what you broke. This tells you what you are about to need.
 *
 * A WORKED EXAMPLE FROM THIS CODEBASE: `components/ai/ChatPanel.tsx` renders a backdrop
 * and a slide-in panel — structurally a modal dialog — but is marked
 * `role="complementary"`. It shipped without Escape-to-close and without returning focus
 * to the trigger on close. Every one of those was predictable from the first render of a
 * backdrop; none of them is reported by a scanner, because a scanner sees a landmark
 * behaving exactly as a landmark should.
 */

export type UiPattern = "dialog" | "tabs" | "menu" | "disclosure";

export interface PatternRequirement {
  id: string;
  /** What is required, in one line. */
  description: string;
  /** WCAG criteria this satisfies. Empty for APG conventions with no direct criterion. */
  wcag: string[];
  /** Why it matters — surfaced on demand, not by default. */
  rationale: string;
  /** True when the current source appears to satisfy it. */
  satisfied: boolean;
  /**
   * Requirements a scanner cannot verify, because they are behavioural rather than
   * structural. These are the ones that reach production.
   */
  staticallyUndetectable: boolean;
}

interface RequirementSpec {
  id: string;
  description: string;
  wcag: string[];
  rationale: string;
  staticallyUndetectable: boolean;
  /** Heuristic evidence that the requirement is handled. */
  satisfiedBy: RegExp;
}

const PATTERN_SIGNALS: Record<UiPattern, RegExp[]> = {
  dialog: [
    /role=["'](?:alert)?dialog["']/,
    /aria-modal/,
    // A backdrop plus a positioned panel IS a dialog, whatever the role says.
    /\b(?:backdrop|overlay|scrim)\b/i,
    // `\w*` captures CamelCase suffixes such as ConfirmModal or SlideOverDrawer.
    // "Sheet" is deliberately excluded — it would match `styleSheet` in CSS-in-JS.
    /\b\w*(?:Modal|Dialog|Drawer|Lightbox)\b/,
  ],
  tabs: [/role=["']tab(?:list|panel)?["']/, /\b\w*Tabs\b/],
  menu: [/role=["']menu(?:bar|item)?["']/, /\b\w*(?:Dropdown|ContextMenu)\b/],
  disclosure: [/aria-expanded/, /\b\w*(?:Accordion|Collapsible)\b/],
};

const REQUIREMENTS: Record<UiPattern, RequirementSpec[]> = {
  dialog: [
    {
      id: "dialog-role",
      description: 'Use role="dialog" with aria-modal="true"',
      wcag: ["4.1.2"],
      rationale:
        "A backdrop that visually blocks the page does not tell assistive technology " +
        "anything. Without the role, a screen reader user can still navigate into the " +
        "content behind it, which is invisible to them and unreachable by mouse.",
      staticallyUndetectable: false,
      satisfiedBy: /aria-modal=["']true["']/,
    },
    {
      id: "dialog-name",
      description: "Give the dialog an accessible name via aria-labelledby",
      wcag: ["4.1.2", "2.4.6"],
      rationale:
        "On open, a screen reader announces the dialog's name. Without one it announces " +
        '"dialog" and the user must explore to discover what opened.',
      staticallyUndetectable: false,
      satisfiedBy: /aria-labelledby|aria-label=/,
    },
    {
      id: "dialog-focus-in",
      description: "Move focus into the dialog when it opens",
      wcag: ["2.4.3"],
      rationale:
        "Focus otherwise stays on the trigger behind the backdrop. A keyboard user tabs " +
        "through the page underneath while the dialog sits open and unreachable.",
      staticallyUndetectable: true,
      satisfiedBy: /\.focus\(\)/,
    },
    {
      id: "dialog-focus-trap",
      description: "Trap focus inside the dialog while it is open",
      wcag: ["2.4.3"],
      rationale:
        "Without a trap, Tab walks out of the dialog into content the user cannot see, " +
        "with no indication they have left.",
      staticallyUndetectable: true,
      satisfiedBy: /focusTrap|trapFocus|FocusLock|inert\b/,
    },
    {
      id: "dialog-escape",
      description: "Close the dialog on Escape",
      wcag: ["2.1.2"],
      rationale:
        "Required by the ARIA Authoring Practices. Without it a keyboard user must find " +
        "and tab to the close button, which is a keyboard trap in everything but name.",
      staticallyUndetectable: true,
      satisfiedBy: /["']Escape["']/,
    },
    {
      id: "dialog-focus-restore",
      description: "Return focus to the trigger when the dialog closes",
      wcag: ["2.4.3"],
      rationale:
        "Focus otherwise falls to <body> and the user restarts from the top of the page, " +
        "losing their place entirely. This is the single most commonly missed step.",
      staticallyUndetectable: true,
      satisfiedBy: /restoreFocus|previouslyFocused|restoreFocusRef|activeElement/,
    },
  ],

  tabs: [
    {
      id: "tabs-roles",
      description: 'Apply role="tablist", role="tab", and role="tabpanel"',
      wcag: ["4.1.2"],
      rationale: "Without the roles, tabs are announced as an unrelated list of buttons.",
      staticallyUndetectable: false,
      satisfiedBy: /role=["']tablist["']/,
    },
    {
      id: "tabs-selected",
      description: "Track the active tab with aria-selected",
      wcag: ["4.1.2"],
      rationale: "Visual highlighting alone does not tell a screen reader which tab is active.",
      staticallyUndetectable: false,
      satisfiedBy: /aria-selected/,
    },
    {
      id: "tabs-arrow-keys",
      description: "Move between tabs with arrow keys, not Tab",
      wcag: ["2.1.1"],
      rationale:
        "The APG tab pattern places exactly one tab in the tab order; arrows move " +
        "between them. Making every tab tabbable forces a keyboard user through all of " +
        "them to reach the panel.",
      staticallyUndetectable: true,
      satisfiedBy: /ArrowRight|ArrowLeft/,
    },
  ],

  menu: [
    {
      id: "menu-roles",
      description: 'Apply role="menu" and role="menuitem"',
      wcag: ["4.1.2"],
      rationale: "Without them a menu is announced as a generic list.",
      staticallyUndetectable: false,
      satisfiedBy: /role=["']menuitem["']/,
    },
    {
      id: "menu-arrow-keys",
      description: "Support arrow-key navigation and Escape to close",
      wcag: ["2.1.1"],
      rationale: "Menus are expected to respond to arrows; Tab should leave the menu entirely.",
      staticallyUndetectable: true,
      satisfiedBy: /ArrowDown|ArrowUp/,
    },
  ],

  disclosure: [
    {
      id: "disclosure-expanded",
      description: "Reflect open state with aria-expanded on the trigger",
      wcag: ["4.1.2"],
      rationale:
        "A rotating chevron communicates state visually and nothing programmatically.",
      staticallyUndetectable: false,
      satisfiedBy: /aria-expanded/,
    },
    {
      id: "disclosure-controls",
      description: "Point the trigger at its content with aria-controls",
      wcag: ["1.3.1"],
      rationale: "Lets assistive technology associate the trigger with what it reveals.",
      staticallyUndetectable: false,
      satisfiedBy: /aria-controls/,
    },
  ],
};

/**
 * Recognise which interaction pattern is being built.
 *
 * Structure is weighted over naming: a backdrop with a positioned panel IS a dialog
 * whether or not it says so. `ChatPanel.tsx` declares `role="complementary"` and is
 * nonetheless a modal dialog on small screens.
 */
export function detectPattern(source: string): UiPattern | null {
  for (const [pattern, signals] of Object.entries(PATTERN_SIGNALS) as [UiPattern, RegExp[]][]) {
    if (signals.some((signal) => signal.test(source))) return pattern;
  }
  return null;
}

/**
 * Predict everything this pattern will require, marking what is already handled.
 *
 * Returned in full rather than filtered to gaps: a developer mid-build benefits from
 * seeing the complete contract, and satisfied items confirm the parts already right.
 */
export function predictRequirements(
  pattern: UiPattern,
  source: string,
): PatternRequirement[] {
  return REQUIREMENTS[pattern].map((spec) => ({
    id: spec.id,
    description: spec.description,
    wcag: spec.wcag,
    rationale: spec.rationale,
    satisfied: spec.satisfiedBy.test(source),
    staticallyUndetectable: spec.staticallyUndetectable,
  }));
}

export interface PatternForecast {
  pattern: UiPattern;
  requirements: PatternRequirement[];
  missing: PatternRequirement[];
  /**
   * Missing requirements no scanner will ever report.
   *
   * These are the ones that reach production: a scanner sees a static DOM, so it cannot
   * observe that Escape does nothing or that focus never returns to the trigger.
   */
  invisibleToScanners: PatternRequirement[];
  summary: string;
}

export function forecast(source: string): PatternForecast | null {
  const pattern = detectPattern(source);
  if (!pattern) return null;

  const requirements = predictRequirements(pattern, source);
  const missing = requirements.filter((r) => !r.satisfied);
  const invisibleToScanners = missing.filter((r) => r.staticallyUndetectable);

  const summary =
    missing.length === 0
      ? `This ${pattern} meets the ARIA Authoring Practices requirements.`
      : `Building a ${pattern}: ${missing.length} of ${requirements.length} requirements ` +
        `still to handle` +
        (invisibleToScanners.length > 0
          ? `, ${invisibleToScanners.length} of which no scanner will catch.`
          : ".");

  return { pattern, requirements, missing, invisibleToScanners, summary };
}
