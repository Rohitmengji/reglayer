import type { Metadata } from "next";
import Script from "next/script";

export const metadata: Metadata = {
  title: "Features — Everything You Need for Accessibility Compliance",
  description: "Automated WCAG scanning, continuous monitoring, compliance analytics, PDF reports, developer API, team collaboration, AI insights, and global standards support.",
  openGraph: {
    title: "RegLayer Features — Full Accessibility Compliance Toolkit",
    description: "From automated scanning to AI-powered remediation — everything development teams need for WCAG, ADA, EAA, and Section 508 compliance.",
    url: "/features",
  },
};

const faqJsonLd = {
  "@context": "https://schema.org",
  "@type": "FAQPage",
  mainEntity: [
    {
      "@type": "Question",
      name: "What accessibility standards does RegLayer support?",
      acceptedAnswer: {
        "@type": "Answer",
        text: "RegLayer supports WCAG 2.2 Level AA, ADA Title III, European Accessibility Act (EN 301 549), Section 508, and AODA. Violations are mapped to specific success criteria across all standards simultaneously.",
      },
    },
    {
      "@type": "Question",
      name: "Can RegLayer integrate with my CI/CD pipeline?",
      acceptedAnswer: {
        "@type": "Answer",
        text: "Yes. RegLayer provides a RESTful API and a GitHub Action that runs accessibility scans on every PR. The CI gatekeeper blocks merges if violations exceed your configured threshold.",
      },
    },
    {
      "@type": "Question",
      name: "Does RegLayer offer AI-powered fix suggestions?",
      acceptedAnswer: {
        "@type": "Answer",
        text: "Yes. RegLayer uses AI to generate specific code fix suggestions for each violation, prioritized by impact. It also provides plain-English explanations of why each violation matters for real users.",
      },
    },
  ],
};

export default function FeaturesLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <Script
        id="faq-jsonld"
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(faqJsonLd) }}
      />
      {children}
    </>
  );
}
