/**
 * RegLayer — Robots.txt
 *
 * WHY: Controls search engine crawler behavior.
 * WHAT: Allows all crawlers to index public pages, blocks /api/ and /dashboard/.
 * HOW: Next.js Metadata API generates /robots.txt from this export.
 */
import type { MetadataRoute } from "next";

/**
 * robots.txt — controls search engine crawling.
 * Blocks authenticated app pages, allows public marketing pages.
 */
export default function robots(): MetadataRoute.Robots {
  const baseUrl = process.env.NEXTAUTH_URL || "https://reglayer.vercel.app";

  return {
    rules: [
      {
        userAgent: "*",
        allow: ["/", "/pricing", "/privacy", "/cookie-policy", "/contact", "/features", "/auth/login", "/request-access", "/api-reference", "/docs"],
        disallow: ["/dashboard", "/scans", "/settings", "/admin", "/api/", "/team", "/insights", "/priorities", "/executive", "/agency", "/vault", "/guard", "/regulations", "/testing", "/violations", "/trends", "/compliance", "/analytics", "/automation", "/manage", "/crawl", "/risk", "/report/"],
      },
    ],
    sitemap: `${baseUrl}/sitemap.xml`,
  };
}
