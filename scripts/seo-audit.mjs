import { chromium } from "playwright";
import { cp, mkdir, mkdtemp, readdir, rm, writeFile } from "node:fs/promises";
import { constants } from "node:fs";
import { spawn } from "node:child_process";
import { createServer } from "node:net";
import { get } from "node:http";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { PUBLIC_SITE_ROUTES, PRIVATE_PAGE_ROOTS } from "../src/lib/seo.ts";

const root = fileURLToPath(new URL("../", import.meta.url));
const production = process.argv.includes("--production");
const output = path.resolve(root, process.env.SEO_AUDIT_OUTPUT || `visual-audit/seo-${production ? "production" : "development"}`);
let baseURL = process.env.SEO_AUDIT_URL || "http://localhost:3000";
let temporary;
let server;
let browser;
const results = [];
const checks = [];
const performance = [];
const environment = Object.fromEntries(["PATH", "HOME", "USER", "TMPDIR", "LANG"].flatMap(name => process.env[name] ? [[name, process.env[name]]] : []));

function run(command, args, cwd, env) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { cwd, env, stdio: "inherit" });
    child.once("error", reject);
    child.once("exit", code => code === 0 ? resolve() : reject(new Error(`Command exited ${code}: ${args[0]}`)));
  });
}

try {
  await mkdir(output, { recursive: true });
  if (production) {
    temporary = await mkdtemp(path.join(tmpdir(), "reglayer-seo-"));
    for (const entry of await readdir(root, { withFileTypes: true })) {
      if (["src", "public", "node_modules", "prisma"].includes(entry.name) || (entry.isFile() && /\.(?:ts|mjs|json)$/.test(entry.name))) {
        await cp(path.join(root, entry.name), path.join(temporary, entry.name), { recursive: true, mode: constants.COPYFILE_FICLONE });
      }
    }
    const port = await new Promise(resolve => {
      const reservation = createServer();
      reservation.listen(0, "127.0.0.1", () => {
        const address = reservation.address();
        reservation.close(() => resolve(address.port));
      });
    });
    baseURL = `http://127.0.0.1:${port}`;
    Object.assign(environment, {
      NODE_ENV: "production", VERCEL_ENV: "production", SITE_URL: "https://reglayer.vercel.app",
      NEXTAUTH_URL: baseURL, NEXTAUTH_SECRET: "seo-isolated-build-only-secret",
      DATABASE_URL: "postgresql://seo:seo@127.0.0.1:1/seo?connect_timeout=1",
      NEXT_TELEMETRY_DISABLED: "1",
    });
    console.log("Building an isolated production copy without environment files or provider credentials.");
    await run(process.execPath, ["node_modules/next/dist/bin/next", "build"], temporary, environment);
    server = spawn(process.execPath, ["node_modules/next/dist/bin/next", "start", "--hostname", "127.0.0.1", "--port", String(port)], { cwd: temporary, env: environment, stdio: ["ignore", "pipe", "pipe"] });
    await new Promise((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error("Production server startup timed out")), 30000);
      server.once("error", reject);
      server.once("exit", code => { clearTimeout(timeout); reject(new Error(`Production server exited ${code}`)); });
      server.stdout.on("data", data => { if (data.toString().includes("Ready")) { clearTimeout(timeout); resolve(); } });
      server.stderr.on("data", data => process.stderr.write(data));
    });
  }
  if (!["localhost", "127.0.0.1"].includes(new URL(baseURL).hostname)) throw new Error("SEO audit must target a local server");
  browser = await chromium.launch();
  const context = await browser.newContext({ javaScriptEnabled: false, userAgent: "Googlebot", viewport: { width: 1440, height: 900 } });
  await context.route("**/*", route => ["GET", "HEAD"].includes(route.request().method()) ? route.continue() : route.abort());
  const page = await context.newPage();
  const routes = [...PUBLIC_SITE_ROUTES];
  const robotResponse = await page.request.get(`${baseURL}/robots.txt`);
  const robots = await robotResponse.text();
  checks.push({ name: "robots", pass: robotResponse.status() === 200 && (production ? robots.includes("Allow: /") && robots.includes("Sitemap: https://reglayer.vercel.app/sitemap.xml") : robots.includes("Disallow: /")), body: robots });
  const sitemapResponse = await page.goto(`${baseURL}/sitemap.xml`);
  const sitemap = await page.evaluate(() => ({ errors: document.querySelectorAll("parsererror").length, urls: [...document.querySelectorAll("url > loc")].map(element => element.textContent) }));
  checks.push({ name: "sitemap", pass: sitemapResponse.status() === 200 && sitemap.errors === 0 && (production ? sitemap.urls.length >= PUBLIC_SITE_ROUTES.length : sitemap.urls.length === 0), count: sitemap.urls.length });
  if (production) {
    for (const url of sitemap.urls) {
      const parsed = new URL(url);
      checks.push({ name: `sitemap URL ${parsed.pathname}`, pass: parsed.origin === "https://reglayer.vercel.app" && !parsed.search && !parsed.hash && (parsed.pathname === "/" || !parsed.pathname.endsWith("/")) });
      if (!routes.includes(parsed.pathname)) routes.push(parsed.pathname);
    }
  }
  for (const route of routes) {
    const response = await page.goto(`${baseURL}${route}`, { timeout: 60000, waitUntil: "load" });
    const observation = await page.evaluate(() => {
      const content = selector => document.querySelector(selector)?.getAttribute("content");
      const headings = [...document.querySelectorAll("main h1,main h2,main h3,main h4,main h5,main h6")].map(element => ({ level: Number(element.tagName[1]), text: element.textContent }));
      return {
        title: document.title, description: content('meta[name="description"]'),
        canonical: document.querySelector('link[rel="canonical"]')?.getAttribute("href"),
        canonicalCount: document.querySelectorAll('link[rel="canonical"]').length,
        robots: [...document.querySelectorAll('meta[name="robots"]')].map(element => element.getAttribute("content")),
        ogTitle: content('meta[property="og:title"]'), ogDescription: content('meta[property="og:description"]'), ogUrl: content('meta[property="og:url"]'),
        ogImage: content('meta[property="og:image"]'), ogWidth: content('meta[property="og:image:width"]'), ogHeight: content('meta[property="og:image:height"]'),
        twitterCard: content('meta[name="twitter:card"]'), twitterImage: content('meta[name="twitter:image"]'),
        lang: document.documentElement.lang, viewport: content('meta[name="viewport"]'),
        mainCount: document.querySelectorAll("main").length, h1Count: document.querySelectorAll("h1").length,
        headings, headingSkips: headings.filter((heading, index) => index > 0 && heading.level > headings[index - 1].level + 1),
        imagesMissingAlt: [...document.images].filter(image => !image.hasAttribute("alt")).map(image => image.src),
        imagesWithoutSize: [...document.images].filter(image => !image.hasAttribute("width") || !image.hasAttribute("height")).map(image => image.src),
        emptyLinks: [...document.querySelectorAll("a[href]")].filter(link => !link.textContent.trim() && !link.getAttribute("aria-label") && !link.querySelector("img[alt]")).map(link => link.getAttribute("href")),
        links: [...document.querySelectorAll('a[href^="/"]')].map(link => link.getAttribute("href")),
        schema: [...document.querySelectorAll('script[type="application/ld+json"]')].map(element => JSON.parse(element.textContent)),
        textLength: document.querySelector("main")?.textContent.length || 0,
      };
    });
    const expected = new URL(route, "https://reglayer.vercel.app").href.replace(/\/$/, "");
    const pass = response.status() === 200 && observation.title && observation.description && observation.canonical?.replace(/\/$/, "") === expected
      && observation.canonicalCount === 1 && observation.ogUrl?.replace(/\/$/, "") === expected
      && observation.ogTitle && observation.ogDescription && observation.ogImage && observation.twitterImage
      && observation.ogWidth === "1200" && observation.ogHeight === "630" && observation.twitterCard === "summary_large_image"
      && observation.lang === "en" && observation.viewport && observation.mainCount === 1 && observation.h1Count === 1
      && observation.textLength > 100 && !observation.headingSkips.length && !observation.imagesMissingAlt.length && !observation.emptyLinks.length
      && observation.robots.some(value => production ? /^index,/.test(value) : value.includes("noindex"));
    results.push({ route, status: response.status(), pass: !!pass, ...observation });
    if (route === "/blog" && !production) for (const link of observation.links) if (/^\/blog\/[^/?#]+$/.test(link) && link !== "/blog/create" && !routes.includes(link)) routes.push(link);
    console.log(JSON.stringify({ route, pass: !!pass, headings: observation.headingSkips.length, missingAlt: observation.imagesMissingAlt.length }));
  }
  for (const [route, expected] of [["/seo-missing-route", 404], ["/blog/seo-missing-article", 404], ["/pricing/", 308], ["/blog/create", 307], ...PRIVATE_PAGE_ROOTS.map(route => [`/${route}`, 307])]) {
    const response = await page.request.get(`${baseURL}${route}`, { maxRedirects: 0, timeout: 20000 });
    checks.push({ name: `HTTP ${route}`, pass: response.status() === expected, actual: response.status(), expected, robots: response.headers()["x-robots-tag"] });
  }
  for (const asset of ["/assests/reglayer-og.png", "/assests/favicon-192.png", "/assests/favicon-512.png", "/assests/apple-touch-icon-180.png", "/favicon.ico", "/manifest.webmanifest"]) {
    const response = await page.request.get(`${baseURL}${asset}`, { maxRedirects: 0 });
    checks.push({ name: asset, pass: response.status() === 200, status: response.status(), type: response.headers()["content-type"] });
  }
  const uniqueTitles = new Set(results.map(result => result.title));
  checks.push({ name: "unique public titles", pass: uniqueTitles.size === results.length });
  const discovered = new Set(results.flatMap(result => result.links));
  checks.push({ name: "public routes have internal links", pass: PUBLIC_SITE_ROUTES.every(route => route === "/" || discovered.has(route)), missing: PUBLIC_SITE_ROUTES.filter(route => route !== "/" && !discovered.has(route)) });
  if (production) {
    for (const [route, host, shouldIndex] of [["/pricing", "reglayer.vercel.app", true], ["/auth/login", "reglayer.vercel.app", false], ["/pricing", "preview.example.test", false]]) {
      const robots = await new Promise((resolve, reject) => {
        const request = get(`${baseURL}${route}`, { headers: { host } }, response => {
          response.resume();
          response.once("end", () => resolve(response.headers["x-robots-tag"]));
        });
        request.once("error", reject);
        request.setTimeout(20000, () => request.destroy(new Error("Host-header check timed out")));
      });
      checks.push({ name: `indexing header ${host}${route}`, pass: shouldIndex ? !robots?.includes("noindex") : !!robots?.includes("noindex"), robots });
    }
  }
  const visual = await browser.newContext({ reducedMotion: "reduce" });
  await visual.route("**/api/**", route => route.fulfill({ status: 503, json: { error: "Read-only SEO audit" } }));
  await visual.addInitScript(() => {
    localStorage.setItem("reglayer-gdpr-consent", JSON.stringify({ essential: true, analytics: false, marketing: false, timestamp: "2026-09-21T00:00:00Z" }));
    window.__seoMetrics = { lcp: 0, cls: 0 };
    new PerformanceObserver(list => { for (const entry of list.getEntries()) window.__seoMetrics.lcp = entry.startTime; }).observe({ type: "largest-contentful-paint", buffered: true });
    new PerformanceObserver(list => { for (const entry of list.getEntries()) if (!entry.hadRecentInput) window.__seoMetrics.cls += entry.value; }).observe({ type: "layout-shift", buffered: true });
  });
  const visualPage = await visual.newPage();
  for (const width of [390, 1440]) {
    await visualPage.setViewportSize({ width, height: 900 });
    for (const route of ["/", "/pricing", "/blog", "/docs/scanning"]) {
      await visualPage.goto(`${baseURL}${route}`, { timeout: 60000 });
      await visualPage.evaluate(() => document.fonts.ready);
      await visualPage.screenshot({ path: path.join(output, `${width}-${route.replaceAll("/", "_") || "home"}.png`), fullPage: true, animations: "disabled" });
      performance.push({ route, width, ...await visualPage.evaluate(() => ({ ...window.__seoMetrics, navigationMs: window.performance.getEntriesByType("navigation")[0]?.duration, scripts: document.scripts.length, overflow: document.documentElement.scrollWidth > innerWidth })) });
    }
  }
  await visualPage.setViewportSize({ width: 1200, height: 630 });
  await visualPage.goto(`${baseURL}/assests/reglayer-og.png`);
  await visualPage.locator("img").screenshot({ path: path.join(output, "social-preview.png") });
  const failures = results.filter(result => !result.pass).length + checks.filter(check => !check.pass).length;
  await writeFile(path.join(output, "report.json"), JSON.stringify({ mode: production ? "Isolated production build; no external database or credentials" : "Local development; public read-only requests", results, checks, performance, failures }, null, 2));
  console.log(`SEO audit: ${results.length} public pages, ${checks.length} checks, ${failures} failures. Evidence: ${output}`);
  if (failures) process.exitCode = 1;
} finally {
  await browser?.close();
  if (server && server.exitCode === null) {
    await new Promise(resolve => { server.once("exit", resolve); server.kill("SIGTERM"); });
  }
  if (temporary) await rm(temporary, { recursive: true, force: true });
}