/**
 * RegLayer — Robots.txt
 *
 * WHY: Controls search engine crawler behavior.
 * WHAT: Allows all crawlers to index public pages, blocks /api/ and /dashboard/.
 * HOW: Next.js Metadata API generates /robots.txt from this export.
 */
import type { MetadataRoute } from "next";
import { getSiteUrl, isProductionIndexingEnabled } from "@/lib/seo";

/**
 * robots.txt — controls search engine crawling.
 * Blocks authenticated app pages, allows public marketing pages.
 */
export default function robots(): MetadataRoute.Robots {
  if (!isProductionIndexingEnabled()) return { rules: { userAgent: "*", disallow: "/" } };
  return {
    rules: { userAgent: "*", allow: "/", disallow: "/api/" },
    sitemap: `${getSiteUrl()}/sitemap.xml`,
  };
}
