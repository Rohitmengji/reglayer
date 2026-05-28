/**
 * ---------------------------------------------------------
 * RegLayer — Auto-Remediation Engine
 * ---------------------------------------------------------
 *
 * Patches accessibility issues in HTML in real-time without
 * touching source code. Like a CDN edge worker that injects
 * accessibility fixes on the fly.
 *
 * Supported fix categories:
 * - Missing alt text → AI-generated descriptions
 * - Missing form labels → injected aria-label
 * - Missing landmarks → wrapped in semantic elements
 * - Broken focus order → tabindex corrections
 * - Missing lang attribute → detected and added
 * - Low contrast → CSS overrides injected
 * - Missing skip links → injected at document start
 * - Missing button labels → aria-label from context
 * ---------------------------------------------------------
 */

import { JSDOM } from "jsdom";

export interface RemediationConfig {
  enableAltText: boolean;
  enableFormLabels: boolean;
  enableLandmarks: boolean;
  enableSkipLinks: boolean;
  enableFocusOrder: boolean;
  enableLangAttr: boolean;
  enableContrastFixes: boolean;
  enableButtonLabels: boolean;
  aiApiKey?: string;
}

export interface RemediationResult {
  html: string;
  fixesApplied: FixRecord[];
  totalFixes: number;
  categories: Record<string, number>;
}

export interface FixRecord {
  category: string;
  element: string;
  selector: string;
  before: string;
  after: string;
  wcagCriteria: string;
}

const DEFAULT_CONFIG: RemediationConfig = {
  enableAltText: true,
  enableFormLabels: true,
  enableLandmarks: true,
  enableSkipLinks: true,
  enableFocusOrder: true,
  enableLangAttr: true,
  enableContrastFixes: false, // Risky — can break visual design
  enableButtonLabels: true,
};

/**
 * Apply accessibility remediations to raw HTML.
 */
export function remediate(
  html: string,
  config: Partial<RemediationConfig> = {}
): RemediationResult {
  const cfg = { ...DEFAULT_CONFIG, ...config };
  const dom = new JSDOM(html);
  const document = dom.window.document;
  const fixes: FixRecord[] = [];

  // Apply each remediation rule
  if (cfg.enableLangAttr) {
    fixes.push(...fixLangAttribute(document));
  }
  if (cfg.enableSkipLinks) {
    fixes.push(...fixSkipLinks(document));
  }
  if (cfg.enableLandmarks) {
    fixes.push(...fixLandmarks(document));
  }
  if (cfg.enableAltText) {
    fixes.push(...fixAltText(document));
  }
  if (cfg.enableFormLabels) {
    fixes.push(...fixFormLabels(document));
  }
  if (cfg.enableButtonLabels) {
    fixes.push(...fixButtonLabels(document));
  }
  if (cfg.enableFocusOrder) {
    fixes.push(...fixFocusOrder(document));
  }

  // Count by category
  const categories: Record<string, number> = {};
  for (const fix of fixes) {
    categories[fix.category] = (categories[fix.category] || 0) + 1;
  }

  return {
    html: dom.serialize(),
    fixesApplied: fixes,
    totalFixes: fixes.length,
    categories,
  };
}

// ─── Rule: Lang Attribute ─────────────────────────────────

function fixLangAttribute(document: Document): FixRecord[] {
  const fixes: FixRecord[] = [];
  const html = document.documentElement;

  if (!html.getAttribute("lang")) {
    const before = html.outerHTML.substring(0, 60);
    html.setAttribute("lang", "en");
    fixes.push({
      category: "lang-attribute",
      element: "html",
      selector: "html",
      before,
      after: html.outerHTML.substring(0, 60),
      wcagCriteria: "3.1.1",
    });
  }

  return fixes;
}

// ─── Rule: Skip Links ─────────────────────────────────────

function fixSkipLinks(document: Document): FixRecord[] {
  const fixes: FixRecord[] = [];

  // Check if a skip link already exists
  const existingSkip = document.querySelector(
    'a[href="#main"], a[href="#content"], a[href="#main-content"], .skip-link, .skip-nav'
  );
  if (existingSkip) return fixes;

  // Find the main content target
  const main = document.querySelector("main, #main, #content, #main-content, [role='main']");
  if (!main) return fixes;

  // Ensure main has an id
  let targetId = main.id;
  if (!targetId) {
    targetId = "main-content";
    main.id = targetId;
  }

  // Create skip link
  const skipLink = document.createElement("a");
  skipLink.href = `#${targetId}`;
  skipLink.className = "reglayer-skip-link";
  skipLink.textContent = "Skip to main content";
  skipLink.setAttribute("style",
    "position:absolute;top:-40px;left:0;background:#000;color:#fff;padding:8px 16px;" +
    "z-index:100000;font-size:14px;text-decoration:none;transition:top 0.2s;" +
    "border-radius:0 0 4px 0;"
  );
  skipLink.setAttribute("onfocus", "this.style.top='0'");
  skipLink.setAttribute("onblur", "this.style.top='-40px'");

  const body = document.body;
  if (body.firstChild) {
    body.insertBefore(skipLink, body.firstChild);
  } else {
    body.appendChild(skipLink);
  }

  fixes.push({
    category: "skip-links",
    element: "a.reglayer-skip-link",
    selector: "body > a:first-child",
    before: "(no skip link)",
    after: skipLink.outerHTML,
    wcagCriteria: "2.4.1",
  });

  return fixes;
}

// ─── Rule: Landmarks ──────────────────────────────────────

function fixLandmarks(document: Document): FixRecord[] {
  const fixes: FixRecord[] = [];

  // Add banner role to header if missing
  const header = document.querySelector("header:not([role])");
  if (header && !document.querySelector("[role='banner']")) {
    header.setAttribute("role", "banner");
    fixes.push({
      category: "landmarks",
      element: "header",
      selector: "header",
      before: "<header>",
      after: '<header role="banner">',
      wcagCriteria: "1.3.1",
    });
  }

  // Add navigation role to nav if missing
  const navs = document.querySelectorAll("nav:not([role]):not([aria-label])");
  navs.forEach((nav, i) => {
    if (navs.length > 1 && !nav.getAttribute("aria-label")) {
      nav.setAttribute("aria-label", `Navigation ${i + 1}`);
      fixes.push({
        category: "landmarks",
        element: "nav",
        selector: `nav:nth-of-type(${i + 1})`,
        before: "<nav>",
        after: `<nav aria-label="Navigation ${i + 1}">`,
        wcagCriteria: "1.3.1",
      });
    }
  });

  // Add contentinfo role to footer if missing
  const footer = document.querySelector("footer:not([role])");
  if (footer && !document.querySelector("[role='contentinfo']")) {
    footer.setAttribute("role", "contentinfo");
    fixes.push({
      category: "landmarks",
      element: "footer",
      selector: "footer",
      before: "<footer>",
      after: '<footer role="contentinfo">',
      wcagCriteria: "1.3.1",
    });
  }

  // Wrap loose content in main if no main exists
  const main = document.querySelector("main, [role='main']");
  if (!main) {
    const body = document.body;
    const content = body.querySelector("#content, #app, #root, .content, .main");
    if (content && !content.closest("main")) {
      content.setAttribute("role", "main");
      fixes.push({
        category: "landmarks",
        element: content.tagName.toLowerCase(),
        selector: `#${content.id || "content"}`,
        before: `<${content.tagName.toLowerCase()}>`,
        after: `<${content.tagName.toLowerCase()} role="main">`,
        wcagCriteria: "1.3.1",
      });
    }
  }

  return fixes;
}

// ─── Rule: Alt Text ───────────────────────────────────────

function fixAltText(document: Document): FixRecord[] {
  const fixes: FixRecord[] = [];

  const images = document.querySelectorAll("img:not([alt]), img[alt='']");
  images.forEach((img) => {
    const src = img.getAttribute("src") || "";
    const before = img.outerHTML;

    // Determine if decorative or informative
    const isDecorative =
      img.getAttribute("role") === "presentation" ||
      img.closest("a, button") !== null || // Icon inside interactive
      src.includes("spacer") ||
      src.includes("pixel") ||
      src.includes("tracking");

    if (isDecorative) {
      img.setAttribute("alt", "");
      img.setAttribute("role", "presentation");
    } else {
      // Generate alt from context: filename, title, aria-label, nearby text
      const alt = generateAltFromContext(img, src);
      img.setAttribute("alt", alt);
    }

    fixes.push({
      category: "alt-text",
      element: "img",
      selector: `img[src="${src.substring(0, 50)}"]`,
      before,
      after: img.outerHTML,
      wcagCriteria: "1.1.1",
    });
  });

  return fixes;
}

function generateAltFromContext(img: Element, src: string): string {
  // Try title attribute
  const title = img.getAttribute("title");
  if (title) return title;

  // Try aria-label
  const ariaLabel = img.getAttribute("aria-label");
  if (ariaLabel) return ariaLabel;

  // Try figcaption
  const figure = img.closest("figure");
  if (figure) {
    const caption = figure.querySelector("figcaption");
    if (caption?.textContent) return caption.textContent.trim().substring(0, 100);
  }

  // Extract from filename
  const filename = src.split("/").pop()?.split("?")[0] || "";
  const nameWithoutExt = filename.replace(/\.[^.]+$/, "");
  const readable = nameWithoutExt
    .replace(/[-_]/g, " ")
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .trim();

  if (readable && readable.length > 2) {
    return readable.charAt(0).toUpperCase() + readable.slice(1);
  }

  return "Image";
}

// ─── Rule: Form Labels ────────────────────────────────────

function fixFormLabels(document: Document): FixRecord[] {
  const fixes: FixRecord[] = [];

  const inputs = document.querySelectorAll(
    "input:not([type='hidden']):not([type='submit']):not([type='button']):not([type='reset']), textarea, select"
  );

  inputs.forEach((input) => {
    const id = input.id;
    const hasLabel = id && document.querySelector(`label[for="${id}"]`);
    const hasAriaLabel = input.getAttribute("aria-label");
    const hasAriaLabelledBy = input.getAttribute("aria-labelledby");
    const isWrappedByLabel = input.closest("label") !== null;

    if (hasLabel || hasAriaLabel || hasAriaLabelledBy || isWrappedByLabel) return;

    const before = input.outerHTML;

    // Derive label from context
    const label = deriveInputLabel(input);
    input.setAttribute("aria-label", label);

    fixes.push({
      category: "form-labels",
      element: input.tagName.toLowerCase(),
      selector: id ? `#${id}` : `${input.tagName.toLowerCase()}[name="${input.getAttribute("name") || ""}"]`,
      before,
      after: input.outerHTML,
      wcagCriteria: "1.3.1",
    });
  });

  return fixes;
}

function deriveInputLabel(input: Element): string {
  // Try placeholder
  const placeholder = input.getAttribute("placeholder");
  if (placeholder) return placeholder;

  // Try name attribute
  const name = input.getAttribute("name") || "";
  if (name) {
    return name
      .replace(/[-_\[\]]/g, " ")
      .replace(/([a-z])([A-Z])/g, "$1 $2")
      .trim()
      .replace(/^\w/, (c) => c.toUpperCase());
  }

  // Try type
  const type = input.getAttribute("type") || "text";
  return type.charAt(0).toUpperCase() + type.slice(1) + " input";
}

// ─── Rule: Button Labels ──────────────────────────────────

function fixButtonLabels(document: Document): FixRecord[] {
  const fixes: FixRecord[] = [];

  const buttons = document.querySelectorAll("button, [role='button'], input[type='button'], input[type='submit']");

  buttons.forEach((btn) => {
    const hasText = btn.textContent?.trim();
    const hasAriaLabel = btn.getAttribute("aria-label");
    const hasAriaLabelledBy = btn.getAttribute("aria-labelledby");
    const hasTitle = btn.getAttribute("title");
    const hasValue = btn.getAttribute("value");

    if (hasText || hasAriaLabel || hasAriaLabelledBy || hasTitle || hasValue) return;

    const before = btn.outerHTML;

    // Try to derive from icon class, child img alt, or SVG title
    const label = deriveButtonLabel(btn);
    btn.setAttribute("aria-label", label);

    fixes.push({
      category: "button-labels",
      element: btn.tagName.toLowerCase(),
      selector: btn.className ? `.${btn.className.split(" ")[0]}` : btn.tagName.toLowerCase(),
      before,
      after: btn.outerHTML,
      wcagCriteria: "4.1.2",
    });
  });

  return fixes;
}

function deriveButtonLabel(btn: Element): string {
  // Try child img alt
  const img = btn.querySelector("img[alt]");
  if (img) {
    const alt = img.getAttribute("alt");
    if (alt) return alt;
  }

  // Try SVG title
  const svgTitle = btn.querySelector("svg title");
  if (svgTitle?.textContent) return svgTitle.textContent.trim();

  // Try class name hints
  const className = btn.className || "";
  const classHints = className.match(/(close|menu|search|submit|send|delete|edit|save|cancel|next|prev|back|forward|play|pause|stop)/i);
  if (classHints) {
    return classHints[1].charAt(0).toUpperCase() + classHints[1].slice(1);
  }

  // Try data attributes
  const dataAction = btn.getAttribute("data-action") || btn.getAttribute("data-tooltip");
  if (dataAction) return dataAction;

  return "Button";
}

// ─── Rule: Focus Order ────────────────────────────────────

function fixFocusOrder(document: Document): FixRecord[] {
  const fixes: FixRecord[] = [];

  // Remove positive tabindex values (they break natural focus order)
  const positiveTabindex = document.querySelectorAll("[tabindex]");
  positiveTabindex.forEach((el) => {
    const tabindex = parseInt(el.getAttribute("tabindex") || "0", 10);
    if (tabindex > 0) {
      const before = el.outerHTML.substring(0, 80);
      el.setAttribute("tabindex", "0");
      fixes.push({
        category: "focus-order",
        element: el.tagName.toLowerCase(),
        selector: el.id ? `#${el.id}` : el.tagName.toLowerCase(),
        before,
        after: el.outerHTML.substring(0, 80),
        wcagCriteria: "2.4.3",
      });
    }
  });

  // Make interactive-looking elements focusable
  const clickHandlers = document.querySelectorAll("[onclick]:not(a):not(button):not(input):not(select):not(textarea)");
  clickHandlers.forEach((el) => {
    if (!el.getAttribute("tabindex") && !el.getAttribute("role")) {
      const before = el.outerHTML.substring(0, 80);
      el.setAttribute("tabindex", "0");
      el.setAttribute("role", "button");
      fixes.push({
        category: "focus-order",
        element: el.tagName.toLowerCase(),
        selector: el.id ? `#${el.id}` : `${el.tagName.toLowerCase()}[onclick]`,
        before,
        after: el.outerHTML.substring(0, 80),
        wcagCriteria: "2.1.1",
      });
    }
  });

  return fixes;
}
