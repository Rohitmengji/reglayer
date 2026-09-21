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
import { loadEnvConfig } from "@next/env";
import { encode } from "next-auth/jwt";

const WCAG_TAGS = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"];

test.describe("Isolated product", () => {
  test.use({ viewport: { width: 390, height: 844 } });

  test.beforeEach(async ({ page, baseURL }) => {
    const localURL = baseURL || "http://localhost:3000";
    if (!["localhost", "127.0.0.1"].includes(new URL(localURL).hostname)) throw new Error("Audit fixtures require a local server");
    loadEnvConfig(process.cwd());
    const secret = process.env.NEXTAUTH_SECRET;
    if (!secret) throw new Error("Local NEXTAUTH_SECRET is required for the isolated browser fixture");
    const token = await encode({ secret, token: { sub: "audit-user", email: "audit@example.test" }, maxAge: 3600 });
    await page.context().addCookies([{ name: "next-auth.session-token", value: token, url: localURL, httpOnly: true, sameSite: "Lax" }]);
    await page.route("**/api/**", async (route) => {
      if (new URL(route.request().url()).pathname === "/api/auth/session") {
        await route.fulfill({ json: {
          user: { id: "audit-user", name: "Audit User", email: "audit@example.test", isMasterAdmin: true },
          expires: "2099-01-01T00:00:00.000Z",
        } });
        return;
      }
      await route.fulfill({ status: 503, json: { error: "Offline audit fixture" } });
    });
    await page.goto("/dashboard");
    await page.getByRole("button", { name: "Essential Only", exact: true }).click();
  });

  test("layout keeps centered copy and empty-state icons on the same axis", async ({ page }, testInfo) => {
    await page.route("**/api/violations?**", route => route.fulfill({ json: {
      violations: [], summary: { OPEN: 3, IN_PROGRESS: 2, FIXED: 0, VERIFIED: 0 },
      total: 0, page: 1, limit: 25, totalPages: 0,
    } }));
    const cases = [
      { path: "/pricing", selector: "main p", ready: "main h1" },
      { path: "/tools/contrast", selector: "main p", ready: "main h1" },
      { path: "/violations?scanId=layout-fixture&status=FIXED", selector: "#violations-panel p, #violations-panel svg", ready: "#violations-panel p" },
    ];
    for (const entry of cases) {
      await page.goto(entry.path);
      await expect(page.locator(entry.ready).first()).toBeVisible();
      for (const width of [320, 390, 768, 1440]) {
        await page.setViewportSize({ width, height: 900 });
        const offsets = await page.locator(entry.selector).evaluateAll(elements => elements.flatMap(element => {
          const style = getComputedStyle(element);
          const parent = element.parentElement!;
          const parentStyle = getComputedStyle(parent);
          if (style.textAlign !== "center" || parentStyle.display === "grid" || (parentStyle.display === "flex" && parentStyle.flexDirection !== "column")) return [];
          const bounds = element.getBoundingClientRect();
          const parentBounds = parent.getBoundingClientRect();
          const left = parentBounds.left + parseFloat(parentStyle.paddingLeft) + parseFloat(parentStyle.borderLeftWidth);
          const right = parentBounds.right - parseFloat(parentStyle.paddingRight) - parseFloat(parentStyle.borderRightWidth);
          return [{ text: element.textContent, offset: Math.abs(bounds.left + bounds.width / 2 - (left + right) / 2) }];
        }));
        expect(offsets.length).toBeGreaterThan(0);
        expect(offsets.filter(result => result.offset > 2), `${entry.path} at ${width}px`).toEqual([]);
        expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
        await page.screenshot({ path: testInfo.outputPath(`layout-${entry.path.split("?")[0].replaceAll("/", "_")}-${width}.png`), fullPage: true, animations: "disabled" });
      }
    }
  });

  test("layout centers shared empty-state actions and contains error actions", async ({ page }, testInfo) => {
    await page.route("**/api/scans?**", route => route.fulfill({ json: { scans: [], total: 0 } }));
    await page.goto("/violations");
    const action = page.getByRole("link", { name: "Run a scan", exact: true });
    await expect(action).toBeVisible();
    for (const width of [320, 768, 1440]) {
      await page.setViewportSize({ width, height: 900 });
      const offset = await action.evaluate(element => {
        const bounds = element.getBoundingClientRect();
        const parent = element.parentElement!.getBoundingClientRect();
        return Math.abs(bounds.left + bounds.width / 2 - parent.left - parent.width / 2);
      });
      expect(offset).toBeLessThan(2);
      await page.screenshot({ path: testInfo.outputPath(`empty-actions-${width}.png`), fullPage: true });
    }
    await page.goto("/violations?scanId=unavailable-layout");
    await expect(page.getByRole("heading", { name: "Couldn’t load violations" })).toBeVisible();
    for (const width of [320, 390, 768, 1440]) {
      await page.setViewportSize({ width, height: 900 });
      const bounds = await page.locator("#violations-panel").evaluate(element => {
        const panel = element.getBoundingClientRect();
        return [...element.querySelectorAll("button,a,p")].map(child => {
          const rect = child.getBoundingClientRect();
          return { text: child.textContent, outside: rect.left < panel.left || rect.right > panel.right, clipped: child.scrollWidth > child.clientWidth + 2 };
        });
      });
      expect(bounds.filter(result => result.outside || result.clipped)).toEqual([]);
      await page.screenshot({ path: testInfo.outputPath(`error-actions-${width}.png`), fullPage: true });
    }
  });

  test("layout keeps workspace decision actions and form readable on mobile", async ({ page }, testInfo) => {
    await page.goto("/settings?tab=decisions");
    const action = page.getByRole("button", { name: "Add Decision", exact: true });
    await expect(action).toBeVisible();
    await action.click();
    for (const width of [320, 390, 768, 1440]) {
      await page.setViewportSize({ width, height: 900 });
      const bounds = await action.evaluate(element => {
        const rect = element.getBoundingClientRect();
        const header = element.parentElement!.getBoundingClientRect();
        const icon = element.querySelector("svg")!.getBoundingClientRect();
        return { clipped: element.scrollWidth > element.clientWidth + 2, outside: rect.left < header.left || rect.right > header.right, iconWidth: icon.width };
      });
      expect(bounds.clipped).toBe(false);
      expect(bounds.outside).toBe(false);
      expect(bounds.iconWidth).toBeGreaterThanOrEqual(15);
      const input = page.getByPlaceholder("e.g., WCAG 2.2 Level AA compliance required");
      await expect(input).toBeVisible();
      expect(await input.evaluate(element => element.getBoundingClientRect().width)).toBeGreaterThan(180);
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
      await page.screenshot({ path: testInfo.outputPath(`decision-layout-${width}.png`), fullPage: true });
    }
  });

  test("first sign-in password setup explains failures and only continues once saved", async ({ page }, testInfo) => {
    let accept = false;
    await page.route("**/api/account/set-password", async (route) => route.fulfill(
      accept ? { json: { success: true } } : { status: 400, json: { error: "At least 12 characters, with an uppercase letter, a lowercase letter and a number." } },
    ));
    await page.goto("/auth/set-password");
    const password = page.getByLabel("New password", { exact: true });
    const confirmation = page.getByLabel("Confirm new password", { exact: true });
    await expect(password).toHaveAttribute("type", "password");

    await password.fill("MismatchedPass12");
    await confirmation.fill("MismatchedPass34");
    await page.getByRole("button", { name: "Save password and continue", exact: true }).click();
    await expect(page.locator("form [role=alert]")).toHaveText("Both passwords must match.");

    await confirmation.fill("MismatchedPass12");
    await page.getByRole("button", { name: "Save password and continue", exact: true }).click();
    await expect(page.locator("form [role=alert]")).toContainText("At least 12 characters");
    await expect(page).toHaveURL(/\/auth\/set-password$/);
    await expect(page.getByRole("button", { name: "Save password and continue", exact: true })).toBeEnabled();

    for (const width of [320, 768, 1440]) {
      await page.setViewportSize({ width, height: 900 });
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
      await page.screenshot({ path: testInfo.outputPath(`set-password-${width}.png`), animations: "disabled" });
    }

    accept = true;
    await page.getByRole("button", { name: "Save password and continue", exact: true }).click();
    await expect(page).toHaveURL(/\/dashboard$/);
  });

  test("pending audit throttled workspace checks recover without a false access request", async ({ page }) => {
    let throttled = true;
    await page.route("**/api/auth/session", route => route.fulfill({ json: { user: { id: "audit-user", email: "audit@example.test", isMasterAdmin: false }, expires: "2099-01-01T00:00:00Z" } }));
    await page.route("**/api/team", route => route.fulfill(throttled
      ? { status: 429, json: { error: "Too many requests" } }
      : { json: { workspace: { id: "workspace", name: "Customer" }, members: [] } }));
    await page.reload();
    await expect(page.getByText("Workspace access could not be checked", { exact: true })).toBeVisible();
    await expect(page).toHaveURL(/\/dashboard$/);
    throttled = false;
    await page.getByRole("button", { name: "Try again", exact: true }).click();
    await expect(page.getByRole("heading", { name: "Dashboard", exact: true })).toBeVisible();
    await expect(page).not.toHaveURL(/request-access/);
  });

  test("pending audit activity is readable and recovers without claiming an empty history", async ({ page }, testInfo) => {
    await page.goto("/audit-log");
    await expect(page.locator("main").getByRole("alert")).toContainText("Could not load activity");
    await expect(page.getByText("No activity recorded yet.", { exact: true })).toHaveCount(0);
    let secondPageFails = true;
    await page.route("**/api/audit-log?**", route => {
      const requested = Number(new URL(route.request().url()).searchParams.get("page"));
      return route.fulfill(requested === 2 && secondPageFails
        ? { status: 503, json: { error: "Unavailable" } }
        : { json: { logs: [{ id: `event-${requested}`, action: requested === 1 ? "scan.failed" : "settings.updated", actor: "customer@example.test", target: "https://example.test", createdAt: "2026-09-21T00:00:00Z", summary: requested === 1 ? "The scan did not complete. Review scan history before trying again." : "Workspace settings were updated.", metadata: { stack: "Prisma private diagnostic", password: "hidden-secret" } }], pagination: { page: requested, limit: 50, total: 51, pages: 2 } } });
    });
    await page.getByRole("button", { name: "Try again", exact: true }).click();
    await expect(page.getByText("Scan failed", { exact: true })).toBeVisible();
    await expect(page.getByText(/Prisma private diagnostic|hidden-secret/)).toHaveCount(0);
    await page.getByRole("button", { name: "Next activity page", exact: true }).press("Enter");
    await expect(page.locator("main").getByRole("alert")).toContainText("Could not load activity");
    await expect(page.getByText("Scan failed", { exact: true })).toBeVisible();
    secondPageFails = false;
    await page.getByRole("button", { name: "Try again", exact: true }).click();
    await expect(page.getByText("Workspace settings were updated.", { exact: true })).toBeVisible();
    await page.getByRole("button", { name: "Previous activity page", exact: true }).press("Space");
    await expect(page.getByText("Scan failed", { exact: true })).toBeVisible();
    for (const width of [390, 768, 1440]) {
      await page.setViewportSize({ width, height: 844 });
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
      await page.screenshot({ path: testInfo.outputPath(`activity-${width}.png`) });
    }
  });

  test("pending audit workspace capabilities gate scans and distinguish account allowances", async ({ page }) => {
    let permissions = ["scans.view"];
    let unavailable = false;
    let submitted = 0;
    let featureRequests = 0;
    let workspaceRequests = 0;
    page.on("request", request => { if (request.method() === "POST" && new URL(request.url()).pathname === "/api/scan") submitted++; });
    await page.route("**/api/auth/session", route => route.fulfill({ json: {
      user: { id: "audit-user", name: "Viewer", email: "audit@example.test", isMasterAdmin: false }, expires: "2099-01-01T00:00:00Z",
    } }));
    await page.route("**/api/team", route => route.fulfill({ json: { workspace: { id: "viewer-workspace", name: "Enterprise workspace", plan: "ENTERPRISE" }, members: [] } }));
    await page.route("**/api/workspaces", route => {
      workspaceRequests++;
      return route.fulfill({ json: { activeWorkspaceId: "viewer-workspace", selectionInvalid: false, workspaces: [{ id: "viewer-workspace", name: "Enterprise workspace", slug: "enterprise", role: "VIEWER", plan: "ENTERPRISE", memberCount: 1 }] } });
    });
    await page.route("**/api/onboarding/status", route => route.fulfill({ json: { persona: "developer", totalScans: 1 } }));
    await page.route("**/api/workspace/features", route => {
      featureRequests++;
      return route.fulfill(unavailable
        ? { status: 503, json: { error: "Unavailable" } }
        : { json: { features: ["dashboard", "scans", "settings"], workspaceId: "viewer-workspace", plan: "ENTERPRISE", permissions } });
    });
    await page.reload();
    await expect(page.getByText("Your role in this workspace does not allow new scans. Ask a workspace owner or administrator for scanning access.", { exact: true })).toBeVisible();
    const input = page.getByRole("textbox", { name: "Website URL to scan for accessibility compliance" });
    const scan = page.getByRole("button", { name: "Scan", exact: true });
    await expect(input).toBeDisabled();
    await expect(scan).toBeDisabled();
    expect(featureRequests).toBe(1);
    expect(workspaceRequests).toBe(1);

    permissions = ["scans.view", "scans.run"];
    await page.evaluate(() => window.dispatchEvent(new CustomEvent("reglayer:features-invalidated")));
    await expect(input).toBeEnabled();
    expect(featureRequests).toBe(2);
    await input.fill("https://example.test");
    await expect(scan).toBeEnabled();
    unavailable = true;
    await page.evaluate(() => window.dispatchEvent(new CustomEvent("reglayer:features-invalidated")));
    const failure = page.getByRole("alert").filter({ hasText: "Could not confirm scanning access" });
    await expect(failure).toBeVisible();
    expect(featureRequests).toBe(3);
    await expect(scan).toBeDisabled();
    unavailable = false;
    permissions = ["scans.view"];
    await failure.locator("..").getByRole("button", { name: "Try again", exact: true }).click();
    await expect(failure).toHaveCount(0);
    await expect(scan).toBeDisabled();
    await expect(input).toHaveValue("https://example.test");
    expect(featureRequests).toBe(4);
    expect(submitted).toBe(0);

    await page.route("**/api/credits", route => route.fulfill({ json: {
      plan: "FREE", credits: { used: 0, limit: 20, totalAvailable: 20, remaining: 20, daysUntilReset: 28, unlimited: false },
      limits: { scansPerMonth: 3, pagesPerScan: 1, teamMembers: 1, auditLogDays: 7 }, features: {}, costs: {},
    } }));
    await page.getByRole("button", { name: "Toggle navigation menu", exact: true }).click();
    await page.getByRole("navigation", { name: "Main", exact: true }).getByRole("link", { name: "Settings", exact: true }).click();
    await expect(page.getByText("Account plan and AI credits", { exact: true })).toBeVisible();
    await expect(page.getByText(/These are your account's base allowances/)).toBeVisible();
    expect(featureRequests).toBe(4);
  });

  test("pending audit reason dialog contains focus and preserves a failed draft", async ({ page }, testInfo) => {
    await page.route("**/api/violations?**", route => route.fulfill({ json: {
      violations: [{ id: "note-finding", ruleId: "label", impact: "serious", help: "Form labels", description: "Missing label", helpUrl: null, tags: [], wcagCriteria: null, affectedElements: [], status: "OPEN", statusNote: null, statusUpdatedAt: null, statusUpdatedBy: null, statusUpdatedByName: null, verifiedAt: null }],
      summary: { OPEN: 1 }, total: 1, page: 1, limit: 25, totalPages: 1,
    } }));
    await page.route("**/api/violations/status", route => route.fulfill({ status: 503, json: { message: "Saving is temporarily unavailable. Please try again." } }));
    await page.goto("/violations?scanId=note-scan");
    const trigger = page.getByRole("button", { name: "Change status", exact: true });
    await trigger.focus();
    await page.keyboard.press("Enter");
    await page.getByRole("option").last().focus();
    await page.keyboard.press("Enter");
    const dialog = page.getByRole("dialog");
    const reason = dialog.getByRole("textbox");
    await expect(reason).toHaveAccessibleName(/reason/i);
    await expect(reason).toBeFocused();
    await reason.fill("The owner has accepted this documented risk pending redesign.");
    await page.keyboard.press("Shift+Tab");
    const confirm = dialog.getByRole("button", { name: "Confirm", exact: true });
    await expect(confirm).toBeFocused();
    await page.keyboard.press("Tab");
    await expect(reason).toBeFocused();
    await page.keyboard.press("Escape");
    await expect(dialog).toHaveCount(0);
    await expect(trigger).toBeFocused();

    await trigger.press("Enter");
    await page.getByRole("option").last().press("Enter");
    const draft = "The owner has accepted this documented risk pending redesign.";
    await reason.fill(draft);
    await confirm.click();
    await expect(dialog.getByRole("alert")).toContainText("Saving is temporarily unavailable");
    await expect(reason).toHaveValue(draft);
    await expect(confirm).toBeEnabled();
    for (const width of [390, 768, 1440]) {
      await page.setViewportSize({ width, height: 844 });
      expect(await dialog.evaluate(element => element.scrollWidth <= element.clientWidth)).toBe(true);
      await page.screenshot({ path: testInfo.outputPath(`reason-dialog-${width}.png`) });
    }
    await page.route("**/api/violations/status", route => route.fulfill({ json: { status: "ACCEPTABLE_RISK", statusNote: draft, statusUpdatedAt: "2026-09-21T00:00:00Z", statusUpdatedBy: "audit-user" } }));
    await confirm.click();
    await expect(dialog).toHaveCount(0);
  });

  test("pending audit form controls retain native labels and keyboard actions", async ({ page }) => {
    await page.locator("summary").filter({ hasText: "Advanced options" }).click();
    const deepScan = page.getByRole("checkbox", { name: "Deep Scan", exact: true });
    await expect(deepScan).toHaveAccessibleDescription(/interactive states/);
    await deepScan.focus();
    await page.keyboard.press("Space");
    await expect(deepScan).toBeChecked();
    await page.keyboard.press("Space");
    await expect(deepScan).not.toBeChecked();

    await page.route("**/api/schedules", route => route.fulfill({ json: { schedules: [] } }));
    await page.goto("/monitoring?url=https%3A%2F%2Fexample.test");
    const frequency = page.getByRole("group", { name: "Scan Frequency", exact: true });
    const weekly = frequency.getByRole("button").nth(1);
    await weekly.focus();
    await page.keyboard.press("Space");
    await expect(weekly).toHaveAttribute("aria-pressed", "true");
    await expect(frequency.getByRole("button").first()).toHaveAttribute("aria-pressed", "false");

    await page.route("**/api/audits", route => route.fulfill({ json: { audits: [{
      id: "pending-audit", scope: "Checkout", status: "in_progress", automatedScore: 80,
      manualScore: null, combinedScore: null, createdAt: "2026-09-21T00:00:00Z",
    }] } }));
    await page.goto("/manual-testing");
    const audits = page.getByRole("list", { name: "Previous manual test audits", exact: true });
    await expect(audits.getByRole("listitem")).toHaveCount(1);
    const audit = audits.getByRole("button", { name: /^Audit: Checkout/ });
    await audit.focus();
    const request = page.waitForRequest(request => new URL(request.url()).pathname === "/api/audits/pending-audit/plan");
    await page.keyboard.press("Enter");
    await request;
    await expect(page.locator("main").getByRole("alert")).toContainText("Offline audit fixture");
  });

  test("real-user utility controls stay clear of actions and work by keyboard", async ({ page }, testInfo) => {
    await page.getByRole("textbox", { name: "Website URL to scan for accessibility compliance" }).fill("https://example.test");
    for (const width of [390, 768, 1440]) {
      await page.setViewportSize({ width, height: 844 });
      const accessibility = page.getByRole("button", { name: "Accessibility", exact: true });
      const chat = page.getByRole("button", { name: "Open AI Chat", exact: true });
      await expect(accessibility).toBeVisible();
      if (width < 1024) {
        expect((await accessibility.boundingBox())!.y).toBeLessThan(56);
        expect((await chat.boundingBox())!.y).toBeLessThan(56);
      }
      await accessibility.focus();
      await page.keyboard.press("Enter");
      const contrast = page.getByRole("switch", { name: "High contrast", exact: true });
      await expect(contrast).toBeVisible();
      await contrast.focus();
      await page.keyboard.press("Space");
      await expect(contrast).toHaveAttribute("aria-checked", "true");
      await page.keyboard.press("Space");
      await page.keyboard.press("Escape");
      await expect(accessibility).toBeFocused();
      await chat.focus();
      await page.keyboard.press("Enter");
      await expect(page.getByRole("textbox", { name: "Chat message input", exact: true })).toBeVisible();
      await page.getByRole("button", { name: "Close chat panel", exact: true }).focus();
      await page.keyboard.press("Enter");
      await expect(chat).toBeFocused();
      const scan = page.getByRole("button", { name: "Scan", exact: true });
      await expect(scan).toBeEnabled();
      await scan.scrollIntoViewIfNeeded();
      expect(await scan.evaluate(element => {
        const rectangle = element.getBoundingClientRect();
        return [0.1, 0.5, 0.9].every(fraction => element.contains(document.elementFromPoint(rectangle.x + rectangle.width * fraction, rectangle.y + rectangle.height / 2)));
      })).toBe(true);
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
      await page.screenshot({ path: testInfo.outputPath(`utility-controls-${width}.png`), animations: "disabled" });
    }
  });

  test("real-user report drafts explain failure and do not promise coverage", async ({ page }) => {
    await page.route("**/api/scans", route => route.fulfill({ json: { scans: [
      { id: "draft-scan", url: "https://example.test", status: "COMPLETED", score: 80 },
    ] } }));
    await page.goto("/compliance?tab=vpat");
    await page.getByRole("textbox", { name: "Product Name", exact: true }).fill("Customer Portal");
    await page.getByRole("textbox", { name: "Vendor Name", exact: true }).fill("Example Company");
    await page.getByRole("button", { name: "Generate draft", exact: true }).click();
    await expect(page.locator("main").getByRole("alert")).toContainText("Could not generate the draft");
    await expect(page.getByRole("textbox", { name: "Product Name", exact: true })).toHaveValue("Customer Portal");
    await expect(page.getByRole("button", { name: "Generate draft", exact: true })).toBeEnabled();
    await expect(page.getByText(/legally defensible|\$10K/)).toHaveCount(0);
    await page.route("**/api/warranty", route => route.fulfill({ json: { policies: [] } }));
    await page.goto("/warranty");
    await expect(page.getByText(/This screen does not establish insurance or legal coverage/)).toBeVisible();
    await expect(page.getByText(/Enroll a site.*financial coverage/)).toHaveCount(0);
    await page.goto("/analysis?tab=screen-reader");
    await expect(page.getByText(/This simulation does not reproduce NVDA/)).toBeVisible();
    await expect(page.getByText(/exact reading order and announcements/)).toHaveCount(0);
  });

  test("real-user triage exposes every affected element with keyboard-accessible evidence", async ({ page }, testInfo) => {
    const affectedElements = Array.from({ length: 4 }, (_, index) => ({ html: `<input id="field-${index}">`, target: [`#field-${index}`], failureSummary: `Field ${index} has no associated label` }));
    await page.route("**/api/violations?**", route => route.fulfill({ json: {
      violations: [{ id: "triage-evidence", ruleId: "label", impact: "critical", help: "Form elements must have labels", description: "Missing form labels", helpUrl: "https://example.test/help", tags: ["wcag2a"], wcagCriteria: "4.1.2", affectedElements, status: "OPEN", statusNote: null, statusUpdatedAt: null, statusUpdatedBy: null, statusUpdatedByName: null, verifiedAt: null }],
      summary: { OPEN: 1 }, total: 1, page: 1, limit: 25, totalPages: 1,
    } }));
    for (const width of [390, 768, 1440]) {
      await page.setViewportSize({ width, height: 900 });
      await page.goto("/violations?scanId=triage-scan");
      await expect(page.getByText("#field-0", { exact: true })).toBeVisible();
      const disclosure = page.locator("summary").filter({ hasText: "+2 more elements" });
      await disclosure.focus();
      await page.keyboard.press("Space");
      await expect(page.getByText("#field-3", { exact: true })).toBeVisible();
      await expect(page.getByText("Field 3 has no associated label", { exact: true })).toBeVisible();
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
      await page.screenshot({ path: testInfo.outputPath(`triage-evidence-${width}.png`) });
    }
  });

  test("real-user remediation loading failure stays distinct from an empty scan list", async ({ page }) => {
    await page.goto("/automation?tab=remediation");
    await expect(page.locator("main").getByRole("alert")).toContainText("Could not load completed scans");
    await expect(page.getByText(/No completed scans yet/)).toHaveCount(0);
    await page.route("**/api/scans?*", route => route.fulfill({ json: { scans: [
      { id: "remediation-scan", url: "https://example.test", status: "COMPLETED", totalViolations: 2, createdAt: "2026-09-21T00:00:00Z" },
    ] } }));
    await page.getByRole("button", { name: "Try again", exact: true }).click();
    await expect(page.getByRole("combobox", { name: /^Completed scan/ })).toBeVisible();
    await expect(page.locator("main").getByRole("alert")).toHaveCount(0);
  });

  test("real-user homepage distinguishes automated evidence from compliance guarantees", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByRole("heading", { level: 1 })).toContainText("RegLayer");
    await expect(page.locator("main").getByText(/not a compliance certification/)).toBeVisible();
    await expect(page.locator("main").getByText("Base Free plan: 3 scans per month.", { exact: true })).toBeVisible();
    await expect(page.locator("main").getByText(/fully automated|strict as a manual tester|costs by 70%|10 scans per month/i)).toHaveCount(0);
    await expect(page.locator("#testimonials")).toHaveCount(0);
  });

  test("real-user scan follow-ups preserve context without automatically submitting", async ({ page }) => {
    const writes: string[] = [];
    page.on("request", request => { if (request.method() === "POST") writes.push(new URL(request.url()).pathname); });
    await page.route("**/api/scans/follow-up-scan", route => route.fulfill({ json: { scan: {
      id: "follow-up-scan", url: "https://example.test/checkout?step=shipping", timestamp: "2026-09-21T00:00:00Z", status: "completed",
      summary: { score: 80, critical: 1, serious: 0, moderate: 0, minor: 0, totalViolations: 1 },
      metadata: { pageTitle: "Checkout", scanDuration: 1200, browserEngine: "chromium", axeCoreVersion: "4" },
      violations: [{ id: "label", impact: "critical", description: "Missing label", help: "Add a visible label", helpUrl: "https://example.test/help", wcagTags: ["wcag2a"], nodes: [] }],
    }, compliance: { overallCompliance: 100, ruleResults: [] } } }));
    await page.route("**/api/schedules", route => route.fulfill({ json: { schedules: [] } }));
    await page.route("**/api/audits", route => route.fulfill({ json: { audits: [] } }));
    await page.goto("/scans/follow-up-scan");
    await expect(page.getByText("Policy rules without detected findings", { exact: true })).toBeVisible();
    await expect(page.getByText("Automated accessibility score")).toBeVisible();
    await expect(page.getByText(/not WCAG conformance/)).toBeVisible();
    await page.getByRole("link", { name: "Monitor this page", exact: true }).click();
    await expect(page.getByRole("textbox", { name: "URL to Monitor", exact: true })).toHaveValue("https://example.test/checkout?step=shipping");
    await expect(page.getByRole("textbox", { name: "Schedule Name", exact: true })).not.toHaveValue("");
    await page.goBack();
    await page.getByRole("link", { name: "Manual-test the rest", exact: true }).click();
    await expect(page.getByRole("textbox", { name: "Scan ID", exact: true })).toHaveValue("follow-up-scan");
    expect(writes.filter(path => path === "/api/schedules" || path === "/api/audits")).toEqual([]);
  });

  test("real-user matrix failure is recoverable and does not imply an empty workspace", async ({ page }) => {
    await page.goto("/compliance?tab=matrix");
    await expect(page.locator("main").getByRole("alert")).toContainText("Could not load the compliance matrix");
    await page.route("**/api/scans?*", route => route.fulfill({ json: { scans: [
      { id: "failed-newer", url: "https://example.test/failed", status: "FAILED", score: null, createdAt: "2026-09-21T00:00:00Z" },
      { id: "completed-matrix", url: "https://example.test/", status: "COMPLETED", score: 80, createdAt: "2026-09-20T00:00:00Z" },
    ] } }));
    await page.route("**/api/scans/completed-matrix/wcag-matrix", route => route.fulfill({ json: {
      scanId: "completed-matrix", url: "https://example.test/", score: 80,
      matrix: [{ criterion: "1.4.3", level: "AA", principle: "Perceivable", title: "Contrast (Minimum)", status: "not-tested", violations: [], impact: null }],
      summary: { total: 1, passed: 0, failed: 0, notTested: 1 },
    } }));
    await page.getByRole("button", { name: "Try again", exact: true }).click();
    await expect(page.getByText("Contrast (Minimum)", { exact: true })).toBeVisible();
    await expect(page.locator("main").getByRole("alert")).toHaveCount(0);
    await expect(page.getByText("No automated criteria assessed", { exact: true })).toBeVisible();
    await expect(page.getByText("Overall Compliance", { exact: true })).toHaveCount(0);
  });

  test("real-user single-scan trend shows the measured score without inventing a decline", async ({ page }) => {
    await page.route("**/api/trends?*", route => route.fulfill({ json: {
      url: "https://example.test/", scoreTrend: [{ date: "2026-09-21T00:00:00Z", score: 82, scanId: "one-scan" }],
      violationTrend: [{ date: "2026-09-21T00:00:00Z", critical: 0, serious: 2, moderate: 0, minor: 0, total: 2 }],
      streak: { currentStreak: 0, bestStreak: 0, lastImprovedAt: null }, delta: null,
      summary: { firstScanAt: "2026-09-21T00:00:00Z", totalScans: 1, averageScore: 82, peakScore: 82, lowestScore: 82 },
    } }));
    await page.goto("/trends?url=https%3A%2F%2Fexample.test%2F");
    const score = page.getByText("AIS Score", { exact: true }).locator("../..");
    await expect(score.getByText("82", { exact: true })).toBeVisible();
    await expect(page.getByText("Run another scan to compare progress", { exact: true })).toBeVisible();
    await expect(page.getByText(/Score dropped/)).toHaveCount(0);
  });

  test("notification bulk read is explicit, scoped, persistent and usable at both widths", async ({ page }, testInfo) => {
    let scope = "audit-user:workspace-one";
    let notifications = Array.from({ length: 20 }, (_, index) => ({
      id: `notice-${index}`, type: index === 0 ? "violation" : "scan", title: index === 0 ? "2 critical issues found" : "Scan completed",
      body: `example.test/page-${index} scored 80/100`, href: `/scans/notice-${index}`, createdAt: "2026-09-01T00:00:00Z", severity: index === 0 ? "critical" : "info",
    }));
    let failFeed = false;
    await page.route("**/api/notifications/feed", route => route.fulfill({
      status: failFeed ? 503 : 200, json: failFeed ? { error: "Offline fixture" } : { scope, items: notifications },
    }));
    async function openPanel() {
      if ((page.viewportSize()?.width ?? 0) < 1024) await page.getByRole("button", { name: "Toggle navigation menu" }).click();
      await page.locator('button[aria-controls="user-menu-popup"]').filter({ visible: true }).click();
      await page.locator("#user-menu-popup").getByRole("button", { name: /^Notifications/ }).click();
      return page.getByRole("region", { name: "Notifications", exact: true });
    }
    for (const width of [390, 1440]) {
      scope = `audit-user:workspace-${width}`;
      await page.setViewportSize({ width, height: 900 });
      await page.reload();
      const panel = await openPanel();
      await expect(panel.getByRole("img", { name: "Unread", exact: true })).toHaveCount(20);
      const bulk = panel.getByRole("button", { name: "Mark all as read", exact: true });
      await expect(bulk).toBeEnabled();
      await bulk.click();
      await expect(bulk).toBeDisabled();
      await expect(panel.getByText("All recent notifications are read", { exact: true })).toBeVisible();
      await expect(panel.getByRole("img", { name: "Unread", exact: true })).toHaveCount(0);
      await expect(panel.getByRole("button", { name: "View activity", exact: true })).toBeVisible();
      const bounds = await panel.boundingBox();
      expect(bounds!.y).toBeGreaterThanOrEqual(0);
      expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(width);
      await page.screenshot({ path: testInfo.outputPath(`notifications-${width}.png`) });
      const panelSelector = await panel.evaluate(element => `#${CSS.escape(element.id)}`);
      expect((await new AxeBuilder({ page }).include(panelSelector).withTags(WCAG_TAGS).analyze()).violations).toEqual([]);
      await page.reload();
      const reopened = await openPanel();
      await expect(reopened.getByRole("button", { name: "Mark all as read", exact: true })).toBeDisabled();
      notifications = [{ ...notifications[0], id: `new-${width}`, title: "Newly received scan" }, ...notifications];
      await reopened.getByRole("button", { name: "Try again", exact: true }).click();
      await expect(reopened.getByRole("img", { name: "Unread", exact: true })).toHaveCount(1);
      await reopened.getByRole("button", { name: "Mark all as read", exact: true }).click();
      await expect(reopened.getByRole("img", { name: "Unread", exact: true })).toHaveCount(0);
      await reopened.getByRole("button", { name: "View activity", exact: true }).focus();
      await page.keyboard.press("Escape");
      await expect(reopened).toHaveCount(0);
      await expect(page.locator("#user-menu-popup").getByRole("button", { name: "Notifications", exact: true })).toBeFocused();
      notifications = notifications.slice(1);
    }
    failFeed = true;
    await page.reload();
    const failedPanel = await openPanel();
    await expect(failedPanel.getByRole("alert")).toContainText("could not be loaded");
    await expect(failedPanel.getByText("You're all caught up", { exact: true })).toHaveCount(0);
    failFeed = false;
    await failedPanel.getByRole("button", { name: "Try again", exact: true }).click();
    await expect(failedPanel.getByRole("alert")).toHaveCount(0);
  });

  test("documentation guides stay readable and linked on desktop and mobile", async ({ page }, testInfo) => {
    const guides = ["getting-started", "scanning", "monitoring", "reports", "team-management", "integrations"];
    for (const width of [390, 1440]) {
      await page.setViewportSize({ width, height: 900 });
      await page.goto("/docs");
      await page.getByRole("searchbox", { name: "Search documentation" }).fill("mark all as read");
      await expect(page.locator("main").getByRole("link", { name: /Monitoring & Notifications/ })).toHaveCount(1);
      await page.getByRole("searchbox", { name: "Search documentation" }).fill("no-such-guide-xyz");
      await expect(page.getByText("No matching guides. Try a different search.", { exact: true })).toBeVisible();
      for (const guide of guides) {
        await page.goto(`/docs/${guide}`);
        await expect(page.locator("main h1")).toBeVisible();
        await expect(page.locator("main").getByRole("heading", { name: "Quick start", exact: true })).toBeVisible();
        const anchors = await page.getByRole("navigation", { name: "On this page" }).locator("a").evaluateAll(links => links.map(link => link.getAttribute("href")!));
        for (const anchor of anchors) await expect(page.locator(anchor)).toHaveCount(1);
        expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
        expect((await new AxeBuilder({ page }).include("main").withTags(WCAG_TAGS).analyze()).violations).toEqual([]);
        if (guide === "monitoring" || guide === "scanning") await page.screenshot({ path: testInfo.outputPath(`docs-${guide}-${width}.png`), fullPage: true });
      }
    }
  });

  test("closed navigation is inert; opening and dismissing restores focus", async ({ page }) => {
    const drawer = page.locator("#mobile-nav-drawer");
    const toggle = page.getByRole("button", { name: "Toggle navigation" });
    await expect(toggle).toBeVisible();
    await expect(drawer).toHaveAttribute("inert", "");
    await expect(page.getByRole("dialog", { name: "Navigation" })).toHaveCount(0);
    await toggle.click();
    await expect(drawer).not.toHaveAttribute("inert", "");
    await expect(drawer.getByRole("button", { name: "Close", exact: true })).toBeFocused();
    await expect(page.locator("#main-content")).toHaveAttribute("inert", "");
    await page.keyboard.press("Shift+Tab");
    await expect(drawer).toContainText("Settings");
    expect(await drawer.evaluate((element) => element.contains(document.activeElement))).toBe(true);
    await page.keyboard.press("Escape");
    await expect(drawer).toHaveAttribute("inert", "");
    await expect(toggle).toBeFocused();
    await expect(page.locator("#main-content")).not.toHaveAttribute("inert", "");
    await toggle.click();
    await drawer.getByRole("button", { name: "Close", exact: true }).click();
    await expect(toggle).toBeFocused();
    await toggle.click();
    await page.setViewportSize({ width: 1280, height: 800 });
    await expect(page.locator("#main-content")).not.toHaveAttribute("inert", "");
    await expect(drawer).toHaveAttribute("inert", "");
  });

  test("settings plan failure recovers without leaving the page", async ({ page }) => {
    await page.goto("/settings");
    await expect(page.getByRole("button", { name: "Try again", exact: true })).toBeVisible();
    await expect(page.getByText("Loading...", { exact: true })).toHaveCount(0);
    await page.route("**/api/credits", (route) => route.fulfill({ json: {
      plan: "PRO", credits: { used: 1, limit: 500, totalAvailable: 500, remaining: 499, daysUntilReset: 10, unlimited: false },
      limits: { scansPerMonth: 100, pagesPerScan: 50, teamMembers: 5, auditLogDays: 30 }, features: {}, costs: {},
    } }));
    await page.getByRole("button", { name: "Try again", exact: true }).click();
    await expect(page.getByText("499/500", { exact: true })).toBeVisible();
  });

  test("team administration preserves drafts and members on failures and limits viewer controls", async ({ page }, testInfo) => {
    let viewer = false;
    let failInvite = true;
    let failRemove = true;
    await page.route("**/api/team**", async (route) => {
      if (route.request().method() === "POST") {
        if (failInvite) return route.abort("failed");
        return route.fulfill({ status: 201, json: { id: "invited", userId: "invited", name: "Invited user", email: "invitee@example.test", role: "MEMBER", plan: "FREE", joinedAt: "2026-09-21T00:00:00Z", emailSent: true } });
      }
      if (route.request().method() === "DELETE") return route.fulfill(failRemove ? { status: 503, json: { error: "Unavailable" } } : { json: { success: true } });
      return route.fulfill({ json: {
        workspace: { id: "selected-team", name: "Selected team", slug: "selected", plan: "PRO" },
        currentUserRole: viewer ? "VIEWER" : "ADMIN", currentUserIsMasterAdmin: false,
        members: [
          { id: "peer", userId: "peer", name: "Peer Admin", email: "peer@example.test", role: "ADMIN", plan: "PRO", joinedAt: "2026-09-01T00:00:00Z" },
          { id: "member", userId: "member", name: "Team Member", email: "member@example.test", role: "MEMBER", plan: "FREE", joinedAt: "2026-09-01T00:00:00Z" },
        ],
      } });
    });
    await page.goto("/manage?tab=team");
    await expect(page.getByText("peer@example.test", { exact: true })).toBeVisible();
    await expect(page.getByText("member@example.test", { exact: true })).toBeVisible();
    await expect(page.getByRole("button", { name: /Reset password for/ })).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Remove peer@example.test", exact: true })).toHaveCount(0);
    await page.getByRole("button", { name: "Invite Member", exact: true }).click();
    const email = page.getByRole("textbox", { name: "Invite email", exact: true });
    await email.fill("invitee@example.test");
    await page.getByRole("button", { name: "Send Invite", exact: true }).click();
    await expect(page.getByRole("alert").filter({ hasText: "Invitation could not be confirmed" })).toBeVisible();
    await expect(email).toHaveValue("invitee@example.test");
    await expect(page.getByRole("button", { name: "Send Invite", exact: true })).toBeEnabled();
    failInvite = false;
    await page.getByRole("button", { name: "Send Invite", exact: true }).click();
    await expect(page.getByText("invitee@example.test", { exact: true })).toBeVisible();
    await page.getByRole("button", { name: "Remove member@example.test", exact: true }).click();
    await page.getByRole("dialog").getByRole("button", { name: "Remove", exact: true }).click();
    await expect(page.getByText("Failed to remove member", { exact: true })).toBeVisible();
    await expect(page.getByText("member@example.test", { exact: true })).toBeVisible();
    failRemove = false;
    await page.getByRole("dialog").getByRole("button", { name: "Remove", exact: true }).click();
    await expect(page.getByText("member@example.test", { exact: true })).toHaveCount(0);
    viewer = true;
    await page.reload();
    await expect(page.getByText("member@example.test", { exact: true })).toBeVisible();
    await expect(page.getByText("peer@example.test", { exact: true })).toBeVisible();
    await expect(page.getByRole("button", { name: "Invite Member", exact: true })).toHaveCount(0);
    await expect(page.getByRole("button", { name: /Remove .*example/ })).toHaveCount(0);
    for (const width of [320, 768, 1440]) {
      await page.setViewportSize({ width, height: 900 });
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
      await page.screenshot({ path: testInfo.outputPath(`team-viewer-${width}.png`), animations: "disabled" });
    }
  });

  test("visual workflow preview never claims scans or notifications were executed", async ({ page }, testInfo) => {
    await page.goto("/workflows");
    await page.getByRole("link", { name: "Visual Builder" }).click();
    await expect(page).toHaveURL(/\/workflows\/builder$/);
    const preview = page.getByRole("button", { name: "Preview", exact: true });
    await preview.click();
    await expect(page.getByText("Offline audit fixture", { exact: true })).toBeVisible();
    await expect(preview).toBeEnabled();
    await page.route("**/api/workflows/builder/run", (route) => route.fulfill({ json: {
      status: "preview", executed: false,
      plannedNodes: ["trigger-1", "action-1", "condition-1", "action-2", "action-3"],
      message: "Structure preview only. No scans, AI calls, reports or notifications were executed. Conditional branches are listed, not evaluated.",
    } }));
    await preview.click();
    const result = page.getByRole("status", { name: "Workflow preview" });
    await expect(result).toContainText("No scans, AI calls, reports or notifications were executed");
    await expect(result.getByRole("listitem")).toHaveCount(5);
    await expect(page.getByText("Workflow execution started", { exact: true })).toHaveCount(0);
    await expect(page.getByRole("textbox", { name: "Workflow name" })).toHaveValue("Untitled Workflow");
    for (const width of [390, 768, 1440]) {
      await page.setViewportSize({ width, height: 900 });
      await expect(preview).toBeVisible();
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
      await page.screenshot({ path: testInfo.outputPath(`workflow-preview-${width}.png`), animations: "disabled" });
    }
    await page.getByRole("textbox", { name: "Workflow name" }).fill("Updated workflow");
    await expect(result).toHaveCount(0);
  });

  test("scan history keeps failed loads distinct from empty or clean results", async ({ page }) => {
    await page.goto("/scans");
    await page.getByRole("button", { name: "Try again", exact: true }).click();
    await expect(page.getByRole("button", { name: "Try again", exact: true })).toBeVisible();
    await page.route("**/api/scans", (route) => route.fulfill({ json: { scans: [
      { id: "completed", url: "https://example.test/one", pageTitle: "Completed homepage", status: "COMPLETED", score: 80, totalViolations: 2, critical: 0, serious: 2, moderate: 0, minor: 0, createdAt: "2026-09-21T00:00:00Z" },
      { id: "failed", url: "https://example.test/two", pageTitle: "Unreachable checkout", status: "FAILED", score: null, totalViolations: 0, critical: 0, serious: 0, moderate: 0, minor: 0, createdAt: "2026-09-20T00:00:00Z" },
    ] } }));
    await page.getByRole("button", { name: "Try again", exact: true }).click();
    await expect(page.getByRole("link", { name: "Completed homepage", exact: true })).toHaveAttribute("href", "/scans/completed");
    await expect(page.getByText("Scan failed", { exact: true })).toBeVisible();
    await expect(page.getByLabel("Improved since previous scan of this URL")).toHaveCount(0);
    await expect(page.getByRole("checkbox", { name: "Compare Completed homepage" })).toBeVisible();
    await page.getByRole("button", { name: "Delete Unreachable checkout", exact: true }).click();
    await page.getByRole("dialog").getByRole("button", { name: "Delete", exact: true }).click();
    await expect(page.getByText("Scan could not be deleted. Please try again.", { exact: true })).toBeVisible();
    await expect(page.getByRole("link", { name: "Unreachable checkout", exact: true })).toBeVisible();
  });

  test("daily navigation stays focused and scan options are optional", async ({ page }) => {
    await expect(page.getByRole("combobox", { name: "Scan region", exact: true })).toBeHidden();
    await page.locator("summary").filter({ hasText: "Advanced options" }).click();
    await expect(page.getByRole("combobox", { name: "Scan region", exact: true })).toBeVisible();
    await page.getByRole("button", { name: "Toggle navigation menu" }).click();
    const drawer = page.getByRole("dialog", { name: "Navigation", exact: true });
    await expect(drawer.getByRole("link", { name: "Testing", exact: true })).toBeVisible();
    await expect(drawer.getByRole("link", { name: "Agents", exact: true })).toBeHidden();
    await drawer.locator("summary").filter({ hasText: "More tools" }).click();
    await drawer.getByRole("link", { name: "Agents", exact: true }).click();
    await expect(page).toHaveURL(/\/agents$/);
    await page.getByRole("button", { name: "Toggle navigation menu" }).click();
    await expect(page.getByRole("dialog", { name: "Navigation", exact: true }).getByRole("link", { name: "Agents", exact: true })).toBeVisible();
  });

  test("keyboard search announces failure and opens the selected settings destination", async ({ page }) => {
    await page.getByRole("button", { name: "Toggle navigation menu" }).click();
    await page.getByRole("dialog", { name: "Navigation", exact: true }).getByRole("button", { name: /Search/ }).click();
    const palette = page.getByRole("dialog", { name: "Command palette" });
    const search = palette.getByRole("combobox", { name: "Search commands" });
    await expect(search).toBeFocused();
    await search.fill("API Keys");
    await expect(palette.getByText(/Content search is unavailable/)).toBeVisible();
    await search.press("Tab");
    await expect(palette.getByRole("button", { name: "Close search" })).toBeFocused();
    await page.keyboard.press("Tab");
    await expect(search).toBeFocused();
    await search.press("Enter");
    await expect(page).toHaveURL(/\/settings\?tab=api-keys$/);
  });

  test("violation evidence and computed fixes are available without opening chat", async ({ page }, testInfo) => {
    const nodes = Array.from({ length: 4 }, (_, index) => ({ html: `<span id="item-${index}">Content ${index}</span>`, target: [`#item-${index}`], failureSummary: "Element has insufficient color contrast (foreground color: #999999, background color: #ffffff, font size: 12.0pt (16px), font weight: normal)" }));
    await page.route("**/api/scans/evidence-scan", (route) => route.fulfill({ json: { scan: {
      id: "evidence-scan", url: "https://example.test/", timestamp: "2026-09-21T00:00:00Z", status: "completed",
      summary: { score: 80, critical: 0, serious: 1, moderate: 0, minor: 0, totalViolations: 1 },
      metadata: { pageTitle: "Evidence scan", scanDuration: 1200, browserEngine: "chromium", axeCoreVersion: "4.11.3" },
      violations: [{ id: "color-contrast", impact: "serious", description: "Text contrast is insufficient", help: "Text must be readable", helpUrl: "https://example.test/help", wcagTags: ["wcag2aa"], nodes }],
    }, compliance: null } }));
    await page.goto("/scans/evidence-scan");
    await expect(page.getByText("Suggested color correction", { exact: true })).toBeVisible();
    const extra = page.locator("details").filter({ hasText: "Content 3" });
    await extra.locator("summary").click();
    await expect(extra.getByText("#item-3", { exact: true })).toBeVisible();
    await expect(page.getByRole("dialog", { name: "AI Chat Assistant" })).toHaveCount(0);
    for (const width of [390, 768, 1440]) {
      await page.setViewportSize({ width, height: 900 });
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
      await page.screenshot({ path: testInfo.outputPath(`evidence-${width}.png`), animations: "disabled" });
    }
  });

  test("login network failure re-enables submission and retains the email", async ({ page }) => {
    await page.context().clearCookies();
    await page.route("**/api/auth/session", (route) => route.fulfill({ json: {} }));
    await page.route("**/api/auth/providers", (route) => route.fulfill({ json: { credentials: { id: "credentials", name: "Credentials", type: "credentials", signinUrl: "/api/auth/signin/credentials", callbackUrl: "/api/auth/callback/credentials" } } }));
    await page.route("**/api/auth/csrf", (route) => route.fulfill({ json: { csrfToken: "audit-csrf" } }));
    await page.route("**/api/auth/callback/credentials", (route) => route.abort("failed"));
    await page.goto("/auth/login");
    await page.getByRole("textbox", { name: "Email", exact: true }).fill("audit@example.test");
    await page.getByLabel("Password", { exact: true }).fill("synthetic-test-password");
    await page.getByRole("button", { name: "Sign In", exact: true }).click();
    await expect(page.getByRole("button", { name: "Sign In", exact: true })).toBeEnabled();
    await expect(page.getByRole("textbox", { name: "Email", exact: true })).toHaveValue("audit@example.test");
    await expect(page.getByRole("alert").filter({ hasText: /sign|try|connect/i })).toBeVisible();
  });

  test("violation deep links preserve scan and severity and support keyboard filters", async ({ page }) => {
    const requests: string[] = [];
    await page.route("**/api/violations?**", (route) => {
      requests.push(route.request().url());
      return route.fulfill({ json: { violations: [], summary: { OPEN: 2 }, total: 0, page: 1, limit: 25, totalPages: 0 } });
    });
    await page.goto("/violations?scanId=selected-scan&status=open&impact=critical");
    await expect(page.getByRole("tab", { name: "Open", exact: true })).toHaveAttribute("aria-selected", "true");
    await expect(page.getByRole("combobox", { name: "Violation severity" })).toHaveValue("critical");
    await expect.poll(() => requests.some((url) => { const params = new URL(url).searchParams; return params.get("scanId") === "selected-scan" && params.get("status") === "OPEN" && params.get("impact") === "critical"; })).toBe(true);
    await page.getByRole("tab", { name: "Open", exact: true }).focus();
    await page.keyboard.press("ArrowRight");
    await expect(page.getByRole("tab", { name: "In Progress", exact: true })).toBeFocused();
    await expect(page.getByRole("tab", { name: "In Progress", exact: true })).toHaveAttribute("aria-selected", "true");
    await page.getByRole("combobox", { name: "Violation severity" }).selectOption("minor,moderate");
    await expect.poll(() => requests.some((url) => new URL(url).searchParams.get("impact") === "minor,moderate")).toBe(true);
    await expect(page.getByRole("link", { name: "View scan details" })).toHaveAttribute("href", "/scans/selected-scan");
  });

  test("violations without scans provide a next action instead of an error dead end", async ({ page }) => {
    await page.route("**/api/scans?limit=1", (route) => route.fulfill({ json: { scans: [] } }));
    await page.goto("/violations");
    await expect(page.getByRole("link", { name: "Run a scan", exact: true })).toHaveAttribute("href", "/dashboard#scan-url");
  });

  test("settings sections survive refresh and browser Back", async ({ page }) => {
    await page.goto("/settings?tab=plan");
    await page.getByRole("link", { name: "General", exact: true }).click();
    await expect(page).toHaveURL(/tab=general/);
    await page.reload();
    await expect(page.getByRole("link", { name: "General", exact: true })).toHaveAttribute("aria-current", "page");
    await page.getByRole("link", { name: "Account", exact: true }).click();
    await expect(page).toHaveURL(/tab=account/);
    await page.goBack();
    await expect(page.getByRole("link", { name: "General", exact: true })).toHaveAttribute("aria-current", "page");
    await page.goto("/settings?tab=unknown");
    await expect(page.getByRole("link", { name: "Plan & Usage", exact: true })).toHaveAttribute("aria-current", "page");
  });

  test("mobile testing sections remain labeled and browser Back restores the previous section", async ({ page }) => {
    await page.goto("/test?tab=scans");
    const sections = page.getByRole("navigation", { name: "Section tabs" });
    await expect(sections.getByText("Manual Testing", { exact: true })).toBeVisible();
    await sections.getByRole("link", { name: "Crawl Site", exact: true }).click();
    await expect(page).toHaveURL(/tab=crawl/);
    await page.goBack();
    await expect(sections.getByRole("link", { name: "Scans", exact: true })).toHaveAttribute("aria-current", "page");
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  });

  test("knowledge failures preserve documents and uploads are keyboard accessible", async ({ page }) => {
    await page.goto("/knowledge");
    await expect(page.getByText("No documents yet", { exact: true })).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Try again", exact: true })).toBeVisible();
    let denyDelete = true;
    await page.route("**/api/knowledge*", async (route) => {
      if (route.request().method() === "DELETE") {
        await route.fulfill(denyDelete ? { status: 403, json: { error: "Forbidden" } } : { json: { deleted: true } });
        return;
      }
      await route.fulfill({ json: { documents: [{ id: "policy", title: "Accessibility policy", source: "upload", mimeType: "text/plain", sizeBytes: 1200, status: "READY", chunkCount: 3, errorMessage: null, createdAt: "2026-09-01T00:00:00Z" }] } });
    });
    await page.getByRole("button", { name: "Try again", exact: true }).click();
    await expect(page.getByRole("heading", { name: "Accessibility policy", exact: true })).toBeVisible();
    await page.getByRole("button", { name: "Delete Accessibility policy", exact: true }).click();
    const dialog = page.getByRole("dialog");
    await dialog.getByRole("button", { name: "Delete document", exact: true }).click();
    await expect(page.getByText("Document could not be deleted. Please try again.", { exact: true })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Accessibility policy", exact: true })).toBeVisible();
    await expect(page.getByText("Document deleted", { exact: true })).toHaveCount(0);
    denyDelete = false;
    await dialog.getByRole("button", { name: "Delete document", exact: true }).click();
    await expect(page.getByRole("heading", { name: "Accessibility policy", exact: true })).toHaveCount(0);
    await page.getByRole("button", { name: "Add Document", exact: true }).click();
    await expect(page.getByLabel("Document file", { exact: true })).toBeVisible();
    await page.getByRole("button", { name: "Paste Text", exact: true }).click();
    await page.getByRole("textbox", { name: "Document title", exact: true }).fill("Draft policy");
    await page.getByRole("textbox", { name: "Document content", exact: true }).fill("This is our accessibility policy draft.");
    await page.route("**/api/knowledge", (route) => route.fulfill({ status: 503, json: { error: "Upload unavailable" } }));
    await page.getByRole("button", { name: "Upload & Process", exact: true }).click();
    await expect(page.getByRole("textbox", { name: "Document content", exact: true })).toHaveValue("This is our accessibility policy draft.");
  });

  test("workspace switch uses server selection and preserves it on failure", async ({ page }, testInfo) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    let activeWorkspaceId = "workspace-b";
    let rejectSwitch = true;
    let switchRequests = 0;
    await page.route("**/api/workspaces", async (route) => {
      if (route.request().method() === "POST") {
        switchRequests += 1;
        if (rejectSwitch) {
          await route.fulfill({ status: 403, json: { error: "No membership" } });
        } else {
          activeWorkspaceId = "workspace-a";
          await route.fulfill({ json: { success: true, workspaceId: activeWorkspaceId } });
        }
        return;
      }
      await route.fulfill({ json: { activeWorkspaceId, selectionInvalid: false, workspaces: [
        { id: "workspace-a", name: "Workspace Alpha", slug: "alpha", plan: "PRO", role: "OWNER", memberCount: 1 },
        { id: "workspace-b", name: "Workspace Beta", slug: "beta", plan: "FREE", role: "VIEWER", memberCount: 2 },
      ] } });
    });
    await page.reload();
    const toggle = page.getByRole("button", { name: "Workspace: Workspace Beta", exact: true });
    await expect(toggle).toBeVisible();
    for (const width of [390, 768, 1440]) {
      await page.setViewportSize({ width, height: 900 });
      if (width < 1024) await page.getByRole("button", { name: "Toggle navigation menu" }).click();
      await expect(toggle).toBeVisible();
      await toggle.click();
      await expect(page.getByRole("button", { name: /Workspace Alpha.*PRO/ })).toBeVisible();
      await page.screenshot({ path: testInfo.outputPath(`workspace-switch-${width}.png`), animations: "disabled" });
      await toggle.click();
      if (width < 1024) await page.keyboard.press("Escape");
    }
    await toggle.click();
    page.once("dialog", (dialog) => dialog.dismiss());
    await page.getByRole("button", { name: /Workspace Alpha.*PRO/ }).click();
    expect(switchRequests).toBe(0);
    page.once("dialog", (dialog) => dialog.accept());
    await page.getByRole("button", { name: /Workspace Alpha.*PRO/ }).click();
    await expect(page.getByRole("alert").filter({ hasText: "Workspace switch failed" })).toBeVisible();
    await expect(toggle).toBeVisible();
    const otherTab = await page.context().newPage();
    await otherTab.route("**/api/**", async (route) => {
      const pathname = new URL(route.request().url()).pathname;
      if (pathname === "/api/auth/session") {
        await route.fulfill({ json: { user: { id: "audit-user", email: "audit@example.test", isMasterAdmin: true }, expires: "2099-01-01T00:00:00.000Z" } });
      } else if (pathname === "/api/workspaces") {
        await route.fulfill({ json: { activeWorkspaceId, selectionInvalid: false, workspaces: [
          { id: "workspace-a", name: "Workspace Alpha", plan: "PRO" },
          { id: "workspace-b", name: "Workspace Beta", plan: "FREE" },
        ] } });
      } else {
        await route.fulfill({ status: 503, json: { error: "Offline audit fixture" } });
      }
    });
    await otherTab.setViewportSize({ width: 1440, height: 900 });
    await otherTab.goto("/dashboard");
    await expect(otherTab.getByRole("button", { name: "Workspace: Workspace Beta", exact: true })).toBeVisible();
    rejectSwitch = false;
    await page.evaluate(() => localStorage.setItem("reglayer-scan-history", JSON.stringify({ state: { scanHistory: [{ scan: { id: "old-workspace-scan" } }] }, version: 0 })));
    page.once("dialog", (dialog) => dialog.accept());
    await page.getByRole("button", { name: /Workspace Alpha.*PRO/ }).click();
    await expect(page.getByRole("button", { name: "Workspace: Workspace Alpha", exact: true })).toBeVisible();
    await expect(otherTab.getByRole("button", { name: "Workspace: Workspace Alpha", exact: true })).toBeVisible();
    expect(await page.evaluate(() => localStorage.getItem("reglayer-scan-history"))).toBeNull();
    expect(switchRequests).toBe(2);
    await otherTab.close();
  });

  test("stale workspace selection remains recoverable with only one membership", async ({ page }) => {
    await page.route("**/api/workspaces", (route) => route.fulfill({ json: {
      activeWorkspaceId: null, selectionInvalid: true,
      workspaces: [{ id: "workspace-a", name: "Workspace Alpha", plan: "PRO", role: "OWNER" }],
    } }));
    await page.reload();
    await page.getByRole("button", { name: "Toggle navigation menu" }).click();
    const drawer = page.getByRole("dialog", { name: "Navigation", exact: true });
    await expect(drawer.getByRole("alert")).toContainText("Selected workspace is unavailable");
    await drawer.getByRole("button", { name: "Workspace: Choose workspace", exact: true }).click();
    await expect(drawer.getByRole("button", { name: /Workspace Alpha.*PRO/ })).toBeEnabled();
  });

  test("onboarding is an accessible optional dashboard section, not a global overlay", async ({ page }, testInfo) => {
    await page.route("**/api/onboarding/status", (route) => route.fulfill({ json: { persona: "developer", totalScans: 0 } }));
    await page.evaluate(() => localStorage.removeItem("reglayer-gdpr-consent"));
    await page.reload();
    const checklist = page.getByRole("region", { name: /getting started/i });
    await expect(page.getByRole("region", { name: "Cookie consent" })).toBeVisible();
    await expect(checklist).toBeHidden();
    await page.getByRole("button", { name: "Essential Only", exact: true }).click();
    await expect(checklist).toBeVisible();
    await expect(checklist.getByRole("button", { expanded: false })).toBeVisible();
    await checklist.getByRole("button", { expanded: false }).click();
    for (const width of [390, 768, 1440]) {
      await page.setViewportSize({ width, height: 900 });
      const results = await new AxeBuilder({ page }).include('section[aria-label]').withTags(WCAG_TAGS).analyze();
      expect(results.violations).toEqual([]);
      expect(await checklist.evaluate((element) => getComputedStyle(element).position)).toBe("static");
      expect(await checklist.evaluate((element) => Boolean(element.closest("main")))).toBe(true);
      await page.screenshot({ path: testInfo.outputPath(`onboarding-${width}.png`), animations: "disabled" });
    }
    await checklist.getByRole("button", { expanded: true }).click();
    await expect(checklist.getByRole("button", { expanded: false })).toBeVisible();
    await checklist.getByRole("button", { name: "Dismiss checklist" }).focus();
    await page.keyboard.press("Space");
    await expect(checklist).toBeHidden();
    await page.goto("/settings");
    await expect(page.getByRole("region", { name: /getting started/i })).toHaveCount(0);
  });

  test("dashboard timeout offers retry and recovers", async ({ page }) => {
    await page.clock.install();
    await page.route("**/api/dashboard/stats", () => {});
    await page.reload();
    await expect(page.getByRole("heading", { name: "Dashboard", exact: true })).toBeVisible();
    await page.clock.fastForward(15001);
    await expect(page.getByRole("button", { name: "Try again", exact: true })).toBeVisible();
    await page.route("**/api/dashboard/stats", (route) => route.fulfill({ json: {
      totalScans: 1, avgScore: 85, totalViolations: 2, sitesMonitored: 1, trend: 0, recentScans: [], topViolations: [],
    } }));
    await page.getByRole("button", { name: "Try again", exact: true }).click();
    await expect(page.getByText("Total Scans", { exact: true })).toBeVisible();
  });

  test("scan failure retains the URL and retry opens completed results", async ({ page }) => {
    await page.route("**/api/scan", (route) => route.fulfill({ status: 403, json: { error: "Forbidden: requires 'scans.run' permission" } }));
    const input = page.getByRole("textbox", { name: "Website URL to scan for accessibility compliance" });
    await input.fill("https://example.test");
    await page.getByRole("button", { name: "Scan", exact: true }).click();
    await expect(page.locator("main").getByText("Your role in this workspace does not allow new scans. Ask a workspace owner or administrator for scanning access.", { exact: true })).toBeVisible();
    await expect(input).toHaveValue("https://example.test");
    await page.route("**/api/scan", (route) => route.fulfill({ status: 503, json: { code: "TIMEOUT" } }));
    await page.getByRole("button", { name: "Scan", exact: true }).click();
    await expect(input).toHaveValue("https://example.test");
    await expect(page.getByRole("button", { name: /retry/i }).last()).toBeVisible();
    await page.route("**/api/scan", (route) => route.fulfill({ json: { scan: {
      id: "audit-scan", url: "https://example.test", timestamp: new Date().toISOString(), status: "completed",
      violations: [{ id: "image-alt", impact: "critical", description: "Provide alternative text", help: "Images must have alternate text", helpUrl: "https://example.test/help", wcagTags: ["wcag2a"], nodes: [] }],
      summary: { score: 85, critical: 1, serious: 0, moderate: 0, minor: 0, totalViolations: 1 },
      metadata: { pageTitle: "Audit scan results", scanDuration: 1200, axeCoreVersion: "4.11.3", browserEngine: "chromium" },
    }, compliance: { scanId: "audit-scan", timestamp: new Date().toISOString(), overallCompliance: 85, ruleResults: [] } } }));
    await page.getByRole("button", { name: "Scan", exact: true }).click();
    await expect(page).toHaveURL(/\/scans\/audit-scan$/);
    await expect(page.getByRole("heading", { name: "Audit scan results", exact: true })).toBeVisible();
    await expect(page.getByRole("button", { name: /export pdf/i })).toBeVisible();
    const fixes = page.getByRole("link", { name: "Fix these issues", exact: true });
    await expect(fixes).toBeVisible();
    await expect(fixes).toHaveAttribute("href", "/violations?scanId=audit-scan");
    await fixes.click();
    await expect(page).toHaveURL(/\/violations\?scanId=audit-scan$/);
  });

  test("mobile SSO navigation has an accessible name", async ({ page }) => {
    await page.goto("/settings");
    await expect(page.getByRole("link", { name: "SSO", exact: true })).toBeVisible();
  });

  test("AI failure can be retried and save failure is disclosed", async ({ page }) => {
    await page.getByRole("button", { name: "Open AI Chat" }).click();
    const chat = page.getByRole("dialog", { name: "AI Chat Assistant" });
    const composer = chat.getByRole("textbox", { name: "Chat message input" });
    await composer.fill("How do I fix an inaccessible image?");
    await composer.press("Enter");
    await expect(chat.getByText("That response failed.", { exact: true })).toBeVisible();
    await page.route("**/api/ai/chat", (route) => route.fulfill({
      contentType: "text/event-stream",
      body: 'data: {"type":"text","content":"Review the image purpose before choosing alternative text."}\n\ndata: {"type":"done"}\n\n',
    }));
    await chat.getByRole("button", { name: /retry/i }).first().click();
    await expect(chat.getByText("Review the image purpose before choosing alternative text.", { exact: true })).toBeVisible();
    await expect(chat.getByText(/That answer could not be saved/)).toBeVisible();
  });

  test("an in-flight AI response can be stopped and focus restored", async ({ page }) => {
    await page.route("**/api/ai/chat", () => {});
    await page.getByRole("button", { name: "Open AI Chat" }).click();
    const chat = page.getByRole("dialog", { name: "AI Chat Assistant" });
    const composer = chat.getByRole("textbox", { name: "Chat message input" });
    await composer.fill("Review the next image");
    await composer.press("Enter");
    await chat.getByRole("button", { name: "Stop generating response" }).click();
    await expect(chat.getByText("You stopped that response.", { exact: true })).toBeVisible();
    await chat.getByRole("button", { name: "Close chat panel" }).click();
    await expect(page.getByRole("button", { name: "Open AI Chat" })).toBeFocused();
  });

  test("workflow failure gives feedback and re-enables execution", async ({ page }) => {
    await page.goto("/workflows");
    const run = page.getByRole("button", { name: "Run", exact: true }).first();
    await run.click();
    await expect(page.getByText("Offline audit fixture", { exact: true })).toBeVisible();
    await expect(run).toBeEnabled();
  });
});

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
