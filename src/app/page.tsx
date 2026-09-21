/**
 * ---------------------------------------------------------
 * RegLayer — Landing Page (Server Component)
 * ---------------------------------------------------------
 *
 * WHY: The public homepage and primary marketing surface.
 * Kept as a server component for SEO (metadata export, JSON-LD).
 *
 * HOW:
 * - Server-rendered shell with metadata + structured data
 * - All translatable UI lives in <LandingContent /> (client component)
 * - This separation gives us both SEO and i18n
 * ---------------------------------------------------------
 */

import type { Metadata } from "next";
import { LandingContent } from "@/components/landing/landing-content";
import { getSiteUrl, publicMetadata } from "@/lib/seo";

export const metadata: Metadata = {
  ...publicMetadata("/", "RegLayer - Web Accessibility Testing", "Find accessibility issues with automated WCAG scans, review affected elements, track fixes, and prepare reports for your web team."),
  title: { absolute: "RegLayer | Web Accessibility Testing" },
};

export default function Home() {
  const jsonLd = {
    "@context": "https://schema.org",
    "@graph": [
      { "@type": "Organization", "@id": `${getSiteUrl()}/#organization`, name: "RegLayer", url: getSiteUrl(), logo: `${getSiteUrl()}/assests/favicon-512.png` },
      { "@type": "WebSite", "@id": `${getSiteUrl()}/#website`, name: "RegLayer", url: getSiteUrl(), publisher: { "@id": `${getSiteUrl()}/#organization` }, inLanguage: "en" },
      { "@type": "SoftwareApplication", "@id": `${getSiteUrl()}/#application`, name: "RegLayer", url: getSiteUrl(), applicationCategory: "DeveloperApplication", operatingSystem: "Web browser", description: "Automated web accessibility scanning, issue tracking, and reporting.", publisher: { "@id": `${getSiteUrl()}/#organization` } },
    ],
  };

  return (
    <div className="min-h-screen bg-white dark:bg-neutral-950">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd).replace(/</g, "\\u003c") }}
      />
      <LandingContent />
    </div>
  );
}

