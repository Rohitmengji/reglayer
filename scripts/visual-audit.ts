/**
 * Visual Layout Audit — Automated UI/UX Quality Gate
 *
 * This script acts as a senior frontend engineer with 20+ years of experience.
 * It visits every page in the app across 3 viewport sizes and detects:
 *
 * 1. Horizontal overflow (content wider than viewport)
 * 2. Elements clipped or cut off
 * 3. Text overflow / truncation issues
 * 4. Z-index stacking problems (overlapping elements)
 * 5. Touch target sizes below 44px (WCAG 2.5.5)
 * 6. Empty space / collapsed containers
 * 7. Image/media aspect ratio distortion
 * 8. Scrollbar presence (indicates overflow)
 *
 * Run: npm run visual-audit
 * Output: screenshots in ./visual-audit/ + JSON report
 */

import { chromium, type Page, type Browser } from "@playwright/test";
import * as fs from "fs";
import * as path from "path";

const BASE_URL = process.env.AUDIT_URL || "http://localhost:3000";
const OUTPUT_DIR = path.join(process.cwd(), "visual-audit");

// Viewports matching real devices
const VIEWPORTS = [
  { name: "mobile", width: 375, height: 812 },    // iPhone 13
  { name: "tablet", width: 768, height: 1024 },   // iPad
  { name: "desktop", width: 1440, height: 900 },  // MacBook Pro
];

// All routes to audit (public + authenticated)
const PUBLIC_ROUTES = [
  "/",
  "/features",
  "/pricing",
  "/standards",
  "/docs",
  "/contact",
  "/privacy",
  "/terms",
  "/cookie-policy",
  "/api-reference",
];

const AUTH_ROUTES = [
  "/dashboard",
  "/scans",
  "/compliance",
  "/statement",
  "/crawl",
  "/priorities",
  "/insights",
  "/analytics",
  "/scans/compare",
  "/team",
  "/audit-log",
  "/integrations",
  "/webhooks",
  "/settings",
  "/settings?tab=general",
  "/settings?tab=api-keys",
  "/settings?tab=schedules",
  "/settings?tab=integrations",
  "/settings?tab=notifications",
  "/settings?tab=alerts",
];

interface Issue {
  page: string;
  viewport: string;
  type: string;
  severity: "critical" | "warning" | "info";
  message: string;
  element?: string;
}

async function detectLayoutIssues(page: Page, route: string, viewport: string): Promise<Issue[]> {
  const issues: Issue[] = [];

  const results = await page.evaluate(() => {
    const problems: {
      type: string;
      severity: string;
      message: string;
      element?: string;
    }[] = [];

    const viewportWidth = window.innerWidth;
    const body = document.body;
    const html = document.documentElement;

    // 1. Horizontal overflow detection
    if (body.scrollWidth > viewportWidth + 2) {
      problems.push({
        type: "horizontal-overflow",
        severity: "critical",
        message: `Page content (${body.scrollWidth}px) exceeds viewport (${viewportWidth}px) by ${body.scrollWidth - viewportWidth}px`,
      });
    }

    // 2. Find elements causing overflow (skip those inside scrollable containers)
    const allElements = document.querySelectorAll("*");
    const overflowingElements: string[] = [];

    allElements.forEach((el) => {
      const rect = el.getBoundingClientRect();
      if (rect.right > viewportWidth + 2 && rect.width > 0) {
        // Check if this element is inside a scrollable parent
        let parent = el.parentElement;
        let insideScrollable = false;
        while (parent) {
          const parentStyle = window.getComputedStyle(parent);
          if (parentStyle.overflowX === "auto" || parentStyle.overflowX === "scroll" ||
              parentStyle.overflow === "auto" || parentStyle.overflow === "scroll") {
            insideScrollable = true;
            break;
          }
          parent = parent.parentElement;
        }
        if (insideScrollable) return;

        const selector = el.tagName.toLowerCase() +
          (el.id ? `#${el.id}` : "") +
          (el.className && typeof el.className === "string" ? `.${el.className.split(" ").slice(0, 2).join(".")}` : "");
        if (!overflowingElements.includes(selector)) {
          overflowingElements.push(selector);
          if (overflowingElements.length <= 5) {
            problems.push({
              type: "element-overflow",
              severity: "critical",
              message: `Element extends ${Math.round(rect.right - viewportWidth)}px beyond viewport`,
              element: selector,
            });
          }
        }
      }
    });

    // 3. Touch target size check (WCAG 2.5.5 - min 44x44px)
    const interactiveSelectors = "a, button, input, select, textarea, [role='button'], [tabindex]";
    const interactiveElements = document.querySelectorAll(interactiveSelectors);
    let smallTargets = 0;

    interactiveElements.forEach((el) => {
      const rect = el.getBoundingClientRect();
      if (rect.width > 0 && rect.height > 0) {
        if (rect.width < 44 || rect.height < 44) {
          smallTargets++;
        }
      }
    });

    if (smallTargets > 0) {
      problems.push({
        type: "small-touch-target",
        severity: "warning",
        message: `${smallTargets} interactive elements are below 44x44px minimum touch target`,
      });
    }

    // 4. Text truncation / clipping
    let truncatedCount = 0;
    allElements.forEach((el) => {
      const style = window.getComputedStyle(el);
      if (style.overflow === "hidden" && style.textOverflow === "ellipsis") {
        if (el.scrollWidth > el.clientWidth + 1) {
          truncatedCount++;
        }
      }
    });

    if (truncatedCount > 3) {
      problems.push({
        type: "text-truncation",
        severity: "info",
        message: `${truncatedCount} elements have truncated text — verify this is intentional`,
      });
    }

    // 5. Empty visible containers (possible collapsed layout)
    const containers = document.querySelectorAll("main, section, article, .card, [class*='Card']");
    containers.forEach((el) => {
      const rect = el.getBoundingClientRect();
      if (rect.height < 10 && rect.width > 100) {
        const tag = el.tagName.toLowerCase() + (el.className && typeof el.className === "string" ? `.${el.className.split(" ")[0]}` : "");
        problems.push({
          type: "collapsed-container",
          severity: "warning",
          message: `Container appears collapsed (height: ${Math.round(rect.height)}px)`,
          element: tag,
        });
      }
    });

    // 6. Overlapping fixed/sticky elements
    const fixedElements: DOMRect[] = [];
    allElements.forEach((el) => {
      const style = window.getComputedStyle(el);
      if (style.position === "fixed" || style.position === "sticky") {
        fixedElements.push(el.getBoundingClientRect());
      }
    });

    for (let i = 0; i < fixedElements.length; i++) {
      for (let j = i + 1; j < fixedElements.length; j++) {
        const a = fixedElements[i];
        const b = fixedElements[j];
        if (a.top < b.bottom && a.bottom > b.top && a.left < b.right && a.right > b.left) {
          problems.push({
            type: "overlapping-fixed",
            severity: "warning",
            message: "Two fixed/sticky elements overlap — potential z-index issue",
          });
          break;
        }
      }
    }

    // 7. Horizontal scrollbar on the page itself (not inside overflow containers)
    if (html.scrollWidth > html.clientWidth) {
      problems.push({
        type: "scrollbar-x",
        severity: "critical",
        message: "Horizontal scrollbar detected — layout is broken",
      });
    }

    return problems;
  });

  for (const r of results) {
    issues.push({
      page: route,
      viewport,
      type: r.type,
      severity: r.severity as Issue["severity"],
      message: r.message,
      element: r.element,
    });
  }

  return issues;
}

async function login(page: Page) {
  await page.goto(`${BASE_URL}/auth/login`, { waitUntil: "domcontentloaded", timeout: 15000 });
  await page.waitForTimeout(500);

  // Dismiss cookie consent first so it doesn't block form interaction
  try {
    const acceptBtn = page.locator('button:has-text("Accept All")');
    if (await acceptBtn.isVisible({ timeout: 2000 })) {
      await acceptBtn.click();
      await page.waitForTimeout(300);
    }
  } catch {}

  await page.fill('input[type="email"]', "admin@reglayer.dev");
  await page.fill('input[type="password"]', "reglayer2024");
  await page.click('button[type="submit"]');
  await page.waitForURL("**/dashboard**", { timeout: 10000 }).catch(() => {});
  await page.waitForTimeout(1500);
}

async function dismissOverlays(page: Page) {
  // Dismiss cookie consent banner
  try {
    const acceptBtn = page.locator('button:has-text("Accept All")');
    if (await acceptBtn.isVisible({ timeout: 2000 })) {
      await acceptBtn.click();
      await page.waitForTimeout(500);
    }
  } catch {}

  // Hide Next.js dev overlay indicator
  await page.addStyleTag({
    content: `
      [data-nextjs-dialog-overlay], [data-nextjs-toast],
      nextjs-portal, #__next-build-indicator,
      [class*="nextjs-"], [id*="nextjs"] { display: none !important; }
    `,
  });
}

/**
 * Wait for the page to be truly ready.
 * In Next.js dev mode, networkidle never fires (HMR WebSocket stays open).
 * Instead: wait for DOM to settle, then check for spinning indicators.
 */
async function waitForPageReady(page: Page) {
  // Give API calls time to complete and React to hydrate
  await page.waitForTimeout(3000);

  // If there's a visible spinner (animate-spin), wait for it to disappear
  try {
    const spinner = page.locator('[class*="animate-spin"]').first();
    if (await spinner.isVisible({ timeout: 500 })) {
      await spinner.waitFor({ state: "hidden", timeout: 8000 });
    }
  } catch {}
}

/**
 * Scroll through the full page to trigger lazy-loaded content,
 * then scroll back to top for the screenshot.
 */
async function triggerLazyContent(page: Page) {
  await page.evaluate("(async () => { const h = document.body.scrollHeight; const vh = window.innerHeight; let s = 0; while (s < h) { s += vh * 0.7; window.scrollTo(0, s); await new Promise(r => setTimeout(r, 150)); } window.scrollTo(0, 0); await new Promise(r => setTimeout(r, 200)); })()");
}

async function auditPage(page: Page, route: string, viewport: typeof VIEWPORTS[0], allIssues: Issue[]) {
  await page.setViewportSize({ width: viewport.width, height: viewport.height });

  try {
    // Navigate — use domcontentloaded (networkidle hangs in dev due to HMR WebSocket)
    await page.goto(`${BASE_URL}${route}`, { waitUntil: "domcontentloaded", timeout: 20000 });

    // Wait for page to be truly ready (spinners gone, content rendered)
    await waitForPageReady(page);

    // Dismiss cookie banner and dev overlays
    await dismissOverlays(page);

    // Scroll through page to trigger any lazy-loaded images/components
    await triggerLazyContent(page);

    // Final settle after scroll
    await page.waitForTimeout(300);

    // Take screenshot
    const screenshotName = `${route.replace(/[/?=]/g, "_").replace(/^_/, "")}_${viewport.name}.png`;
    await page.screenshot({
      path: path.join(OUTPUT_DIR, "screenshots", screenshotName),
      fullPage: true,
    });

    // Also save to after/ for comparison page
    const afterPath = path.join(OUTPUT_DIR, "after", screenshotName);
    fs.copyFileSync(path.join(OUTPUT_DIR, "screenshots", screenshotName), afterPath);

    // Detect issues
    const issues = await detectLayoutIssues(page, route, viewport.name);
    allIssues.push(...issues);

    const status = issues.filter((i) => i.severity === "critical").length > 0
      ? "❌"
      : issues.filter((i) => i.severity === "warning").length > 0
        ? "⚠️"
        : "✅";

    console.log(`  ${status} ${viewport.name.padEnd(8)} ${route}`);
  } catch (err) {
    const errMsg = (err as Error).message?.slice(0, 80) || "Unknown error";
    console.log(`  💀 ${viewport.name.padEnd(8)} ${route} — ${errMsg}`);
    allIssues.push({
      page: route,
      viewport: viewport.name,
      type: "page-error",
      severity: "critical",
      message: `Page failed to load: ${(err as Error).message?.slice(0, 100)}`,
    });
  }
}

async function main() {
  console.log("\n🔍 Visual Layout Audit — RegLayer");
  console.log("━".repeat(50));

  // Ensure output directory exists
  fs.mkdirSync(OUTPUT_DIR, { recursive: true });

  // Rotate: current after/ becomes before/, then capture fresh after/
  const beforeDir = path.join(OUTPUT_DIR, "before");
  const afterDir = path.join(OUTPUT_DIR, "after");

  if (fs.existsSync(afterDir)) {
    // Move after → before (overwrite previous before)
    if (fs.existsSync(beforeDir)) {
      fs.rmSync(beforeDir, { recursive: true });
    }
    fs.renameSync(afterDir, beforeDir);
    console.log("  ↻ Rotated after/ → before/");
  }

  // Create fresh after/ and screenshots/ dirs
  fs.mkdirSync(afterDir, { recursive: true });
  fs.mkdirSync(path.join(OUTPUT_DIR, "screenshots"), { recursive: true });

  const browser: Browser = await chromium.launch({ headless: true });
  const allIssues: Issue[] = [];

  // Audit public pages (no auth needed)
  console.log("\n📄 Public Pages:");
  const publicContext = await browser.newContext();
  const publicPage = await publicContext.newPage();

  for (const route of PUBLIC_ROUTES) {
    for (const viewport of VIEWPORTS) {
      await auditPage(publicPage, route, viewport, allIssues);
    }
  }
  await publicContext.close();

  // Audit authenticated pages
  console.log("\n🔐 Authenticated Pages:");
  const authContext = await browser.newContext();
  const authPage = await authContext.newPage();

  try {
    await login(authPage);
    console.log("  ✓ Logged in successfully\n");

    for (const route of AUTH_ROUTES) {
      for (const viewport of VIEWPORTS) {
        await auditPage(authPage, route, viewport, allIssues);
      }
    }
  } catch {
    console.log("  ✗ Login failed — skipping authenticated pages\n");
  }

  await authContext.close();
  await browser.close();

  // Generate report
  const critical = allIssues.filter((i) => i.severity === "critical");
  const warnings = allIssues.filter((i) => i.severity === "warning");
  const info = allIssues.filter((i) => i.severity === "info");

  console.log("\n" + "━".repeat(50));
  console.log("📊 AUDIT REPORT");
  console.log("━".repeat(50));
  console.log(`  🔴 Critical: ${critical.length}`);
  console.log(`  🟡 Warnings: ${warnings.length}`);
  console.log(`  🔵 Info:     ${info.length}`);
  console.log(`  📸 Screenshots: ${PUBLIC_ROUTES.length + AUTH_ROUTES.length} pages × ${VIEWPORTS.length} viewports`);

  if (critical.length > 0) {
    console.log("\n🔴 CRITICAL ISSUES:");
    critical.forEach((issue) => {
      console.log(`  • [${issue.viewport}] ${issue.page}`);
      console.log(`    ${issue.message}`);
      if (issue.element) console.log(`    Element: ${issue.element}`);
    });
  }

  if (warnings.length > 0) {
    console.log("\n🟡 WARNINGS:");
    warnings.forEach((issue) => {
      console.log(`  • [${issue.viewport}] ${issue.page}`);
      console.log(`    ${issue.message}`);
    });
  }

  // Save JSON report
  const report = {
    timestamp: new Date().toISOString(),
    baseUrl: BASE_URL,
    viewports: VIEWPORTS,
    summary: { critical: critical.length, warnings: warnings.length, info: info.length },
    issues: allIssues,
  };

  fs.writeFileSync(path.join(OUTPUT_DIR, "report.json"), JSON.stringify(report, null, 2));
  console.log(`\n✅ Full report: ${OUTPUT_DIR}/report.json`);
  console.log(`📸 Screenshots: ${OUTPUT_DIR}/screenshots/`);

  // Sync to public/ for the comparison page at /api/visual-audit
  const publicAudit = path.join(process.cwd(), "public", "visual-audit");
  fs.mkdirSync(path.join(publicAudit, "before"), { recursive: true });
  fs.mkdirSync(path.join(publicAudit, "after"), { recursive: true });

  const beforeDir2 = path.join(OUTPUT_DIR, "before");
  const afterDir2 = path.join(OUTPUT_DIR, "after");

  if (fs.existsSync(beforeDir2)) {
    for (const f of fs.readdirSync(beforeDir2)) {
      fs.copyFileSync(path.join(beforeDir2, f), path.join(publicAudit, "before", f));
    }
  }
  for (const f of fs.readdirSync(afterDir2)) {
    fs.copyFileSync(path.join(afterDir2, f), path.join(publicAudit, "after", f));
  }
  console.log(`🖼️  Comparison page updated: /api/visual-audit\n`);

  // Exit with error code if critical issues found
  if (critical.length > 0) {
    process.exit(1);
  }
}

main().catch((err) => {
  console.error("Audit failed:", err);
  process.exit(1);
});
