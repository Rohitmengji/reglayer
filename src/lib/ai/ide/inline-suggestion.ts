/**
 * RegLayer — Inline Accessibility Suggestions
 *
 * The in-editor flow: a developer writes a button, the assistant notices, offers a fix,
 * they accept, done.
 *
 * THIS IS A DIFFERENT PROBLEM FROM PR REVIEW, in two ways that dominate the design.
 *
 * 1. THE CODE IS INCOMPLETE. At PR time the file parses. Mid-typing it does not:
 *    `<butt`, `<button onCl`, `<button>` with the label not yet written. Diagnosing
 *    half-written code produces false positives, and an assistant that is wrong while
 *    you type is one you disable within a day.
 *
 * 2. THE LATENCY BUDGET IS ~100ms. That rules out a model call. Everything here is
 *    local, synchronous, and deterministic — which it can afford to be, because
 *    "does this element have an accessible name" is a structural question, not a
 *    judgement.
 *
 * THE SUPPRESSION RULES MATTER MORE THAN THE DETECTION. Detecting a missing name is
 * trivial. Knowing when NOT to say so is what separates a tolerable assistant from one
 * that gets turned off. The dominant case: a developer types `<button>` and is about to
 * type "Save". Firing at that instant is maximally annoying and always wrong.
 */

export interface ElementSnapshot {
  tag: string;
  /** `true` for valueless attributes; string for the literal or expression source. */
  attributes: Record<string, string | true>;
  /** Text between the tags. `null` when the closing tag has not been typed yet. */
  children: string | null;
  selfClosing: boolean;
}

export type SuppressionReason =
  /** The element is still being typed — no closing bracket or tag yet. */
  | "incomplete"
  /** Closed opening tag but no closing tag: the label is probably being typed right now. */
  | "awaiting-content"
  /** An accessible name is already present. */
  | "has-name"
  /** This element does not require a name. */
  | "not-applicable";

export interface SuggestionDecision {
  suggest: boolean;
  reason?: SuppressionReason;
}

/** Elements whose accessible name comes from their content. */
const NAME_FROM_CONTENT = new Set(["button", "a", "summary", "th", "legend", "caption"]);

/** Attributes that can supply an accessible name. */
const NAMING_ATTRIBUTES = ["aria-label", "aria-labelledby", "title"];

/**
 * Whether an element already has an accessible name.
 *
 * CHILD ELEMENTS DO NOT COUNT. `<button><XIcon /></button>` has children but no name:
 * an icon contributes nothing to the accessibility tree. Treating any non-empty content
 * as a name would silence the assistant on the single most common case it exists for.
 *
 * Expressions DO count. `<button>{label}</button>` almost certainly renders text, and
 * the assistant cannot evaluate it — claiming the name is missing would be a false
 * positive on correct code.
 */
export function hasAccessibleName(element: ElementSnapshot): boolean {
  if (NAMING_ATTRIBUTES.some((attr) => element.attributes[attr] !== undefined)) return true;
  if (element.children === null) return false;

  // An expression may render text, so its presence is enough.
  if (/\{[^}]*\}/.test(element.children)) return true;

  // Read the text BETWEEN the nested elements rather than deleting the elements from
  // the string. Removal is unsound — one pass over `<scr<b>ipt>` leaves `ipt>`, and on
  // other inputs it can splice a live tag back together, which is why CodeQL flags
  // strip-by-replace as incomplete sanitization. Splitting yields the segments and
  // never rebuilds markup, and a boolean is all this function ever needed.
  return element.children
    .split(/<[^>]*>/)
    .some((segment) => segment.trim().length > 0);
}

/**
 * Decide whether to surface a suggestion for this element right now.
 *
 * Every branch that returns `false` is a case where firing would be noise. They are
 * checked before detection because being quiet at the wrong moment is the failure mode
 * that gets the feature disabled.
 */
export function shouldSuggest(element: ElementSnapshot): SuggestionDecision {
  if (!NAME_FROM_CONTENT.has(element.tag)) {
    return { suggest: false, reason: "not-applicable" };
  }

  if (hasAccessibleName(element)) {
    return { suggest: false, reason: "has-name" };
  }

  // A self-closing <button /> is finished and genuinely nameless. Anything else with no
  // closing tag is mid-edit: the developer is about to type the label.
  if (!element.selfClosing && element.children === null) {
    return { suggest: false, reason: "awaiting-content" };
  }

  return { suggest: true };
}

// ── Code actions ─────────────────────────────────────────────────────────────

export interface CodeAction {
  title: string;
  /** LSP-style snippet. `$1` is a tab stop, `$0` the final cursor position. */
  snippet: string;
  /**
   * Whether accepting completes the fix, or leaves the developer something to write.
   *
   * `button-name` is never `complete`: the editor cannot know whether this button
   * closes a dialog or submits a form. Auto-filling a guess is how tools emit
   * `aria-label="Button"` at scale — the linter goes green and the product gets worse.
   */
  kind: "complete" | "scaffold";
  /** Shown alongside the action so the developer knows what is expected of them. */
  hint: string;
}

/**
 * Build the offered fixes, best first.
 *
 * Visible text is offered ABOVE `aria-label` deliberately. It serves every user, needs
 * no ARIA, cannot drift out of sync with what is rendered, and keeps the control usable
 * by voice — which `aria-label` alone does not.
 */
export function buildNameActions(element: ElementSnapshot): CodeAction[] {
  if (!shouldSuggest(element).suggest) return [];

  const actions: CodeAction[] = [];

  if (!element.selfClosing) {
    actions.push({
      title: "Add visible label",
      snippet: `<${element.tag}>\${1:Label}</${element.tag}>`,
      kind: "scaffold",
      hint: "Preferred — a visible label serves everyone and needs no ARIA.",
    });
  }

  actions.push({
    title: "Add aria-label (icon-only control)",
    // The cursor lands INSIDE the empty string, so the developer's next keystroke is
    // the label. That is the whole interaction.
    snippet: `aria-label="\${1:describe the action}"`,
    kind: "scaffold",
    hint: "Describe the action and its target, e.g. \"Close dialog\" — not \"Close\".",
  });

  return actions;
}

// ── Timing ───────────────────────────────────────────────────────────────────

/**
 * Idle time before a suggestion is offered.
 *
 * Long enough that it never fires between keystrokes in a word; short enough to arrive
 * while the developer is still looking at the line they wrote.
 */
export const SETTLE_DELAY_MS = 400;

/**
 * Whether enough has settled to diagnose.
 *
 * Two independent conditions, both required: the developer has paused, AND the element
 * is structurally finished. Either alone produces suggestions on half-written code.
 */
export function isReadyToDiagnose(
  msSinceLastKeystroke: number,
  element: ElementSnapshot,
): boolean {
  if (msSinceLastKeystroke < SETTLE_DELAY_MS) return false;
  return element.selfClosing || element.children !== null;
}

// ── Lightweight extraction ───────────────────────────────────────────────────

const OPEN_TAG = /^<([a-zA-Z][\w-]*)((?:\s+[^<>]*?)?)(\/?)>/;
const ATTRIBUTE = /([a-zA-Z-]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|\{([^}]*)\}))?/g;

/**
 * Parse a single JSX element from source.
 *
 * Deliberately shallow. A real language server already holds an incremental AST and
 * should use it; this exists so the DECISION logic above can be developed and tested
 * without one, and returns null the moment the input is not a complete opening tag —
 * which is exactly the `incomplete` case the suppression rules depend on.
 */
export function parseElement(source: string): ElementSnapshot | null {
  const match = source.trimStart().match(OPEN_TAG);
  if (!match) return null;

  const [openTag, tag, attrSource, selfClose] = match;
  const attributes: Record<string, string | true> = {};

  for (const attr of (attrSource ?? "").matchAll(ATTRIBUTE)) {
    const [, name, dq, sq, expr] = attr;
    attributes[name] = dq ?? sq ?? expr ?? true;
  }

  if (selfClose === "/") {
    return { tag, attributes, children: null, selfClosing: true };
  }

  const rest = source.trimStart().slice(openTag.length);
  const closeIndex = rest.indexOf(`</${tag}>`);

  return {
    tag,
    attributes,
    // null signals "closing tag not typed yet", which suppression treats as mid-edit.
    children: closeIndex === -1 ? null : rest.slice(0, closeIndex),
    selfClosing: false,
  };
}
