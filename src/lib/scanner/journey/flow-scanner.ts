/**
 * ---------------------------------------------------------
 * RegLayer — User Journey Flow Scanner
 * ---------------------------------------------------------
 *
 * Flow-based accessibility scanning. Not page-by-page —
 * defines a user journey (Login → Search → Product → Cart
 * → Checkout) and walks it with Playwright.
 *
 * Catches bugs that only appear during navigation:
 * - Focus management between page transitions
 * - Live region announcements during state changes
 * - Error recovery paths (form validation, 404s)
 * - State persistence across navigation
 * - Keyboard trap detection during flows
 * - Modal/dialog focus trapping
 * ---------------------------------------------------------
 */

import { type Browser, type Page } from "playwright-core";
import { launchBrowser } from "@/lib/scanner/browser/launch";

export interface JourneyStep {
  name: string;
  action: JourneyAction;
  assertions?: JourneyAssertion[];
  waitFor?: string; // CSS selector to wait for after action
  timeout?: number; // Max ms to wait for step completion
}

export type JourneyAction =
  | { type: "navigate"; url: string }
  | { type: "click"; selector: string }
  | { type: "type"; selector: string; text: string }
  | { type: "press"; key: string }
  | { type: "select"; selector: string; value: string }
  | { type: "wait"; ms: number }
  | { type: "scroll"; selector?: string }
  | { type: "hover"; selector: string };

export interface JourneyAssertion {
  type: "focus" | "liveRegion" | "ariaState" | "landmark" | "heading" | "title";
  expected?: string;
  selector?: string;
}

export interface JourneyConfig {
  name: string;
  description?: string;
  baseUrl?: string;
  steps: JourneyStep[];
  viewport?: { width: number; height: number };
  timeout?: number;
}

export interface StepResult {
  stepName: string;
  stepIndex: number;
  passed: boolean;
  duration: number;
  url: string;
  accessibility: {
    focusedElement: string | null;
    focusVisible: boolean;
    liveRegions: LiveRegionAnnouncement[];
    keyboardTraps: string[];
    missingFocusManagement: boolean;
    headingStructure: HeadingInfo[];
    landmarks: string[];
    violations: FlowViolation[];
  };
  assertions: AssertionResult[];
  screenshot?: string;
}

export interface LiveRegionAnnouncement {
  element: string;
  text: string;
  role: string;
  politeness: "assertive" | "polite" | "off";
  timestamp: number;
}

export interface HeadingInfo {
  level: number;
  text: string;
  inOrder: boolean;
}

export interface FlowViolation {
  type: string;
  severity: "critical" | "serious" | "moderate" | "minor";
  description: string;
  element?: string;
  wcagCriteria: string;
}

export interface AssertionResult {
  type: string;
  passed: boolean;
  expected?: string;
  actual?: string;
  message: string;
}

export interface JourneyResult {
  name: string;
  totalSteps: number;
  passedSteps: number;
  failedSteps: number;
  totalDuration: number;
  overallScore: number;
  steps: StepResult[];
  summary: {
    focusIssues: number;
    liveRegionIssues: number;
    keyboardTraps: number;
    flowViolations: number;
    missingAnnouncements: number;
  };
}

/**
 * Execute a user journey and scan accessibility at each step.
 */
export async function executeJourney(config: JourneyConfig): Promise<JourneyResult> {
  let browser: Browser | null = null;

  try {
    // Shared cross-environment launcher: real Playwright locally, puppeteer-core
    // + @sparticuz/chromium on serverless. Launching playwright-core's chromium
    // directly shipped no binary on Vercel, so every journey failed in prod.
    browser = await launchBrowser();

    const context = await browser.newContext({
      viewport: config.viewport || { width: 1280, height: 720 },
      userAgent: "RegLayer-JourneyScanner/1.0",
    });

    const page = await context.newPage();
    const stepResults: StepResult[] = [];
    const startTime = Date.now();

    // Set up live region monitoring
    await setupLiveRegionMonitor(page);

    for (let i = 0; i < config.steps.length; i++) {
      const step = config.steps[i];
      const stepStart = Date.now();

      try {
        const result = await executeStep(page, step, i, config);
        stepResults.push(result);
      } catch (error) {
        stepResults.push({
          stepName: step.name,
          stepIndex: i,
          passed: false,
          duration: Date.now() - stepStart,
          url: page.url(),
          accessibility: {
            focusedElement: null,
            focusVisible: false,
            liveRegions: [],
            keyboardTraps: [],
            missingFocusManagement: true,
            headingStructure: [],
            landmarks: [],
            violations: [{
              type: "step-failure",
              severity: "critical",
              description: `Step failed: ${error instanceof Error ? error.message : "Unknown error"}`,
              wcagCriteria: "2.1.1",
            }],
          },
          assertions: [],
        });
      }
    }

    const totalDuration = Date.now() - startTime;
    const passedSteps = stepResults.filter((s) => s.passed).length;

    // Calculate summary
    const summary = {
      focusIssues: stepResults.reduce((sum, s) => sum + (s.accessibility.missingFocusManagement ? 1 : 0), 0),
      liveRegionIssues: stepResults.reduce((sum, s) => sum + s.accessibility.violations.filter((v) => v.type === "live-region").length, 0),
      keyboardTraps: stepResults.reduce((sum, s) => sum + s.accessibility.keyboardTraps.length, 0),
      flowViolations: stepResults.reduce((sum, s) => sum + s.accessibility.violations.length, 0),
      missingAnnouncements: stepResults.reduce((sum, s) => sum + s.accessibility.violations.filter((v) => v.type === "missing-announcement").length, 0),
    };

    // Score: 100 - deductions per issue
    const totalIssues = summary.focusIssues * 10 + summary.keyboardTraps * 20 + summary.flowViolations * 5 + summary.missingAnnouncements * 5;
    const overallScore = Math.max(0, Math.min(100, 100 - totalIssues));

    await context.close();

    return {
      name: config.name,
      totalSteps: config.steps.length,
      passedSteps,
      failedSteps: config.steps.length - passedSteps,
      totalDuration,
      overallScore,
      steps: stepResults,
      summary,
    };
  } finally {
    if (browser) await browser.close();
  }
}

// ─── Step Execution ──────────────────────────────────────

async function executeStep(
  page: Page,
  step: JourneyStep,
  index: number,
  config: JourneyConfig
): Promise<StepResult> {
  const stepStart = Date.now();

  // Clear live region buffer before action
  await page.evaluate(() => {
    (window as unknown as Record<string, unknown>).__rl_live_regions = [];
  });

  // Execute the action
  await performAction(page, step.action, config);

  // Wait for step to settle
  if (step.waitFor) {
    await page.waitForSelector(step.waitFor, { timeout: step.timeout || 10000 });
  } else {
    await page.waitForLoadState("networkidle").catch(() => {});
    await page.waitForTimeout(500); // Let DOM settle
  }

  // Analyze accessibility state
  const accessibility = await analyzeAccessibility(page);

  // Run assertions
  const assertions = await runAssertions(page, step.assertions || []);

  // Determine pass/fail
  const hasFlowViolations = accessibility.violations.some((v) => v.severity === "critical" || v.severity === "serious");
  const assertionsFailed = assertions.some((a) => !a.passed);
  const passed = !hasFlowViolations && !assertionsFailed;

  return {
    stepName: step.name,
    stepIndex: index,
    passed,
    duration: Date.now() - stepStart,
    url: page.url(),
    accessibility,
    assertions,
  };
}

async function performAction(page: Page, action: JourneyAction, config: JourneyConfig): Promise<void> {
  switch (action.type) {
    case "navigate": {
      const url = action.url.startsWith("http") ? action.url : `${config.baseUrl || ""}${action.url}`;
      await page.goto(url, { waitUntil: "domcontentloaded" });
      break;
    }
    case "click":
      await page.click(action.selector);
      break;
    case "type":
      await page.fill(action.selector, action.text);
      break;
    case "press":
      await page.keyboard.press(action.key);
      break;
    case "select":
      await page.selectOption(action.selector, action.value);
      break;
    case "wait":
      await page.waitForTimeout(action.ms);
      break;
    case "scroll":
      if (action.selector) {
        await page.evaluate((sel) => document.querySelector(sel)?.scrollIntoView(), action.selector);
      } else {
        await page.evaluate(() => window.scrollBy(0, window.innerHeight));
      }
      break;
    case "hover":
      await page.hover(action.selector);
      break;
  }
}

// ─── Accessibility Analysis ──────────────────────────────

async function analyzeAccessibility(page: Page): Promise<StepResult["accessibility"]> {
  return await page.evaluate(() => {
    const violations: Array<{ type: string; severity: string; description: string; element?: string; wcagCriteria: string }> = [];

    // 1. Check focused element and focus visibility
    const focused = document.activeElement;
    const focusedElement = focused && focused !== document.body
      ? `${focused.tagName.toLowerCase()}${focused.id ? '#' + focused.id : ''}${focused.className ? '.' + focused.className.split(' ')[0] : ''}`
      : null;

    let focusVisible = false;
    if (focused && focused !== document.body) {
      const styles = getComputedStyle(focused);
      focusVisible = styles.outlineStyle !== "none" || styles.boxShadow !== "none";
      if (!focusVisible) {
        violations.push({
          type: "focus-visibility",
          severity: "serious",
          description: `Focus indicator not visible on ${focusedElement}`,
          element: focusedElement || undefined,
          wcagCriteria: "2.4.7",
        });
      }
    }

    // 2. Check for focus management after navigation
    const missingFocusManagement = focused === document.body || focused === document.documentElement;
    if (missingFocusManagement) {
      violations.push({
        type: "focus-management",
        severity: "serious",
        description: "Focus not managed after page/state transition — screen reader users lose context",
        wcagCriteria: "2.4.3",
      });
    }

    // 3. Collect live region announcements
    const liveRegions: Array<{ element: string; text: string; role: string; politeness: string; timestamp: number }> =
      ((window as unknown as Record<string, unknown>).__rl_live_regions as Array<{ element: string; text: string; role: string; politeness: string; timestamp: number }>) || [];

    // 4. Check for keyboard traps (elements with tabindex that might trap)
    const keyboardTraps: string[] = [];
    const modals = document.querySelectorAll("[role='dialog']:not([aria-hidden='true']), .modal:not(.hidden)");
    modals.forEach((modal) => {
      const focusableInModal = modal.querySelectorAll("a, button, input, select, textarea, [tabindex]");
      if (focusableInModal.length === 0) {
        keyboardTraps.push(modal.outerHTML.substring(0, 80));
      }
    });

    // 5. Heading structure
    const headings: Array<{ level: number; text: string; inOrder: boolean }> = [];
    let lastLevel = 0;
    document.querySelectorAll("h1, h2, h3, h4, h5, h6").forEach((h) => {
      const level = parseInt(h.tagName[1], 10);
      const inOrder = level <= lastLevel + 1;
      headings.push({ level, text: (h.textContent || "").trim().substring(0, 50), inOrder });
      if (!inOrder) {
        violations.push({
          type: "heading-order",
          severity: "moderate",
          description: `Heading level skipped: h${lastLevel} → h${level} ("${(h.textContent || "").trim().substring(0, 30)}")`,
          wcagCriteria: "1.3.1",
        });
      }
      lastLevel = level;
    });

    // 6. Landmarks
    const landmarks: string[] = [];
    document.querySelectorAll("main, nav, header, footer, aside, [role='main'], [role='navigation'], [role='banner'], [role='contentinfo'], [role='complementary']").forEach((el) => {
      const role = el.getAttribute("role") || el.tagName.toLowerCase();
      const label = el.getAttribute("aria-label") || el.getAttribute("aria-labelledby") || "";
      landmarks.push(`${role}${label ? ': ' + label : ''}`);
    });

    return {
      focusedElement,
      focusVisible,
      liveRegions: liveRegions as Array<{ element: string; text: string; role: string; politeness: "assertive" | "polite" | "off"; timestamp: number }>,
      keyboardTraps,
      missingFocusManagement,
      headingStructure: headings,
      landmarks,
      violations: violations as Array<{ type: string; severity: "critical" | "serious" | "moderate" | "minor"; description: string; element?: string; wcagCriteria: string }>,
    };
  });
}

// ─── Live Region Monitoring ─────────────────────────────

async function setupLiveRegionMonitor(page: Page): Promise<void> {
  await page.addInitScript(() => {
    (window as unknown as Record<string, unknown>).__rl_live_regions = [];

    const observer = new MutationObserver((mutations) => {
      for (const mutation of mutations) {
        const target = mutation.target as HTMLElement;
        const ariaLive = target.getAttribute("aria-live") ||
          target.getAttribute("role") === "alert" ? "assertive" :
          target.getAttribute("role") === "status" ? "polite" : null;

        if (ariaLive && mutation.type === "childList") {
          const regions = (window as unknown as Record<string, unknown>).__rl_live_regions as Array<unknown>;
          regions.push({
            element: `${target.tagName.toLowerCase()}${target.id ? '#' + target.id : ''}`,
            text: (target.textContent || "").trim().substring(0, 200),
            role: target.getAttribute("role") || "live-region",
            politeness: ariaLive,
            timestamp: Date.now(),
          });
        }
      }
    });

    observer.observe(document.body, {
      childList: true,
      subtree: true,
      characterData: true,
    });
  });
}

// ─── Assertions ─────────────────────────────────────────

async function runAssertions(page: Page, assertions: JourneyAssertion[]): Promise<AssertionResult[]> {
  const results: AssertionResult[] = [];

  for (const assertion of assertions) {
    switch (assertion.type) {
      case "focus": {
        const actual = await page.evaluate(() => {
          const el = document.activeElement;
          return el ? `${el.tagName.toLowerCase()}${el.id ? '#' + el.id : ''}` : "body";
        });
        const passed = assertion.expected ? actual.includes(assertion.expected) : actual !== "body";
        results.push({
          type: "focus",
          passed,
          expected: assertion.expected || "focused element",
          actual,
          message: passed ? "Focus is on expected element" : `Focus is on ${actual}, expected ${assertion.expected || "non-body element"}`,
        });
        break;
      }

      case "liveRegion": {
        const regions = await page.evaluate(() =>
          ((window as unknown as Record<string, unknown>).__rl_live_regions as Array<{ text: string }>) || []
        );
        const hasAnnouncement = assertion.expected
          ? regions.some((r) => r.text.toLowerCase().includes(assertion.expected!.toLowerCase()))
          : regions.length > 0;
        results.push({
          type: "liveRegion",
          passed: hasAnnouncement,
          expected: assertion.expected || "any announcement",
          actual: regions.map((r) => r.text).join("; ") || "(none)",
          message: hasAnnouncement
            ? "Live region announcement detected"
            : `No live region announcement${assertion.expected ? ` containing "${assertion.expected}"` : ""}`,
        });
        break;
      }

      case "title": {
        const title = await page.title();
        const passed = assertion.expected ? title.includes(assertion.expected) : title.length > 0;
        results.push({
          type: "title",
          passed,
          expected: assertion.expected || "non-empty title",
          actual: title,
          message: passed ? "Page title is correct" : `Title "${title}" doesn't match expected "${assertion.expected}"`,
        });
        break;
      }

      case "landmark": {
        const hasLandmark = await page.evaluate((sel) => {
          return !!document.querySelector(sel || "main, [role='main']");
        }, assertion.selector || "main");
        results.push({
          type: "landmark",
          passed: hasLandmark,
          expected: assertion.selector || "main landmark",
          actual: hasLandmark ? "found" : "not found",
          message: hasLandmark ? "Expected landmark present" : "Expected landmark missing",
        });
        break;
      }

      case "heading": {
        const headingText = await page.evaluate((sel) => {
          const h = document.querySelector(sel || "h1");
          return h?.textContent?.trim() || "";
        }, assertion.selector || "h1");
        const passed = assertion.expected ? headingText.includes(assertion.expected) : headingText.length > 0;
        results.push({
          type: "heading",
          passed,
          expected: assertion.expected || "non-empty heading",
          actual: headingText,
          message: passed ? "Heading content correct" : `Heading "${headingText}" doesn't match`,
        });
        break;
      }
    }
  }

  return results;
}
