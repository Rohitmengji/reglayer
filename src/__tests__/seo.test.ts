import { afterEach, describe, expect, it, vi } from "vitest";
import { getSiteUrl, isIndexablePath, isProductionIndexingEnabled, publicMetadata, PUBLIC_SITE_ROUTES, PRIVATE_PAGE_ROOTS } from "@/lib/seo";
import { NextRequest } from "next/server";
import { readdirSync } from "node:fs";
import { proxy } from "@/proxy";
import robots from "@/app/robots";
import sitemap from "@/app/sitemap";
import { getPublicArticle, getPublicArticleSummaries } from "@/lib/blog/public-articles";

const database = vi.hoisted(() => ({ findMany: vi.fn(), findUnique: vi.fn() }));
const auth = vi.hoisted(() => ({ getToken: vi.fn().mockResolvedValue(null) }));
vi.mock("@/lib/database/prisma", () => ({ prisma: { article: database } }));
vi.mock("next-auth/jwt", () => auth);
vi.mock("@/lib/security/csrf", () => ({ validateCsrf: () => null }));
vi.mock("@/lib/rate-limit", () => ({ rateLimitSync: () => ({ success: true }), rateLimitHeaders: () => ({}) }));

afterEach(() => vi.unstubAllEnvs());

describe("SEO route and deployment policy", () => {
  it("classifies every actual application route root", () => {
    const roots = new Set(readdirSync("src/app", { recursive: true }).map(String).filter(file => file.endsWith("/page.tsx")).map(file => file.split("/")[0]));
    const known = new Set([...PRIVATE_PAGE_ROOTS, ...PUBLIC_SITE_ROUTES.map(route => route.split("/")[1]), "auth", "report", "verify", "request-access", "not-found-page"]);
    expect([...roots].filter(root => !known.has(root))).toEqual([]);
  });

  it("allows crawlers on canonical production pages and blocks indexing on previews and private responses", async () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("VERCEL_ENV", "production");
    vi.stubEnv("SEO_INDEXING_ENABLED", "");
    vi.stubEnv("SITE_URL", "https://reglayer.vercel.app");
    const request = (route: string, host = "reglayer.vercel.app") => new NextRequest(`https://${host}${route}`, { headers: { host } });
    expect((await proxy(request("/pricing"))).headers.get("x-robots-tag")).toBeNull();
    for (const route of ["/auth/login", "/dashboard", "/blog/create", "/api/scans", "/report/public/scan", "/verify/proof"]) {
      expect((await proxy(request(route))).headers.get("x-robots-tag")).toContain("noindex");
    }
    expect((await proxy(request("/pricing", "preview.example.test"))).headers.get("x-robots-tag")).toContain("noindex");
    vi.stubEnv("VERCEL_ENV", "preview");
    expect((await proxy(request("/pricing"))).headers.get("x-robots-tag")).toContain("noindex");
    expect(robots()).toEqual({ rules: { userAgent: "*", disallow: "/" } });
  });

  it("redirects only known public production aliases, preserving paths and query strings", async () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("VERCEL_ENV", "production");
    vi.stubEnv("SEO_INDEXING_ENABLED", "");
    vi.stubEnv("SITE_URL", "https://reglayer.vercel.app");
    const response = await proxy(new NextRequest("https://www.reglayer.app/pricing?plan=pro", { headers: { host: "www.reglayer.app" } }));
    expect(response.status).toBe(308);
    expect(response.headers.get("location")).toBe("https://reglayer.vercel.app/pricing?plan=pro");
    const callback = await proxy(new NextRequest("https://www.reglayer.app/api/auth/callback/google", { method: "POST", headers: { host: "www.reglayer.app" } }));
    expect(callback.headers.get("location")).toBeNull();
  });

  it("keeps crawler files accessible and missing paths out of login redirects", async () => {
    for (const route of ["/robots.txt", "/sitemap.xml", "/manifest.webmanifest"]) {
      const response = await proxy(new NextRequest(`http://localhost:3000${route}`, { headers: { host: "localhost:3000" } }));
      expect(response.status).toBe(200);
      expect(response.headers.get("location")).toBeNull();
    }
    const missing = await proxy(new NextRequest("http://localhost:3000/no-such-page", { headers: { host: "localhost:3000" } }));
    expect(missing.status).toBe(404);
    expect(missing.headers.get("location")).toBeNull();
    expect(missing.headers.get("x-middleware-rewrite")).toContain("/not-found-page");
  });
  it("blocks nonproduction crawlers and omits the sitemap entries", async () => {
    vi.stubEnv("NODE_ENV", "development");
    expect(robots()).toEqual({ rules: { userAgent: "*", disallow: "/" } });
    expect(await sitemap()).toEqual([]);
  });

  it("publishes only canonical public URLs without invented modification dates", async () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("VERCEL_ENV", "production");
    vi.stubEnv("SEO_INDEXING_ENABLED", "");
    vi.stubEnv("SITE_URL", "https://example.test/");
    expect(robots()).toMatchObject({ rules: { allow: "/", disallow: "/api/" }, sitemap: "https://example.test/sitemap.xml" });
    database.findMany.mockResolvedValue([]);
    const entries = await sitemap();
    expect(entries).toEqual(expect.arrayContaining(PUBLIC_SITE_ROUTES.map(route => ({ url: new URL(route, "https://example.test").href }))));
    expect(entries.some(entry => entry.url.endsWith("/blog/wcag-2-2-whats-new"))).toBe(true);
    expect(entries.every(entry => !entry.lastModified)).toBe(true);
  });

  it("includes published CMS articles and excludes unpublished static overrides", async () => {
    database.findMany.mockResolvedValueOnce([{ slug: "new-guide", title: "New guide", excerpt: "Practical accessibility", category: "WCAG", readTime: "5 min", publishedAt: new Date("2026-09-01"), updatedAt: new Date("2026-09-21") }]).mockResolvedValueOnce([{ slug: "wcag-2-2-whats-new" }]);
    const summaries = await getPublicArticleSummaries();
    expect(summaries.find(article => article.slug === "new-guide")).toMatchObject({ lastModified: "2026-09-21T00:00:00.000Z" });
    expect(summaries.some(article => article.slug === "wcag-2-2-whats-new")).toBe(false);
    database.findUnique.mockResolvedValue({ status: "DRAFT" });
    expect(await getPublicArticle("wcag-2-2-whats-new")).toBeNull();
  });

  it("falls back to static content during database unavailability", async () => {
    database.findMany.mockRejectedValue(new Error("Unavailable"));
    database.findUnique.mockRejectedValue(new Error("Unavailable"));
    expect((await getPublicArticleSummaries()).length).toBeGreaterThan(0);
    expect(await getPublicArticle("wcag-2-2-whats-new")).not.toBeNull();
    expect(await getPublicArticle("missing-slug")).toBeNull();
  });
  it("only indexes public content routes", () => {
    for (const route of PUBLIC_SITE_ROUTES) expect(isIndexablePath(route)).toBe(true);
    expect(isIndexablePath("/blog/wcag-guide")).toBe(true);
    for (const route of ["/blog/create", "/auth/login", "/dashboard", "/report/public/scan", "/verify/proof", "/request-access", "/unknown"]) {
      expect(isIndexablePath(route)).toBe(false);
    }
  });

  it("uses a normalized site origin independently of the authentication callback", () => {
    vi.stubEnv("SITE_URL", "https://example.test/nested/?query=true");
    vi.stubEnv("NEXTAUTH_URL", "http://localhost:3000");
    expect(getSiteUrl()).toBe("https://example.test");
    const credentialUrl = new URL("https://example.test");
    credentialUrl.username = "user";
    credentialUrl.password = "password";
    vi.stubEnv("SITE_URL", credentialUrl.href);
    expect(getSiteUrl()).toBe("https://reglayer.vercel.app");
    vi.stubEnv("SITE_URL", "http://localhost:3000");
    expect(getSiteUrl()).toBe("https://reglayer.vercel.app");
  });

  it.each(["development", "preview"])("never enables indexing for Vercel %s", deployment => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("VERCEL_ENV", deployment);
    vi.stubEnv("SEO_INDEXING_ENABLED", "true");
    expect(isProductionIndexingEnabled()).toBe(false);
  });

  it("requires production and explicit self-hosted opt-in, and supports an emergency opt-out", () => {
    vi.stubEnv("VERCEL_ENV", "");
    vi.stubEnv("SEO_INDEXING_ENABLED", "");
    vi.stubEnv("NODE_ENV", "production");
    expect(isProductionIndexingEnabled()).toBe(false);
    vi.stubEnv("SEO_INDEXING_ENABLED", "true");
    expect(isProductionIndexingEnabled()).toBe(true);
    vi.stubEnv("NODE_ENV", "development");
    expect(isProductionIndexingEnabled()).toBe(false);
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("VERCEL_ENV", "production");
    vi.stubEnv("SEO_INDEXING_ENABLED", "false");
    expect(isProductionIndexingEnabled()).toBe(false);
  });

  it("generates matching page-specific canonical and social metadata", () => {
    vi.stubEnv("SITE_URL", "https://example.test");
    vi.stubEnv("NODE_ENV", "development");
    const metadata = publicMetadata("/pricing", "Pricing", "Plans for accessibility testing teams.");
    expect(metadata.alternates?.canonical).toBe("https://example.test/pricing");
    expect(metadata.openGraph).toMatchObject({ title: "Pricing", url: "https://example.test/pricing", images: [{ width: 1200, height: 630 }] });
    expect(metadata.twitter).toMatchObject({ card: "summary_large_image", title: "Pricing" });
    expect(metadata.robots).toMatchObject({ index: false });
  });
});