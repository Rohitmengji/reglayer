/**
 * RegLayer — Sitemap
 *
 * WHY: SEO — helps search engines discover all public pages.
 * WHAT: Lists all public routes with lastModified dates and change frequency.
 * HOW: Next.js Metadata API generates /sitemap.xml from this export.
 */
import type { MetadataRoute } from "next";

/**
 * Sitemap — public pages only.
 * Authenticated pages are excluded (handled by robots.txt disallow).
 */
export default function sitemap(): MetadataRoute.Sitemap {
  const baseUrl = process.env.NEXTAUTH_URL || "https://reglayer.vercel.app";

  return [
    {
      url: baseUrl,
      lastModified: new Date(),
      changeFrequency: "weekly",
      priority: 1,
    },
    {
      url: `${baseUrl}/pricing`,
      lastModified: new Date(),
      changeFrequency: "monthly",
      priority: 0.8,
    },
    {
      url: `${baseUrl}/privacy`,
      lastModified: new Date(),
      changeFrequency: "yearly",
      priority: 0.3,
    },
    {
      url: `${baseUrl}/auth/login`,
      lastModified: new Date(),
      changeFrequency: "yearly",
      priority: 0.5,
    },
  ];
}
