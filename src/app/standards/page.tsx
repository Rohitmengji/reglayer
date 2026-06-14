"use client";

/**
 * RegLayer — Standards Page
 *
 * WHY: Users need to understand which accessibility standards RegLayer supports.
 * WHAT: Explains WCAG 2.2, ADA, Section 508, EAA, EN 301 549, AODA with key requirements.
 * HOW: Client-rendered content with standard comparison cards.
 */
import { Shield, CheckCircle2 } from "lucide-react";
import Link from "next/link";
import { Footer } from "@/components/layout/footer";
import { useI18n } from "@/components/i18n-provider";

const standards = [
  {
    name: "WCAG 2.1 Level AA",
    org: "W3C Web Accessibility Initiative",
    description:
      "The international standard for web accessibility (W3C Recommendation, 06 May 2025). WCAG 2.1 defines how to make web content more accessible to people with disabilities. Level AA is the required conformance level for most regulations.",
    criteria: ["Perceivable", "Operable", "Understandable", "Robust"],
    link: "https://www.w3.org/TR/WCAG21/",
  },
  {
    name: "EN 301 549 V3.2.1",
    org: "European Telecommunications Standards Institute (ETSI)",
    description:
      "The harmonised European standard for ICT accessibility. Required for compliance with EU public procurement directives and the European Accessibility Act.",
    criteria: ["Web content (Section 9)", "Documents (Section 10)", "Software (Section 11)", "Hardware (Section 8)"],
    link: "https://www.etsi.org/deliver/etsi_en/301500_301599/301549/03.02.01_60/en_301549v030201p.pdf",
  },
  {
    name: "European Accessibility Act",
    org: "Directive (EU) 2019/882",
    description:
      "EU directive requiring private sector digital products and services to be accessible by June 28, 2025. Applies to e-commerce, banking, transport, and other essential services.",
    criteria: ["Products accessible by design", "Services accessible throughout lifecycle", "Conformity assessment", "Market surveillance"],
    link: "https://eur-lex.europa.eu/legal-content/EN/TXT/?uri=CELEX:32019L0882",
  },
  {
    name: "Section 508",
    org: "U.S. Access Board",
    description:
      "U.S. federal requirements for ICT accessibility, aligned with WCAG 2.0 Level AA. Required for all federal agency websites and technology procured by the government.",
    criteria: ["Web-based applications", "Software applications", "Electronic documents", "Telecommunications"],
    link: "https://www.section508.gov/",
  },
  {
    name: "ADA Title III",
    org: "U.S. Department of Justice",
    description:
      "The Americans with Disabilities Act requires that places of public accommodation — including websites — be accessible to people with disabilities. Courts increasingly apply WCAG 2.1 AA as the benchmark.",
    criteria: ["Public accommodations", "Effective communication", "Auxiliary aids & services", "Web accessibility"],
    link: "https://www.ada.gov/",
  },
  {
    name: "AODA",
    org: "Government of Ontario, Canada",
    description:
      "The Accessibility for Ontarians with Disabilities Act requires organizations in Ontario to meet WCAG 2.0 Level AA for web content. Applies to public and private sector organizations.",
    criteria: ["Web content", "Web applications", "Digital documents", "Multimedia"],
    link: "https://www.ontario.ca/laws/statute/05a11",
  },
];

export default function StandardsPage() {
  const { t } = useI18n();

  return (
    <div className="min-h-screen bg-white dark:bg-neutral-950">
      <div className="mx-auto max-w-4xl px-4 sm:px-6 py-12">
        <div className="flex items-center gap-2 mb-12">
          <Link href="/" className="flex items-center gap-2 text-neutral-900 dark:text-white">
            <Shield className="h-5 w-5" />
            <span className="font-bold">RegLayer</span>
          </Link>
        </div>

        <h1 className="text-3xl font-bold text-neutral-900 dark:text-white mb-2">{t("standards.title")}</h1>
        <p className="text-neutral-500 dark:text-neutral-400 mb-12">
          {t("standards.subtitle")}
        </p>

        <div className="space-y-8">
          {standards.map((standard) => (
            <div
              key={standard.name}
              className="rounded-xl border border-neutral-200 dark:border-neutral-800 p-6"
            >
              <div className="flex items-start justify-between gap-4 mb-3">
                <div>
                  <h2 className="text-xl font-semibold text-neutral-900 dark:text-white">{standard.name}</h2>
                  <p className="text-sm text-neutral-500 dark:text-neutral-400">{standard.org}</p>
                </div>
                <a
                  href={standard.link}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-xs text-blue-600 shrink-0"
                >
                  View Standard ↗
                </a>
              </div>
              <p className="text-sm text-neutral-600 dark:text-neutral-300 mb-4 leading-relaxed">
                {standard.description}
              </p>
              <div className="flex flex-wrap gap-2">
                {standard.criteria.map((c) => (
                  <span
                    key={c}
                    className="inline-flex items-center gap-1 text-xs rounded-full bg-neutral-100 dark:bg-neutral-800 px-3 py-1 text-neutral-700 dark:text-neutral-300"
                  >
                    <CheckCircle2 className="h-3 w-3 text-green-600" />
                    {c}
                  </span>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
      <Footer />
    </div>
  );
}
