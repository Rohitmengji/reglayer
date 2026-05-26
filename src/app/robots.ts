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
        allow: ["/", "/pricing", "/privacy"],
        disallow: ["/dashboard", "/scans", "/settings", "/admin", "/api/", "/team", "/insights", "/priorities"],
      },
    ],
    sitemap: `${baseUrl}/sitemap.xml`,
  };
}
