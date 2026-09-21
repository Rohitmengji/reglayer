import type { Metadata } from "next";

export const PUBLIC_SITE_ROUTES = [
  "/", "/pricing", "/features", "/standards", "/docs", "/docs/getting-started",
  "/docs/scanning", "/docs/reports", "/docs/monitoring", "/docs/team-management",
  "/docs/integrations", "/api-reference", "/blog", "/contact", "/privacy", "/terms",
  "/cookie-policy", "/tools", "/tools/contrast", "/tools/color-vision", "/tools/readability",
] as const;

const DEFAULT_SITE_URL = "https://reglayer.vercel.app";

export const PRIVATE_PAGE_ROOTS = [
  "admin", "agency", "agents", "analysis", "analytics", "audit-log", "automation", "certificate",
  "chaos", "competitive", "compliance", "crawl", "dashboard", "demand-letter", "executive", "fix",
  "guard", "insights", "integrations", "knowledge", "leaderboard", "learn", "manage", "manual-testing",
  "marketplace", "monitoring", "notifications", "priorities", "radar", "regulations", "reports", "risk",
  "scans", "score", "screen-reader", "settings", "sites", "skills", "statement", "team", "test", "trends",
  "vault", "violations", "warranty", "webhooks", "workflows",
] as const;

export function getSiteUrl(): string {
  const configured = process.env.SITE_URL || process.env.NEXT_PUBLIC_APP_URL || DEFAULT_SITE_URL;
  try {
    const url = new URL(configured);
    if (url.protocol !== "https:" || url.username || url.password || /^(localhost|127\.|\[::1\])/.test(url.hostname)) {
      return DEFAULT_SITE_URL;
    }
    return url.origin;
  } catch {
    return DEFAULT_SITE_URL;
  }
}

export function isProductionIndexingEnabled(): boolean {
  if (process.env.NODE_ENV !== "production" || process.env.SEO_INDEXING_ENABLED === "false") return false;
  if (process.env.VERCEL_ENV) return process.env.VERCEL_ENV === "production";
  return process.env.SEO_INDEXING_ENABLED === "true";
}

export function isIndexablePath(pathname: string): boolean {
  return PUBLIC_SITE_ROUTES.some(route => route === pathname)
    || (/^\/blog\/[^/]+$/.test(pathname) && pathname !== "/blog/create");
}

export const PRIVATE_ROBOTS: Metadata["robots"] = {
  index: false,
  follow: false,
  googleBot: { index: false, follow: false },
};

export function privateMetadata(title: string, description: string): Metadata {
  return { title: { absolute: `${title} | RegLayer` }, description, robots: PRIVATE_ROBOTS, alternates: { canonical: null } };
}

export function publicMetadata(pathname: string, title: string, description: string): Metadata {
  const url = new URL(pathname, getSiteUrl()).href;
  const image = { url: `${getSiteUrl()}/assests/reglayer-og.png`, width: 1200, height: 630, alt: "RegLayer - Web Accessibility Compliance Platform" };
  return {
    title: { absolute: `${title} | RegLayer` },
    description,
    alternates: { canonical: url },
    robots: isProductionIndexingEnabled() ? { index: true, follow: true, googleBot: { index: true, follow: true, "max-image-preview": "large" } } : PRIVATE_ROBOTS,
    openGraph: { title, description, url, siteName: "RegLayer", locale: "en_US", type: "website", images: [image] },
    twitter: { card: "summary_large_image", title, description, images: [image] },
  };
}

export function breadcrumbSchema(items: Array<{ name: string; path: string }>) {
  return {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: items.map((item, index) => ({ "@type": "ListItem", position: index + 1, name: item.name, item: new URL(item.path, getSiteUrl()).href })),
  };
}