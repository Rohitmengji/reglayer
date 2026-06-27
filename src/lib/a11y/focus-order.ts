/**
 * RegLayer — focus-order / tabindex linter (WCAG 2.4.3 / 2.1.1)
 *
 * Computes the effective keyboard tab sequence from a list of elements and flags
 * the classic traps: positive tabindex (forces a brittle manual order that
 * diverges from the DOM), and focusable-but-hidden elements (keyboard users land
 * on invisible controls). Pure + deterministic.
 */
export type FocusSeverity = "error" | "warning";

export interface FocusElement {
  label?: string;
  tabindex?: number;
  /** Natively focusable (a, button, input, select, textarea, …). */
  interactive?: boolean;
  visible?: boolean; // default true
}

export interface FocusIssue {
  index: number; // -1 for document-level
  code: string;
  severity: FocusSeverity;
  message: string;
}

export interface FocusReport {
  ok: boolean;
  issues: FocusIssue[];
  /** The order keyboard focus actually visits, in DOM-index terms. */
  tabSequence: { index: number; label?: string; tabindex: number }[];
}

export function analyzeFocusOrder(elements: FocusElement[]): FocusReport {
  const issues: FocusIssue[] = [];

  elements.forEach((el, index) => {
    const ti = el.tabindex;
    const visible = el.visible ?? true;
    if (ti !== undefined && ti > 0) {
      issues.push({ index, code: "positive-tabindex", severity: "warning", message: `tabindex="${ti}" forces a manual tab order that breaks as the page changes — prefer DOM order with tabindex="0" or no tabindex.` });
    }
    const focusable = (ti !== undefined && ti >= 0) || (ti === undefined && !!el.interactive);
    if (!visible && focusable) {
      issues.push({ index, code: "focusable-hidden", severity: "error", message: "Hidden element is still in the tab order — keyboard users will focus an invisible control. Remove it from the sequence while hidden." });
    }
  });

  // Effective tab order: positive tabindex first (asc, then DOM order), then
  // tabindex=0 / natively-focusable elements in DOM order. Negative = skipped.
  const inFlow = elements.map((el, index) => ({ el, index })).filter(({ el }) => (el.visible ?? true));
  const positives = inFlow
    .filter(({ el }) => (el.tabindex ?? 0) > 0)
    .sort((a, b) => (a.el.tabindex! - b.el.tabindex!) || (a.index - b.index));
  const naturals = inFlow.filter(({ el }) => el.tabindex === 0 || (el.tabindex === undefined && !!el.interactive));

  const tabSequence = [...positives, ...naturals].map(({ el, index }) => ({ index, label: el.label, tabindex: el.tabindex ?? 0 }));

  if (positives.length > 0) {
    issues.push({ index: -1, code: "order-mismatch", severity: "warning", message: "Positive tabindex makes the keyboard order differ from the visual/DOM order — confirm the resulting sequence still reads logically." });
  }

  return { ok: !issues.some((i) => i.severity === "error"), issues, tabSequence };
}
