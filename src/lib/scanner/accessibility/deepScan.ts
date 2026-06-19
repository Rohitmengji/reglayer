/**
 * RegLayer — Deep Scan engine
 *
 * WHY: A normal scan runs axe-core ONCE on the initial, static DOM — so it never
 *      sees the ~60% of WCAG issues that live in interactive states (menus,
 *      dialogs, accordions, tabs) or in keyboard behavior. Deep Scan drives the
 *      real headless browser to reveal hidden states and probe keyboard
 *      reachability, surfacing violations a one-shot static scan cannot.
 * WHAT: Two extra passes over the SAME loaded page —
 *        (1) reveal-and-rescan: expand/open interactive components, re-run axe,
 *            and keep only the NEW violations (attributed to the revealed state);
 *        (2) keyboard-reachability heuristics: flag mouse-only/non-focusable
 *            controls (2.1.1) and positive tabindex (2.4.3).
 * HOW: All DOM work runs IN-PAGE via page.evaluate (the one primitive both the
 *      Playwright and serverless-puppeteer pages expose identically), so it is
 *      environment-agnostic. The pure analysis lives in exported, unit-tested
 *      functions; only the thin in-page collectors touch the live browser.
 *
 * HONESTY: revealed-state findings ARE real axe violations and are merged into the
 * scan's violation list. The keyboard checks are HEURISTICS (not axe-verified), so
 * they are reported in a separate block and never silently inflate the axe score.
 */

import type { ViolationImpact } from "@/lib/types";

// ── Shared axe-violation shape (as returned by window.axe.run) ──────────────────

export interface AxeViolationLike {
  id: string;
  impact: string;
  description: string;
  help: string;
  helpUrl: string;
  tags: string[];
  nodes: Array<{ html: string; target: string[]; failureSummary?: string }>;
}

// ── Keyboard heuristics ─────────────────────────────────────────────────────────

/** A focusable/interactive element descriptor collected in-page. */
export interface KbElement {
  selector: string;
  tag: string; // lowercase tagName
  role: string | null; // explicit role attribute
  tabindex: number | null;
  nativelyFocusable: boolean; // a[href]/button/input/select/textarea/etc.
  hasClickAffordance: boolean; // onclick attr or cursor:pointer
  ariaHidden: boolean;
  disabled: boolean;
}

export interface KeyboardFinding {
  ruleId: "keyboard-reachable" | "tabindex-positive" | "focus-trap";
  impact: ViolationImpact;
  issue: string;
  selector: string;
}

/** One observed Tab stop while driving the real keyboard through the page. */
export interface TabStop {
  /** Unique per-element index tag, or null when focus left all tracked elements. */
  idx: string | null;
  /** Human-readable selector of the element focus landed on. */
  selector: string;
}

/**
 * Pure: detect keyboard traps from a real Tab-traversal sequence. A trap is
 * flagged when focus stays on the SAME element (same unique idx) for 3+
 * consecutive Tab presses — i.e. Tab cannot move focus past it (WCAG 2.1.2).
 * Uses the unique idx (not the selector) so two controls that share a selector
 * are never mistaken for stuck focus.
 */
export function detectFocusTraps(steps: TabStop[]): KeyboardFinding[] {
  const findings: KeyboardFinding[] = [];
  const reported = new Set<string>();
  let runIdx: string | null = null;
  let runLen = 0;

  for (const step of steps) {
    if (step.idx !== null && step.idx === runIdx) {
      runLen++;
      if (runLen >= 3 && !reported.has(step.idx)) {
        reported.add(step.idx);
        findings.push({
          ruleId: "focus-trap",
          impact: "critical",
          issue:
            "Keyboard focus appears trapped — repeated Tab presses do not move focus past this element, so keyboard and screen-reader users can get stuck (WCAG 2.1.2 No Keyboard Trap).",
          selector: step.selector,
        });
      }
    } else {
      runIdx = step.idx;
      runLen = step.idx === null ? 0 : 1;
    }
  }

  return findings;
}

const INTERACTIVE_ROLES = new Set([
  "button", "link", "menuitem", "menuitemcheckbox", "menuitemradio",
  "tab", "checkbox", "radio", "switch", "option", "slider", "spinbutton",
]);

/**
 * Pure: derive keyboard-reachability findings from collected elements.
 * - Mouse-only control: interactive but NOT keyboard-focusable (fails 2.1.1).
 * - Positive tabindex: overrides natural focus order (fails/at-risk 2.4.3).
 */
export function analyzeKeyboard(elements: KbElement[]): KeyboardFinding[] {
  const findings: KeyboardFinding[] = [];
  const seen = new Set<string>();

  for (const el of elements) {
    if (el.ariaHidden || el.disabled) continue;

    const focusable = el.nativelyFocusable || (el.tabindex !== null && el.tabindex >= 0);
    const interactive =
      el.nativelyFocusable || el.hasClickAffordance || (el.role !== null && INTERACTIVE_ROLES.has(el.role));

    if (interactive && !focusable) {
      const key = `kb:${el.selector}`;
      if (!seen.has(key)) {
        seen.add(key);
        findings.push({
          ruleId: "keyboard-reachable",
          impact: "serious",
          issue:
            "Interactive element is not keyboard-focusable (mouse-only). Keyboard and screen-reader users cannot operate it — WCAG 2.1.1 Keyboard.",
          selector: el.selector,
        });
      }
    }

    if (el.tabindex !== null && el.tabindex > 0) {
      const key = `ti:${el.selector}`;
      if (!seen.has(key)) {
        seen.add(key);
        findings.push({
          ruleId: "tabindex-positive",
          impact: "moderate",
          issue: `Positive tabindex (${el.tabindex}) forces an unnatural focus order and is brittle — WCAG 2.4.3 Focus Order.`,
          selector: el.selector,
        });
      }
    }
  }

  return findings;
}

// ── Revealed-state violation dedup ──────────────────────────────────────────────

/** Stable identity for a violation occurrence: rule + the node's first target. */
function violationKeys(v: AxeViolationLike): string[] {
  if (!v.nodes || v.nodes.length === 0) return [`${v.id}::`];
  return v.nodes.map((n) => `${v.id}::${(n.target && n.target[0]) || ""}`);
}

/**
 * Pure: return the violations present in `revealed` that were NOT already in
 * `base` (by rule + node target), so reveal-pass results only add genuinely new
 * findings rather than re-reporting what the initial scan already caught.
 */
export function dedupeNewViolations(
  base: AxeViolationLike[],
  revealed: AxeViolationLike[],
): AxeViolationLike[] {
  const baseKeys = new Set<string>();
  for (const v of base) for (const k of violationKeys(v)) baseKeys.add(k);

  const out: AxeViolationLike[] = [];
  for (const v of revealed) {
    const newNodes = v.nodes.filter((n) => !baseKeys.has(`${v.id}::${(n.target && n.target[0]) || ""}`));
    // If the whole rule is new, or some nodes are new, keep only the new nodes.
    if (newNodes.length > 0) {
      out.push({ ...v, nodes: newNodes });
    } else if (!base.some((b) => b.id === v.id)) {
      out.push(v);
    }
  }
  return out;
}

// ── Deep-scan report ────────────────────────────────────────────────────────────

export interface DeepScanReport {
  /** Whether the deep passes ran. */
  ran: boolean;
  /** How many interactive states were revealed before the re-scan. */
  statesRevealed: number;
  /** Count of NEW axe violations surfaced only after revealing interactive content. */
  revealedViolationCount: number;
  /** Keyboard findings: reachability heuristics + real Tab-driven focus traps (not in the axe score). */
  keyboardFindings: KeyboardFinding[];
  /** How many distinct Tab stops were traversed (0 when the keyboard couldn't be driven). */
  tabStopsTraversed: number;
  /** Honest notes about partial/interrupted coverage. */
  notes: string[];
}

/** Minimal page surface Deep Scan needs — satisfied by Playwright & puppeteer pages. */
export interface EvaluablePage {
  evaluate<T>(fn: (...args: unknown[]) => T | Promise<T>, ...args: unknown[]): Promise<T>;
}

/** Page that can also drive the real keyboard (both Playwright & puppeteer pages can). */
export interface KeyboardCapablePage extends EvaluablePage {
  keyboard?: { press: (key: string) => Promise<void> };
}

/**
 * Reveal hidden interactive content in-page (bounded), so a subsequent axe run
 * can see menus/dialogs/accordions/tabs the initial static scan missed. Returns
 * the number of states revealed. Best-effort and time-bounded by the caller.
 */
async function revealHiddenContent(page: EvaluablePage, maxTriggers: number): Promise<number> {
  return page.evaluate((max) => {
    const limit = typeof max === "number" ? max : 25;
    let revealed = 0;

    const isVisible = (el: Element): boolean => {
      const s = window.getComputedStyle(el as HTMLElement);
      return s.display !== "none" && s.visibility !== "hidden";
    };

    // 1. Native <details> — open them all.
    document.querySelectorAll("details:not([open])").forEach((d) => {
      (d as HTMLDetailsElement).open = true;
      revealed++;
    });

    // 2. ARIA disclosure / expandable controls (menus, accordions, comboboxes).
    const expandables = Array.from(
      document.querySelectorAll('[aria-expanded="false"]')
    ).filter((el) => isVisible(el));
    for (const el of expandables) {
      if (revealed >= limit) break;
      try {
        (el as HTMLElement).click();
        revealed++;
      } catch {
        /* ignore individual trigger failures */
      }
    }

    // 3. First-level popup triggers that don't use aria-expanded.
    const popupTriggers = Array.from(
      document.querySelectorAll('[aria-haspopup]:not([aria-expanded])')
    ).filter((el) => isVisible(el)).slice(0, 5);
    for (const el of popupTriggers) {
      if (revealed >= limit) break;
      try {
        (el as HTMLElement).click();
        revealed++;
      } catch {
        /* ignore */
      }
    }

    return revealed;
  }, maxTriggers);
}

/** Collect focusable/interactive element descriptors in-page for keyboard analysis. */
async function collectKeyboardElements(page: EvaluablePage, maxElements: number): Promise<KbElement[]> {
  return page.evaluate((max) => {
    const limit = typeof max === "number" ? max : 400;
    const NATIVE = new Set(["a", "button", "input", "select", "textarea", "summary"]);

    // A reasonably stable, short selector for reporting.
    const selectorFor = (el: Element): string => {
      if (el.id) return `#${el.id}`;
      const tag = el.tagName.toLowerCase();
      const cls = (el.getAttribute("class") || "").trim().split(/\s+/).filter(Boolean).slice(0, 2);
      return cls.length ? `${tag}.${cls.join(".")}` : tag;
    };

    const candidates = Array.from(
      document.querySelectorAll(
        "a,button,input,select,textarea,summary,[role],[tabindex],[onclick]"
      )
    ).slice(0, limit);

    const out: Array<Record<string, unknown>> = [];
    for (const el of candidates) {
      const tag = el.tagName.toLowerCase();
      const tabindexAttr = el.getAttribute("tabindex");
      const tabindex = tabindexAttr === null ? null : Number.parseInt(tabindexAttr, 10);
      const role = el.getAttribute("role");
      const nativelyFocusable =
        (tag === "a" && el.hasAttribute("href")) ||
        (NATIVE.has(tag) && tag !== "a" && !el.hasAttribute("disabled"));
      const style = window.getComputedStyle(el as HTMLElement);
      const hasClickAffordance = el.hasAttribute("onclick") || style.cursor === "pointer";
      const ariaHidden = el.getAttribute("aria-hidden") === "true";
      const disabled = el.hasAttribute("disabled") || el.getAttribute("aria-disabled") === "true";

      out.push({
        selector: selectorFor(el),
        tag,
        role: role,
        tabindex: Number.isNaN(tabindex as number) ? null : tabindex,
        nativelyFocusable,
        hasClickAffordance,
        ariaHidden,
        disabled,
      });
    }
    return out;
  }, maxElements) as unknown as Promise<KbElement[]>;
}

/**
 * Drive the REAL keyboard: Tab through the page (bounded) and detect focus traps
 * (WCAG 2.1.2). Tags every focusable element with a unique data attribute first,
 * so genuinely-stuck focus is never confused with same-looking siblings. Returns
 * ran:false (a no-op) when the environment can't drive the keyboard.
 */
async function auditFocusTraps(
  page: KeyboardCapablePage,
  maxTabs: number,
): Promise<{ ran: boolean; findings: KeyboardFinding[]; stops: number }> {
  const kb = page.keyboard;
  if (!kb || typeof kb.press !== "function") {
    return { ran: false, findings: [], stops: 0 };
  }

  // Tag focusable elements with a unique index, and clear current focus so the
  // first Tab lands on the first focusable element.
  const focusableCount = await page.evaluate(() => {
    const sel =
      'a[href],button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea:not([disabled]),summary,[tabindex]:not([tabindex="-1"]),[contenteditable="true"]';
    const els = Array.from(document.querySelectorAll(sel));
    els.forEach((el, i) => el.setAttribute("data-rl-fidx", String(i)));
    (document.activeElement as HTMLElement | null)?.blur?.();
    return els.length;
  });

  if (!focusableCount) return { ran: true, findings: [], stops: 0 };

  const steps: TabStop[] = [];
  const cap = Math.min(maxTabs, focusableCount + 5);
  for (let i = 0; i < cap; i++) {
    await kb.press("Tab");
    const step = (await page.evaluate(() => {
      const el = document.activeElement as HTMLElement | null;
      if (!el || el === document.body) return { idx: null, selector: "" };
      return { idx: el.getAttribute("data-rl-fidx"), selector: el.id ? `#${el.id}` : el.tagName.toLowerCase() };
    })) as TabStop;
    steps.push(step);
  }

  const distinctStops = new Set(steps.map((s) => s.idx).filter((x): x is string => x !== null)).size;
  return { ran: true, findings: detectFocusTraps(steps), stops: distinctStops };
}

/**
 * Run the deep passes over an already-loaded page.
 *
 * @param page     The live page (already navigated + hydrated + scanned once).
 * @param runAxe   Closure that runs axe on the CURRENT page state and returns its
 *                 violations (reuses the caller's already-injected axe).
 * @param baseViolations  The initial-state violations, for dedup.
 * @returns the deep report + the NEW revealed-state axe violations to merge in.
 */
export async function runDeepPasses(
  page: EvaluablePage,
  runAxe: () => Promise<AxeViolationLike[]>,
  baseViolations: AxeViolationLike[],
  opts?: { maxTriggers?: number; maxElements?: number; maxTabs?: number },
): Promise<{ report: DeepScanReport; extraViolations: AxeViolationLike[] }> {
  const notes: string[] = [];
  let statesRevealed = 0;
  let extraViolations: AxeViolationLike[] = [];
  let tabStopsTraversed = 0;

  // Pass 1: reveal-and-rescan.
  try {
    statesRevealed = await revealHiddenContent(page, opts?.maxTriggers ?? 25);
    if (statesRevealed > 0) {
      const afterViolations = await runAxe();
      extraViolations = dedupeNewViolations(baseViolations, afterViolations);
    } else {
      notes.push("No collapsed/expandable interactive content was found to reveal.");
    }
  } catch {
    notes.push("Interactive-state sweep was interrupted; deep results may be partial.");
  }

  // Pass 2: keyboard-reachability heuristics (static, in-page).
  let keyboardFindings: KeyboardFinding[] = [];
  try {
    const elements = await collectKeyboardElements(page, opts?.maxElements ?? 400);
    keyboardFindings = analyzeKeyboard(elements);
  } catch {
    notes.push("Keyboard-reachability audit was interrupted.");
  }

  // Pass 3: real Tab-driven focus-trap detection (where the keyboard can be driven).
  try {
    const ft = await auditFocusTraps(page as KeyboardCapablePage, opts?.maxTabs ?? 60);
    if (ft.ran) {
      tabStopsTraversed = ft.stops;
      if (ft.findings.length > 0) keyboardFindings = [...keyboardFindings, ...ft.findings];
    } else {
      notes.push("Tab-driven focus-trap check was unavailable in this environment.");
    }
  } catch {
    notes.push("Tab-driven focus-trap check was interrupted.");
  }

  return {
    report: {
      ran: true,
      statesRevealed,
      revealedViolationCount: extraViolations.reduce((n, v) => n + Math.max(1, v.nodes.length), 0),
      keyboardFindings,
      tabStopsTraversed,
      notes,
    },
    extraViolations,
  };
}
