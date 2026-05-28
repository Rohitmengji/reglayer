/**
 * ---------------------------------------------------------
 * RegLayer — Screen Reader Narration Engine
 * ---------------------------------------------------------
 *
 * Simulates how a screen reader (NVDA/VoiceOver/JAWS) would
 * traverse and announce a web page.
 *
 * This captures the accessibility tree, walks it in reading
 * order, and generates narration steps — what the screen
 * reader would speak for each element.
 *
 * Output is a sequence of NarrationStep objects that power
 * the visual/audio playback in the frontend.
 * ---------------------------------------------------------
 */

import "server-only";

import type { Page } from "playwright-core";

export interface NarrationStep {
  /** Sequential index */
  index: number;
  /** What the screen reader would announce */
  announcement: string;
  /** ARIA role of the element */
  role: string;
  /** Accessible name */
  name: string;
  /** CSS selector to highlight in the UI */
  selector: string;
  /** Bounding box for visual overlay (relative to viewport) */
  bounds: { x: number; y: number; width: number; height: number } | null;
  /** Element level/depth in tree */
  level: number;
  /** Whether this is a landmark/heading (structural) */
  isLandmark: boolean;
  /** Whether this is focusable/interactive */
  isInteractive: boolean;
  /** Additional state info (checked, expanded, etc.) */
  states: string[];
}

export interface ScreenReaderSnapshot {
  url: string;
  pageTitle: string;
  steps: NarrationStep[];
  totalElements: number;
  landmarks: number;
  headings: number;
  interactiveElements: number;
  capturedAt: string;
}

const ROLE_ANNOUNCEMENTS: Record<string, string> = {
  heading: "heading",
  link: "link",
  button: "button",
  textbox: "edit",
  checkbox: "checkbox",
  radio: "radio button",
  combobox: "combo box",
  listbox: "list box",
  option: "option",
  menu: "menu",
  menuitem: "menu item",
  menubar: "menu bar",
  tab: "tab",
  tabpanel: "tab panel",
  tablist: "tab list",
  dialog: "dialog",
  alert: "alert",
  alertdialog: "alert dialog",
  navigation: "navigation",
  main: "main",
  banner: "banner",
  contentinfo: "content info",
  complementary: "complementary",
  region: "region",
  form: "form",
  search: "search",
  img: "image",
  figure: "figure",
  list: "list",
  listitem: "list item",
  table: "table",
  row: "row",
  cell: "cell",
  columnheader: "column header",
  rowheader: "row header",
  separator: "separator",
  slider: "slider",
  spinbutton: "spin button",
  switch: "switch",
  tree: "tree",
  treeitem: "tree item",
  progressbar: "progress bar",
  status: "status",
  tooltip: "tooltip",
  article: "article",
  group: "group",
};

/**
 * Capture the full screen reader narration for a page.
 * Must be called while a Playwright page is open and loaded.
 *
 * Uses page.evaluate() to walk the DOM accessibility tree in-browser,
 * which works on both Playwright and Puppeteer environments.
 */
export async function captureNarration(page: Page): Promise<ScreenReaderSnapshot> {
  const pageTitle = await page.title();
  const url = page.url();

  // Execute in-browser: walk the DOM, compute accessible names/roles, reading order
  const rawSteps = await page.evaluate(() => {
    const steps: Array<{
      role: string;
      name: string;
      value: string;
      level: number;
      tag: string;
      isLandmark: boolean;
      isInteractive: boolean;
      states: string[];
      bounds: { x: number; y: number; width: number; height: number } | null;
      selector: string;
    }> = [];

    const landmarkRoles = new Set([
      "navigation", "main", "banner", "contentinfo",
      "complementary", "region", "form", "search",
    ]);

    const interactiveRoles = new Set([
      "link", "button", "textbox", "checkbox", "radio",
      "combobox", "listbox", "option", "menu", "menuitem",
      "tab", "slider", "spinbutton", "switch",
    ]);

    // Tag-to-implicit-role mapping
    const implicitRoles: Record<string, string> = {
      A: "link", BUTTON: "button", INPUT: "textbox",
      SELECT: "combobox", TEXTAREA: "textbox", IMG: "img",
      H1: "heading", H2: "heading", H3: "heading",
      H4: "heading", H5: "heading", H6: "heading",
      NAV: "navigation", MAIN: "main", HEADER: "banner",
      FOOTER: "contentinfo", ASIDE: "complementary",
      FORM: "form", TABLE: "table", UL: "list", OL: "list",
      LI: "listitem", SECTION: "region", ARTICLE: "article",
      DIALOG: "dialog", DETAILS: "group", SUMMARY: "button",
      PROGRESS: "progressbar", METER: "meter",
    };

    function getAccessibleName(el: HTMLElement): string {
      // aria-labelledby
      const labelledBy = el.getAttribute("aria-labelledby");
      if (labelledBy) {
        const parts = labelledBy.split(/\s+/).map((id) => {
          const ref = document.getElementById(id);
          return ref?.textContent?.trim() || "";
        }).filter(Boolean);
        if (parts.length) return parts.join(" ");
      }

      // aria-label
      const ariaLabel = el.getAttribute("aria-label");
      if (ariaLabel) return ariaLabel;

      // alt for images
      if (el.tagName === "IMG") {
        return (el as HTMLImageElement).alt || "";
      }

      // label for inputs
      if (el instanceof HTMLInputElement || el instanceof HTMLSelectElement || el instanceof HTMLTextAreaElement) {
        const id = el.id;
        if (id) {
          const label = document.querySelector(`label[for="${CSS.escape(id)}"]`);
          if (label) return label.textContent?.trim() || "";
        }
      }

      // title attribute
      const title = el.getAttribute("title");
      if (title) return title;

      // Text content for simple elements
      const tag = el.tagName;
      if (["A", "BUTTON", "H1", "H2", "H3", "H4", "H5", "H6", "LI", "SUMMARY", "LABEL"].includes(tag)) {
        return el.textContent?.trim().slice(0, 200) || "";
      }

      return "";
    }

    function getRole(el: HTMLElement): string {
      const explicit = el.getAttribute("role");
      if (explicit) return explicit;
      // Input type variations
      if (el.tagName === "INPUT") {
        const type = (el as HTMLInputElement).type;
        if (type === "checkbox") return "checkbox";
        if (type === "radio") return "radio";
        if (type === "range") return "slider";
        if (type === "submit" || type === "button" || type === "reset") return "button";
        return "textbox";
      }
      return implicitRoles[el.tagName] || "generic";
    }

    function getLevel(el: HTMLElement): number {
      const ariaLevel = el.getAttribute("aria-level");
      if (ariaLevel) return parseInt(ariaLevel) || 0;
      const match = el.tagName.match(/^H(\d)$/);
      if (match) return parseInt(match[1]);
      return 0;
    }

    function getStates(el: HTMLElement): string[] {
      const states: string[] = [];
      if (el.getAttribute("aria-checked") === "true") states.push("checked");
      if (el.getAttribute("aria-checked") === "false") states.push("not checked");
      if (el.getAttribute("aria-checked") === "mixed") states.push("partially checked");
      if (el.getAttribute("aria-expanded") === "true") states.push("expanded");
      if (el.getAttribute("aria-expanded") === "false") states.push("collapsed");
      if (el.getAttribute("aria-pressed") === "true") states.push("pressed");
      if (el.getAttribute("aria-selected") === "true") states.push("selected");
      if (el.getAttribute("aria-disabled") === "true" || (el as HTMLButtonElement).disabled) states.push("dimmed");
      if (el.getAttribute("aria-required") === "true" || (el as HTMLInputElement).required) states.push("required");
      if (el instanceof HTMLInputElement && el.type === "checkbox") {
        states.push(el.checked ? "checked" : "not checked");
      }
      if (el instanceof HTMLInputElement && el.type === "radio") {
        states.push(el.checked ? "selected" : "not selected");
      }
      return states;
    }

    function getSelector(el: HTMLElement): string {
      if (el.id) return `#${el.id}`;
      const tag = el.tagName.toLowerCase();
      const parent = el.parentElement;
      if (!parent) return tag;
      const siblings = Array.from(parent.children).filter((s) => s.tagName === el.tagName);
      if (siblings.length > 1) {
        const idx = siblings.indexOf(el) + 1;
        return `${tag}:nth-of-type(${idx})`;
      }
      return tag;
    }

    // Walk DOM in reading order (document order)
    const walker = document.createTreeWalker(
      document.body,
      NodeFilter.SHOW_ELEMENT,
      {
        acceptNode(node: Node) {
          const el = node as HTMLElement;
          // Skip hidden elements
          if (el.getAttribute("aria-hidden") === "true") return NodeFilter.FILTER_REJECT;
          if (el.hidden) return NodeFilter.FILTER_REJECT;
          const style = window.getComputedStyle(el);
          if (style.display === "none" || style.visibility === "hidden") return NodeFilter.FILTER_REJECT;
          return NodeFilter.FILTER_ACCEPT;
        },
      }
    );

    let node = walker.nextNode() as HTMLElement | null;
    while (node) {
      const role = getRole(node);
      const name = getAccessibleName(node);

      // Only include elements that a screen reader would announce
      if (role !== "generic" && (name || landmarkRoles.has(role) || interactiveRoles.has(role) || role === "heading" || role === "img")) {
        const rect = node.getBoundingClientRect();
        const bounds = rect.width > 0 && rect.height > 0
          ? { x: Math.round(rect.x), y: Math.round(rect.y), width: Math.round(rect.width), height: Math.round(rect.height) }
          : null;

        steps.push({
          role,
          name,
          value: (node as HTMLInputElement).value || "",
          level: getLevel(node),
          tag: node.tagName.toLowerCase(),
          isLandmark: landmarkRoles.has(role),
          isInteractive: interactiveRoles.has(role),
          states: getStates(node),
          bounds,
          selector: getSelector(node),
        });
      }

      node = walker.nextNode() as HTMLElement | null;
    }

    return steps;
  });

  // Build narration steps with announcements
  const steps: NarrationStep[] = [
    {
      index: 0,
      announcement: `${pageTitle}, web page`,
      role: "document",
      name: pageTitle,
      selector: "body",
      bounds: null,
      level: 0,
      isLandmark: false,
      isInteractive: false,
      states: [],
    },
  ];

  for (const raw of rawSteps) {
    const announcement = buildAnnouncement({
      role: raw.role,
      name: raw.name,
      value: raw.value,
      level: raw.level,
    });

    steps.push({
      index: steps.length,
      announcement,
      role: raw.role,
      name: raw.name,
      selector: raw.selector,
      bounds: raw.bounds,
      level: raw.level || 0,
      isLandmark: raw.isLandmark,
      isInteractive: raw.isInteractive,
      states: raw.states,
    });
  }

  const landmarks = steps.filter((s) => s.isLandmark).length;
  const headings = steps.filter((s) => s.role === "heading").length;
  const interactiveElements = steps.filter((s) => s.isInteractive).length;

  return {
    url,
    pageTitle,
    steps,
    totalElements: steps.length,
    landmarks,
    headings,
    interactiveElements,
    capturedAt: new Date().toISOString(),
  };
}

/**
 * Build the announcement string for a node — what the screen reader would speak.
 */
function buildAnnouncement(node: { role: string; name: string; value: string; level: number }): string {
  const { role, name, value, level } = node;
  const parts: string[] = [];

  // Name first (what the user interacts with)
  if (name) {
    parts.push(name);
  }

  // Role announcement
  const roleText = ROLE_ANNOUNCEMENTS[role];
  if (roleText) {
    parts.push(roleText);
  }

  // Level for headings
  if (role === "heading" && level) {
    parts[parts.length - 1] = `heading level ${level}`;
  }

  // Value for inputs
  if (value) {
    parts.push(value);
  }

  return parts.join(", ") || role;
}
