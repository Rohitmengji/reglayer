/**
 * E2E: WCAG 2.2 AA conformance — automated axe-core checks on public pages.
 *
 * WHY: RegLayer sells WCAG conformance. Shipping violations on our own site is a
 *      commercial and legal risk (EAA, ADA Title II), not just a code-quality one.
 *      A pre-launch audit measured 50 real violations across 6 routes — 29 contrast
 *      failures on /blog alone — none of which any existing gate would have caught.
 *
 * WHAT: Runs axe against the wcag2a/2aa/21a/21aa/22aa rule sets on every public page
 *       and asserts zero violations.
 *
 * HOW: @axe-core/playwright (already a dependency, previously unused). Authenticated
 *      routes are covered separately — they need a logged-in fixture; see e2e/helpers/auth.ts.
 *
 * NOTE: Static analysis (eslint-plugin-jsx-a11y) cannot detect colour contrast or
 *       computed ARIA relationships. These runtime checks are the other half of the gate.
 */
import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

const WCAG_TAGS = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"];

const PUBLIC_PAGES = [
  "/",
  "/pricing",
  "/features",
  "/standards",
  "/docs",
  "/api-reference",
  "/blog",
  "/contact",
  "/privacy",
  "/terms",
  "/cookie-policy",
];

for (const path of PUBLIC_PAGES) {
  test(`${path} has no WCAG 2.2 AA violations`, async ({ page }) => {
    await page.goto(path);
    await page.waitForLoadState("networkidle");

    const { violations } = await new AxeBuilder({ page }).withTags(WCAG_TAGS).analyze();

    // Surface rule id, impact, WCAG criterion and the offending markup so a CI failure is
    // actionable without re-running locally.
    const summary = violations.map((v) => ({
      rule: v.id,
      impact: v.impact,
      wcag: v.tags.filter((t) => t.startsWith("wcag")),
      help: v.help,
      nodes: v.nodes.slice(0, 3).map((n) => n.html.slice(0, 160)),
    }));

    expect(summary, `axe found ${violations.length} violation(s) on ${path}`).toEqual([]);
  });
}
