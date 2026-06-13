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

export const metadata: Metadata = {
  title: "RegLayer — Web Accessibility Compliance, Fully Automated",
  description:
    "Enterprise accessibility compliance platform. Automated WCAG 2.2 scanning, litigation risk scoring, compliance forecasting, and continuous monitoring for ADA, EAA, Section 508, and EN 301 549.",
  openGraph: {
    title: "RegLayer — Web Accessibility Compliance",
    description:
      "Automated WCAG scanning, AI fix suggestions, audit-ready reports, and continuous monitoring. One platform for worldwide accessibility standards.",
    url: "https://reglayer.vercel.app",
    siteName: "RegLayer",
    type: "website",
  },
};

export default function Home() {
  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "SoftwareApplication",
    name: "RegLayer",
    applicationCategory: "DeveloperApplication",
    operatingSystem: "Web",
    description: "Enterprise accessibility compliance platform. Automated WCAG scanning, litigation risk scoring, compliance forecasting, and continuous monitoring.",
    url: "https://reglayer.vercel.app",
    offers: {
      "@type": "AggregateOffer",
      priceCurrency: "EUR",
      lowPrice: "0",
      highPrice: "199",
      offerCount: "3",
    },
    aggregateRating: {
      "@type": "AggregateRating",
      ratingValue: "4.8",
      ratingCount: "150",
    },
    featureList: [
      "WCAG 2.1/2.2 automated scanning",
      "EN 301 549 compliance",
      "ADA Title III monitoring",
      "Litigation risk scoring",
      "Compliance forecasting",
      "Third-party vendor risk analysis",
      "Auto-remediation engine",
      "CI/CD regression guard",
      "Executive compliance dashboard",
      "Human testing marketplace",
    ],
  };

  return (
    <div className="min-h-screen bg-white dark:bg-neutral-950">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />
      <LandingContent />
    </div>
  );
}

