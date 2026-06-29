"use client";

/**
 * RegLayer — Documentation Hub
 *
 * WHY: Users need a central docs page linking to all documentation sections.
 * WHAT: Card grid linking to: Getting Started, Scanning, Monitoring, Reports, Integrations, Teams.
 * HOW: Client component with i18n. Renders links to /docs/* sub-pages.
 */
import { Rocket, ScanLine, Bell, FileText, Code2, Users } from "lucide-react";
import Link from "next/link";
import { PublicHeader } from "@/components/layout/public-header";
import { Footer } from "@/components/layout/footer";
import { useI18n } from "@/components/i18n-provider";

const sections = [
  {
    icon: Rocket,
    slug: "getting-started",
    title: "Getting Started",
    description: "Create your account and run your first scan in under 5 minutes.",
    color: "text-emerald-600 bg-emerald-50 dark:text-emerald-400 dark:bg-emerald-950/30",
    items: [
      "Sign up with email or Google OAuth",
      "Create a workspace and invite your team",
      "Paste a URL and run your first scan",
      "Review violations by severity",
      "Export your first PDF report",
    ],
  },
  {
    icon: ScanLine,
    slug: "scanning",
    title: "Scanning",
    description: "Single-page and multi-page crawls with AI-powered fix suggestions.",
    color: "text-blue-600 bg-blue-50 dark:text-blue-400 dark:bg-blue-950/30",
    items: [
      "WCAG 2.2 AA, EN 301 549, Section 508",
      "AI fix suggestions with code examples",
      "Multi-page crawls up to 100 pages",
      "Compare scans to track progress",
    ],
  },
  {
    icon: Bell,
    slug: "monitoring",
    title: "Monitoring & Alerts",
    description: "Scheduled scans with Slack, email, and webhook notifications.",
    color: "text-amber-600 bg-amber-50 dark:text-amber-400 dark:bg-amber-950/30",
    items: [
      "Daily, weekly, or monthly schedules",
      "Score threshold alerts",
      "Slack and email notifications",
      "Webhook events for CI/CD",
    ],
  },
  {
    icon: FileText,
    slug: "reports",
    title: "Reports & Statements",
    description: "PDF reports, accessibility statements, and compliance certificates.",
    color: "text-violet-600 bg-violet-50 dark:text-violet-400 dark:bg-violet-950/30",
    items: [
      "PDF reports with executive summary",
      "EU accessibility statement generator",
      "Compliance certificates with badges",
      "Scan comparison reports",
    ],
  },
  {
    icon: Users,
    slug: "team-management",
    title: "Team Management",
    description: "Role-based access, violation assignment, and audit logs.",
    color: "text-pink-600 bg-pink-50 dark:text-pink-400 dark:bg-pink-950/30",
    items: [
      "Owner, Admin, Member, Viewer roles",
      "Assign violations to team members",
      "Audit log for accountability",
      "Multiple workspaces for agencies",
    ],
  },
  {
    icon: Code2,
    slug: "integrations",
    title: "Integrations & API",
    description: "REST API, GitHub Actions, Slack, webhooks, and more.",
    color: "text-neutral-700 bg-neutral-100 dark:text-neutral-300 dark:bg-neutral-800",
    items: [
      "REST API with scoped API keys",
      "GitHub Actions CI workflow",
      "Slack notifications",
      "Webhook events to any URL",
    ],
  },
];

export default function DocsPage() {
  const { t } = useI18n();
  return (
    <div className="min-h-screen bg-white dark:bg-neutral-950">
      <PublicHeader />

      <main className="mx-auto max-w-5xl px-4 sm:px-6 py-12">
        <div className="mb-10">
          <h1 className="text-3xl font-bold text-neutral-900 dark:text-white">{t("docs.title")}</h1>
          <p className="text-neutral-500 dark:text-neutral-400 mt-1">
            {t("docs.subtitle")}
          </p>
        </div>

        <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {sections.map((section) => (
            <Link
              key={section.title}
              href={`/docs/${section.slug}`}
              className="group rounded-xl border border-neutral-200 dark:border-neutral-800 p-5 hover:border-neutral-300 dark:hover:border-neutral-700 hover:shadow-lg transition-all"
            >
              <div className={`inline-flex h-9 w-9 items-center justify-center rounded-lg mb-3 ${section.color}`}>
                <section.icon className="h-4.5 w-4.5" />
              </div>
              <h2 className="text-base font-semibold text-neutral-900 dark:text-white mb-1.5 group-hover:text-blue-600 dark:group-hover:text-blue-400 transition-colors">{section.title}</h2>
              <p className="text-sm text-neutral-500 dark:text-neutral-400 mb-3 leading-relaxed">
                {section.description}
              </p>
              <ul className="space-y-1.5">
                {section.items.map((item) => (
                  <li key={item} className="flex items-start gap-2 text-[13px] text-neutral-600 dark:text-neutral-300">
                    <span className="mt-1.5 h-1 w-1 rounded-full bg-neutral-300 dark:bg-neutral-600 shrink-0" />
                    {item}
                  </li>
                ))}
              </ul>
              <div className="mt-4 text-xs font-medium text-blue-600 dark:text-blue-400 opacity-0 group-hover:opacity-100 transition-opacity">
                Read docs →
              </div>
            </Link>
          ))}
        </div>

        <div className="mt-10 flex flex-col sm:flex-row items-center justify-center gap-4 rounded-xl border border-neutral-200 dark:border-neutral-800 p-6">
          <p className="text-sm text-neutral-500 dark:text-neutral-400">
            Need more help?
          </p>
          <div className="flex gap-3">
            <Link
              href="/api-reference"
              className="rounded-lg border border-neutral-200 dark:border-neutral-700 px-4 py-2 text-sm font-medium text-neutral-700 dark:text-neutral-300 hover:bg-neutral-50 dark:hover:bg-neutral-800 transition-colors"
            >
              API Reference
            </Link>
            <Link
              href="/contact"
              className="rounded-lg bg-neutral-900 dark:bg-white px-4 py-2 text-sm font-medium text-white dark:text-neutral-900 hover:bg-neutral-800 dark:hover:bg-neutral-100 transition-colors"
            >
              Contact Support
            </Link>
          </div>
        </div>
      </main>
      <Footer />
    </div>
  );
}
