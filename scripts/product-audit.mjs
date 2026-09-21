import { chromium } from "playwright";
import AxeBuilder from "@axe-core/playwright";
import nextEnv from "@next/env";
import { encode } from "next-auth/jwt";
import { readdir, mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

const baseURL = process.env.AUDIT_URL || "http://localhost:3000";
const output = path.resolve(process.env.AUDIT_OUTPUT || "visual-audit/product");
const origin = new URL(baseURL).origin;
if (!["localhost", "127.0.0.1"].includes(new URL(baseURL).hostname)) {
  throw new Error("The product audit must target a local server.");
}

const files = await readdir("src/app", { recursive: true });
const routes = files.filter((file) => path.basename(file) === "page.tsx")
  .map((file) => `/${file.replace(/\/?page\.tsx$/, "").replace(/\[[^\]]+\]/g, "audit-fixture")}`);
routes.push("/docs");
const selectedRoutes = process.env.AUDIT_ROUTES?.split(",") || [...new Set(routes)].sort();
const discoveredRoutes = new Set(selectedRoutes);
const viewports = [
  { name: "desktop", width: 1440, height: 900 },
  { name: "tablet", width: 768, height: 1024 },
  { name: "mobile", width: 390, height: 844 },
];
const coreRoutes = new Set([
  "/dashboard", "/test", "/scans", "/violations", "/compliance", "/reports",
  "/settings", "/auth/login", "/auth/register", "/agents", "/workflows", "/knowledge",
]);
const fixtures = {
  "/api/workspaces": { activeWorkspaceId: "audit-workspace", selectionInvalid: false, workspaces: [{ id: "audit-workspace", name: "Audit workspace", slug: "audit", plan: "ENTERPRISE", role: "OWNER", memberCount: 1 }] },
  "/api/team": { workspace: { id: "audit-workspace", name: "Audit workspace", plan: "ENTERPRISE" }, members: [] },
  "/api/onboarding/status": { persona: "developer", totalScans: 0 },
  "/api/ai/suggestions": { suggestions: [] },
  "/api/ai/conversations": { conversations: [] },
  "/api/notifications": { notifications: [], unreadCount: 0 },
  "/api/scans": { scans: [], total: 0, totalPages: 0 },
  "/api/dashboard/stats": { totalScans: 0, avgScore: 0, totalViolations: 0, sitesMonitored: 0, trend: 0, recentScans: [], topViolations: [] },
};

nextEnv.loadEnvConfig(process.cwd());
const secret = process.env.NEXTAUTH_SECRET;
if (!secret) throw new Error("Local NEXTAUTH_SECRET is required for the isolated browser fixture");
const token = await encode({ secret, token: { sub: "audit-user", email: "audit@example.test" }, maxAge: 3600 });
await mkdir(output, { recursive: true });
const browser = await chromium.launch();
const context = await browser.newContext({ serviceWorkers: "block", reducedMotion: "reduce" });
let currentRoute = "";
const requests = [];
await context.route("**/*", async (route) => {
  const request = route.request();
  const url = new URL(request.url());
  if (url.origin !== origin) {
    await route.abort();
    return;
  }
  if (url.pathname.startsWith("/api/")) {
    requests.push({ route: currentRoute, method: request.method(), endpoint: url.pathname });
    if (request.method() !== "GET") {
      await route.fulfill({ status: 503, json: { error: "Audit: writes are blocked" } });
      return;
    }
    if (url.pathname === "/api/auth/session") {
      await route.fulfill({ json: currentRoute.startsWith("/auth/") ? {} : {
        user: { id: "audit-user", name: "Audit User", email: "audit@example.test", isMasterAdmin: true },
        expires: "2099-01-01T00:00:00.000Z",
      } });
      return;
    }
    const fixture = fixtures[url.pathname];
    await route.fulfill(fixture
      ? { json: fixture }
      : { status: 503, json: { error: "Audit: simulated service unavailable" } });
    return;
  }
  if (!["GET", "HEAD"].includes(request.method())) {
    await route.abort();
    return;
  }
  await route.continue();
});
await context.addInitScript(() => {
  localStorage.setItem("reglayer_onboarding_dismissed", "1");
  localStorage.setItem("reglayer_persona_skipped", "1");
});
const page = await context.newPage();
let errors = [];
page.on("pageerror", (error) => errors.push(error.message));
const results = [];
try {
  for (const viewport of viewports) {
    await page.setViewportSize({ width: viewport.width, height: viewport.height });
    for (const route of selectedRoutes) {
      currentRoute = route;
      await context.addCookies([{ name: "next-auth.session-token", value: route.startsWith("/auth/") ? "" : token, url: baseURL, httpOnly: true, sameSite: "Lax" }]);
      errors = [];
      const started = Date.now();
      try {
        const response = await page.goto(`${baseURL}${route}`, { timeout: 30000 });
        await page.waitForLoadState("networkidle", { timeout: 8000 }).catch(() => {});
        const consent = page.getByRole("button", { name: "Essential Only", exact: true });
        if (await consent.isVisible()) await consent.click();
        const layout = await page.evaluate(() => {
          const root = document.querySelector("main") || document.body;
          const describe = (element) => ({
            tag: element.tagName.toLowerCase(),
            text: element.textContent.trim().slice(0, 160),
            className: element.getAttribute("class"),
          });
          const visible = (element) => {
            const bounds = element.getBoundingClientRect();
            const style = getComputedStyle(element);
            return bounds.width > 0 && bounds.height > 0 && style.visibility === "visible" && !element.closest('[inert], .sr-only') && (element.tagName.toLowerCase() === "svg" || !element.closest('[aria-hidden="true"]'));
          };
          const misaligned = [...root.querySelectorAll("p, svg")].filter(visible).flatMap((element) => {
            const style = getComputedStyle(element);
            const parent = element.parentElement;
            const parentStyle = getComputedStyle(parent);
            if (style.textAlign !== "center" || !["block", "flex"].includes(parentStyle.display)) return [];
            if (parentStyle.display === "flex" && parentStyle.flexDirection !== "column") return [];
            if (style.position === "absolute" || style.position === "fixed" || style.display === "inline" || style.display === "inline-block") return [];
            const bounds = element.getBoundingClientRect();
            const parentBounds = parent.getBoundingClientRect();
            const left = parentBounds.left + parseFloat(parentStyle.paddingLeft) + parseFloat(parentStyle.borderLeftWidth);
            const right = parentBounds.right - parseFloat(parentStyle.paddingRight) - parseFloat(parentStyle.borderRightWidth);
            const offset = bounds.left + bounds.width / 2 - (left + right) / 2;
            return Math.abs(offset) > 3 ? [{ ...describe(element), offset: Math.round(offset) }] : [];
          });
          const clippedText = [...root.querySelectorAll("p,h1,h2,h3,h4,button,label,a")].filter(visible).filter((element) => {
            const style = getComputedStyle(element);
            return element.clientWidth > 0 && element.scrollWidth > element.clientWidth + 2
              && !["auto", "scroll"].includes(style.overflowX)
              && style.textOverflow !== "ellipsis" && style.webkitLineClamp === "none"
              && !element.querySelector("pre,table");
          }).map(describe);
          return { misalignedText: misaligned.filter(element => element.tag === "p"), misalignedIcons: misaligned.filter(element => element.tag === "svg"), clippedText };
        });
        const observation = await page.evaluate(() => ({
          title: document.title,
          path: location.pathname,
          headings: [...document.querySelectorAll("h1,h2")].filter((element) => element.getClientRects().length).map((element) => element.textContent),
          text: (document.querySelector("main") || document.body).innerText.slice(0, 2000),
          overflow: document.documentElement.scrollWidth > innerWidth + 1,
          links: [...document.querySelectorAll("main a[href]")].map((element) => ({ text: element.textContent, href: element.getAttribute("href") })),
          tabs: [...document.querySelectorAll('[role="tab"]')].map((element) => element.textContent),
          sections: [...document.querySelectorAll('nav[aria-label="Section tabs"] a[href], nav[aria-label="Settings sections"] a[href]')].map((element) => element.getAttribute("href")),
        }));
        for (const section of observation.sections) {
          if (section?.startsWith("/") && !section.startsWith("//") && !discoveredRoutes.has(section)) {
            discoveredRoutes.add(section);
            selectedRoutes.push(section);
          }
        }
        const filename = `${viewport.name}-${route.replace(/[^a-z0-9]+/gi, "_") || "home"}.png`;
        await page.screenshot({ path: path.join(output, filename), fullPage: true, animations: "disabled", timeout: 10000 });
        let accessibility = [];
        const accessibilityChecked = coreRoutes.has(route.split("?")[0]);
        if (accessibilityChecked) {
          const audit = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"]).analyze();
          accessibility = audit.violations.map((violation) => ({
            id: violation.id, impact: violation.impact, count: violation.nodes.length,
            nodes: violation.nodes.slice(0, 3).map((node) => ({ target: node.target, summary: node.failureSummary })),
          }));
        }
        results.push({ route, viewport: viewport.name, status: response?.status(), elapsedMs: Date.now() - started, ...observation, ...layout, errors, accessibilityChecked, accessibility, screenshot: filename });
        console.log(JSON.stringify({ route, viewport: viewport.name, status: response?.status(), overflow: observation.overflow, misalignedText: layout.misalignedText.length, misalignedIcons: layout.misalignedIcons.length, clippedText: layout.clippedText.length, errors: errors.length, axeRules: accessibility.map((violation) => violation.id) }));
      } catch (error) {
        results.push({ route, viewport: viewport.name, error: error.message, errors });
        console.log(JSON.stringify({ route, viewport: viewport.name, error: error.message }));
      }
      await writeFile(path.join(output, "report.json"), JSON.stringify({ mode: "Isolated browser: synthetic session, empty core data, other APIs return 503. No real authentication, provider calls or server mutations tested.", results, requests }, null, 2));
    }
  }
} finally {
  await browser.close();
}
console.log(`Evidence: ${output}/report.json`);