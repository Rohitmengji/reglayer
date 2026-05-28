/**
 * Design System Compliance Scanner
 *
 * Scans Storybook instances to evaluate individual components
 * for accessibility, then maps violations back to the design
 * system level — so you fix once, and 47 pages are fixed.
 */

export interface ComponentResult {
  name: string;
  story: string;
  url: string;
  score: number;
  violations: ComponentViolation[];
  passedRules: number;
  totalRules: number;
  usageCount?: number;
}

export interface ComponentViolation {
  ruleId: string;
  impact: "critical" | "serious" | "moderate" | "minor";
  description: string;
  wcag: string[];
  selector: string;
  fix?: string;
}

export interface DesignSystemReport {
  storybookUrl: string;
  scannedAt: string;
  totalComponents: number;
  passedComponents: number;
  failedComponents: number;
  overallScore: number;
  components: ComponentResult[];
  hotspots: Hotspot[];
  recommendations: string[];
}

export interface Hotspot {
  ruleId: string;
  description: string;
  affectedComponents: number;
  totalViolations: number;
  impact: string;
}

/**
 * Built-in component patterns to detect in Storybook
 */
const COMMON_COMPONENTS = [
  "Button",
  "Input",
  "Select",
  "Checkbox",
  "Radio",
  "Modal",
  "Dialog",
  "Dropdown",
  "Menu",
  "Tabs",
  "Accordion",
  "Card",
  "Alert",
  "Toast",
  "Tooltip",
  "Badge",
  "Avatar",
  "Navigation",
  "Breadcrumb",
  "Pagination",
  "Table",
  "Form",
  "Link",
  "Icon",
  "Image",
];

/**
 * Accessibility rules evaluated per component
 */
const COMPONENT_RULES: {
  ruleId: string;
  description: string;
  wcag: string[];
  check: (html: string, name: string) => ComponentViolation | null;
}[] = [
  {
    ruleId: "button-name",
    description: "Buttons must have discernible text",
    wcag: ["4.1.2"],
    check: (html) => {
      const btnMatch = html.match(/<button[^>]*>([\s\S]*?)<\/button>/gi);
      if (!btnMatch) return null;
      for (const btn of btnMatch) {
        const hasText = btn.replace(/<[^>]+>/g, "").trim();
        const hasAriaLabel = /aria-label/i.test(btn);
        if (!hasText && !hasAriaLabel) {
          return {
            ruleId: "button-name",
            impact: "critical",
            description: "Button has no accessible name",
            wcag: ["4.1.2"],
            selector: "button",
            fix: "Add text content or aria-label to the button",
          };
        }
      }
      return null;
    },
  },
  {
    ruleId: "input-label",
    description: "Form inputs must have labels",
    wcag: ["1.3.1", "4.1.2"],
    check: (html) => {
      const inputMatch = html.match(/<input[^>]*>/gi);
      if (!inputMatch) return null;
      for (const input of inputMatch) {
        if (/type=["']hidden["']/i.test(input)) continue;
        const hasAria = /aria-label|aria-labelledby/i.test(input);
        const id = input.match(/id=["']([^"']+)["']/i)?.[1];
        const hasLabel = id && new RegExp(`for=["']${id}["']`, "i").test(html);
        if (!hasAria && !hasLabel) {
          return {
            ruleId: "input-label",
            impact: "critical",
            description: "Input element has no associated label",
            wcag: ["1.3.1", "4.1.2"],
            selector: "input",
            fix: "Add a <label> with matching 'for' attribute, or use aria-label",
          };
        }
      }
      return null;
    },
  },
  {
    ruleId: "image-alt",
    description: "Images must have alt text",
    wcag: ["1.1.1"],
    check: (html) => {
      const imgMatch = html.match(/<img[^>]*>/gi);
      if (!imgMatch) return null;
      for (const img of imgMatch) {
        if (!/alt=/i.test(img)) {
          return {
            ruleId: "image-alt",
            impact: "critical",
            description: "Image missing alt attribute",
            wcag: ["1.1.1"],
            selector: "img",
            fix: 'Add alt="" for decorative images or descriptive alt text',
          };
        }
      }
      return null;
    },
  },
  {
    ruleId: "color-contrast",
    description: "Text must have sufficient color contrast",
    wcag: ["1.4.3"],
    check: (html) => {
      // Check for inline styles with potentially low contrast
      const grayOnWhite = /color:\s*(#[cdef][cdef][cdef]|rgb\(\s*[12]\d{2})/i;
      if (grayOnWhite.test(html)) {
        return {
          ruleId: "color-contrast",
          impact: "serious",
          description: "Element may have insufficient color contrast",
          wcag: ["1.4.3"],
          selector: "[style]",
          fix: "Ensure 4.5:1 contrast ratio for normal text, 3:1 for large text",
        };
      }
      return null;
    },
  },
  {
    ruleId: "focus-visible",
    description: "Interactive elements must have visible focus indicators",
    wcag: ["2.4.7"],
    check: (html) => {
      if (/outline:\s*none|outline:\s*0[^.]|:focus\s*{\s*outline:\s*none/i.test(html)) {
        return {
          ruleId: "focus-visible",
          impact: "serious",
          description: "Focus indicator removed without replacement",
          wcag: ["2.4.7"],
          selector: ":focus",
          fix: "Provide a visible focus indicator (outline, box-shadow, or border)",
        };
      }
      return null;
    },
  },
  {
    ruleId: "aria-role-valid",
    description: "ARIA roles must be valid",
    wcag: ["4.1.2"],
    check: (html) => {
      const roleMatch = html.match(/role=["']([^"']+)["']/gi);
      if (!roleMatch) return null;
      const validRoles = new Set([
        "alert", "alertdialog", "application", "article", "banner", "button",
        "cell", "checkbox", "columnheader", "combobox", "complementary",
        "contentinfo", "definition", "dialog", "directory", "document",
        "feed", "figure", "form", "grid", "gridcell", "group", "heading",
        "img", "link", "list", "listbox", "listitem", "log", "main",
        "marquee", "math", "menu", "menubar", "menuitem", "menuitemcheckbox",
        "menuitemradio", "navigation", "none", "note", "option", "presentation",
        "progressbar", "radio", "radiogroup", "region", "row", "rowgroup",
        "rowheader", "scrollbar", "search", "searchbox", "separator",
        "slider", "spinbutton", "status", "switch", "tab", "table",
        "tablist", "tabpanel", "term", "textbox", "timer", "toolbar",
        "tooltip", "tree", "treegrid", "treeitem",
      ]);
      for (const r of roleMatch) {
        const role = r.match(/role=["']([^"']+)["']/i)?.[1];
        if (role && !validRoles.has(role)) {
          return {
            ruleId: "aria-role-valid",
            impact: "serious",
            description: `Invalid ARIA role: "${role}"`,
            wcag: ["4.1.2"],
            selector: `[role="${role}"]`,
            fix: "Use a valid WAI-ARIA role",
          };
        }
      }
      return null;
    },
  },
  {
    ruleId: "keyboard-accessible",
    description: "Custom interactive elements must be keyboard accessible",
    wcag: ["2.1.1"],
    check: (html) => {
      // Divs/spans with click handlers but no tabindex or role
      const clickable = html.match(/<(div|span)[^>]*on[Cc]lick[^>]*>/gi);
      if (!clickable) return null;
      for (const el of clickable) {
        if (!/tabindex|role=["'](button|link)/i.test(el)) {
          return {
            ruleId: "keyboard-accessible",
            impact: "critical",
            description: "Clickable element not keyboard accessible",
            wcag: ["2.1.1"],
            selector: "div[onclick]",
            fix: 'Add tabindex="0" and role="button", or use a native <button>',
          };
        }
      }
      return null;
    },
  },
  {
    ruleId: "aria-hidden-focus",
    description: "aria-hidden elements must not contain focusable elements",
    wcag: ["4.1.2"],
    check: (html) => {
      const hiddenMatch = html.match(/<[^>]*aria-hidden=["']true["'][^>]*>[\s\S]*?<\/[^>]+>/gi);
      if (!hiddenMatch) return null;
      for (const block of hiddenMatch) {
        if (/<(button|a|input|select|textarea|[^>]*tabindex)/i.test(block)) {
          return {
            ruleId: "aria-hidden-focus",
            impact: "serious",
            description: "Focusable element inside aria-hidden container",
            wcag: ["4.1.2"],
            selector: "[aria-hidden=true]",
            fix: "Remove focusable elements from aria-hidden containers or use inert",
          };
        }
      }
      return null;
    },
  },
];

/**
 * Scan a single component's HTML for accessibility violations
 */
export function scanComponent(
  name: string,
  story: string,
  html: string,
  url: string
): ComponentResult {
  const violations: ComponentViolation[] = [];

  for (const rule of COMPONENT_RULES) {
    const violation = rule.check(html, name);
    if (violation) {
      violations.push(violation);
    }
  }

  const passedRules = COMPONENT_RULES.length - violations.length;
  const score = Math.round((passedRules / COMPONENT_RULES.length) * 100);

  return {
    name,
    story,
    url,
    score,
    violations,
    passedRules,
    totalRules: COMPONENT_RULES.length,
  };
}

/**
 * Generate the full design system report from component results
 */
export function generateReport(
  storybookUrl: string,
  components: ComponentResult[]
): DesignSystemReport {
  const passed = components.filter((c) => c.violations.length === 0);
  const overall =
    components.length > 0
      ? Math.round(components.reduce((sum, c) => sum + c.score, 0) / components.length)
      : 100;

  // Find hotspots (rules that affect multiple components)
  const ruleMap = new Map<string, { desc: string; impact: string; components: Set<string>; count: number }>();
  for (const comp of components) {
    for (const v of comp.violations) {
      const existing = ruleMap.get(v.ruleId) || {
        desc: v.description,
        impact: v.impact,
        components: new Set<string>(),
        count: 0,
      };
      existing.components.add(comp.name);
      existing.count++;
      ruleMap.set(v.ruleId, existing);
    }
  }

  const hotspots: Hotspot[] = Array.from(ruleMap.entries())
    .map(([ruleId, data]) => ({
      ruleId,
      description: data.desc,
      affectedComponents: data.components.size,
      totalViolations: data.count,
      impact: data.impact,
    }))
    .sort((a, b) => b.affectedComponents - a.affectedComponents);

  // Generate recommendations
  const recommendations: string[] = [];
  if (hotspots.length > 0) {
    recommendations.push(
      `Fix "${hotspots[0].description}" — affects ${hotspots[0].affectedComponents} components. Fixing at the design system level resolves all instances.`
    );
  }
  if (components.some((c) => c.score < 50)) {
    recommendations.push(
      "Several components score below 50%. Prioritize these for remediation as they likely appear across many pages."
    );
  }
  if (!components.some((c) => c.name.toLowerCase().includes("modal") || c.name.toLowerCase().includes("dialog"))) {
    recommendations.push(
      "No modal/dialog component detected. Ensure custom modals trap focus and are keyboard-dismissible."
    );
  }

  return {
    storybookUrl,
    scannedAt: new Date().toISOString(),
    totalComponents: components.length,
    passedComponents: passed.length,
    failedComponents: components.length - passed.length,
    overallScore: overall,
    components,
    hotspots,
    recommendations,
  };
}

export { COMMON_COMPONENTS, COMPONENT_RULES };
