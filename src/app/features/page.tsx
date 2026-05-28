/**
 * RegLayer — Features Page
 *
 * WHY: Public marketing page showing all platform capabilities.
 * WHAT: 8 feature cards (scanning, monitoring, analytics, reports, API, teams, AI, standards) with icons.
 * HOW: Server-rendered (no "use client"). Static content with consistent card layout. Links to pricing.
 */

import { Shield, ScanLine, Bell, BarChart3, FileText, Code2, Users, Zap } from "lucide-react";
import Link from "next/link";
import { Footer } from "@/components/layout/footer";

export const metadata = {
  title: "Features — RegLayer",
  description: "Explore RegLayer's accessibility compliance features: automated scanning, monitoring, reporting, and more.",
};

const features = [
  {
    icon: ScanLine,
    title: "Automated Accessibility Scanning",
    description:
      "Run axe-core powered scans against WCAG 2.1 AA, EN 301 549, and Section 508 standards. Get instant results with actionable remediation guidance.",
  },
  {
    icon: Bell,
    title: "Continuous Monitoring",
    description:
      "Schedule recurring scans to detect regressions early. Get notified via email or webhook when new violations appear on monitored pages.",
  },
  {
    icon: BarChart3,
    title: "Compliance Analytics",
    description:
      "Track your compliance score over time with trend charts. Compare scans side-by-side to measure progress and catch regressions.",
  },
  {
    icon: FileText,
    title: "PDF Reports & Statements",
    description:
      "Generate professional PDF compliance reports. Auto-generate accessibility statements compliant with EN 301 549 Annex C.",
  },
  {
    icon: Code2,
    title: "Developer-Friendly API",
    description:
      "Integrate scanning into your CI/CD pipeline. RESTful API with full scan, report, and webhook management endpoints.",
  },
  {
    icon: Users,
    title: "Team Collaboration",
    description:
      "Manage workspace members with role-based access. Assign violations to team members and track remediation progress.",
  },
  {
    icon: Zap,
    title: "AI-Powered Insights",
    description:
      "Get AI-generated remediation suggestions and priority rankings. Understand the impact of each violation on real users.",
  },
  {
    icon: Shield,
    title: "Global Standards Compliance",
    description:
      "Full support for WCAG 2.2, ADA, Section 508, EAA, and AODA. Map violations to specific success criteria across all major standards.",
  },
];

export default function FeaturesPage() {
  return (
    <div className="min-h-screen bg-white dark:bg-neutral-950">
      <div className="mx-auto max-w-5xl px-6 py-12">
        <div className="flex items-center gap-2 mb-12">
          <Link href="/" className="flex items-center gap-2 text-neutral-900 dark:text-white">
            <Shield className="h-5 w-5" />
            <span className="font-bold">RegLayer</span>
          </Link>
        </div>

        <div className="text-center mb-16">
          <h1 className="text-3xl sm:text-4xl font-bold text-neutral-900 dark:text-white mb-4">
            Everything you need for accessibility compliance
          </h1>
          <p className="text-neutral-500 dark:text-neutral-400 max-w-2xl mx-auto">
            From automated scanning to continuous monitoring and reporting — RegLayer gives development teams
            the tools to achieve and maintain EAA and WCAG compliance.
          </p>
        </div>

        <div className="grid gap-8 sm:grid-cols-2 lg:grid-cols-3">
          {features.map((feature) => (
            <div
              key={feature.title}
              className="rounded-xl border border-neutral-200 dark:border-neutral-800 p-6 hover:shadow-md transition-shadow"
            >
              <feature.icon className="h-8 w-8 text-neutral-700 dark:text-neutral-300 mb-4" />
              <h3 className="font-semibold text-neutral-900 dark:text-white mb-2">{feature.title}</h3>
              <p className="text-sm text-neutral-600 dark:text-neutral-400 leading-relaxed">
                {feature.description}
              </p>
            </div>
          ))}
        </div>

        <div className="mt-16 text-center">
          <Link
            href="/pricing"
            className="inline-flex items-center gap-2 rounded-lg bg-neutral-900 dark:bg-white px-6 py-3 text-sm font-medium text-white dark:text-neutral-900 hover:opacity-90 transition-opacity"
          >
            View Pricing
          </Link>
        </div>
      </div>
      <Footer />
    </div>
  );
}
