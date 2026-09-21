/**
 * RegLayer — Sitemap
 *
 * WHY: SEO — helps search engines discover all public pages.
 * WHAT: Lists all public routes with lastModified dates and change frequency.
 * HOW: Next.js Metadata API generates /sitemap.xml from this export.
 */
import type { MetadataRoute } from "next";
import { getSiteUrl, isProductionIndexingEnabled, PUBLIC_SITE_ROUTES } from "@/lib/seo";
import { getPublicArticleSummaries } from "@/lib/blog/public-articles";

export const dynamic = "force-dynamic";

/**
 * Sitemap — public pages only.
 * Authenticated pages are excluded (handled by robots.txt disallow).
 */
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  if (!isProductionIndexingEnabled()) return [];
  const articles = await getPublicArticleSummaries();
  return [
    ...PUBLIC_SITE_ROUTES.map(route => ({ url: new URL(route, getSiteUrl()).href })),
    ...articles.map(article => ({ url: `${getSiteUrl()}/blog/${encodeURIComponent(article.slug)}`, ...(article.lastModified ? { lastModified: article.lastModified } : {}) })),
  ];
}
