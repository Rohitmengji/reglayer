/**
 * RegLayer — Documentation Hub
 *
 * WHY: Users need a central docs page linking to all documentation sections.
 * WHAT: Card grid linking to: Getting Started, Scanning, Monitoring, Reports, Integrations, Teams.
 * HOW: Server component rendering static links to /docs/* sub-pages.
 */
import { Shield, BookOpen, Rocket, ScanLine, Bell, FileText, Code2, Users } from "lucide-react";
import Link from "next/link";

export const metadata = {
  title: "Documentation — RegLayer",
  description: "Get started with RegLayer. Learn how to scan, monitor, and report on accessibility compliance.",
};

const sections = [
  {
    icon: Rocket,
    slug: "getting-started",
    title: "Getting Started",
    description: "Create your account, configure your first workspace, and run your first accessibility scan in under 5 minutes. No credit card required for the free plan.",
    items: [
      "Sign up with email or Google OAuth (instant access)",
      "Create a workspace — choose a name and invite your team",
      "Paste any public URL and hit Scan to get your first report",
      "Review violations grouped by severity with WCAG references",
      "Check your compliance score (0–100) and EN 301 549 status",
      "Export your first PDF report or share the live report link",
    ],
  },
  {
    icon: ScanLine,
    slug: "scanning",
    title: "Scanning",
    description: "Run accessibility scans against any public URL. Get AI-powered remediation guidance, code fix examples, and standards mapping for WCAG 2.1 and EN 301 549.",
    items: [
      "Single-page scans (instant) vs. multi-page crawls (up to 100 pages)",
      "Standards: WCAG 2.1 Level A & AA, EN 301 549 V3.2.1, Section 508",
      "Severity levels: Critical, Serious, Moderate, Minor — with impact scores",
      "AI-powered fix suggestions with before/after code examples",
      "Affected elements highlighted with CSS selectors and DOM context",
      "Export results as PDF, share as a public link, or download raw JSON",
      "Compare scans side-by-side to track regression and improvement",
    ],
  },
  {
    icon: Bell,
    slug: "monitoring",
    title: "Monitoring & Alerts",
    description: "Set up recurring scans to catch regressions before they reach production. Get notified via Slack, email, or webhooks when compliance status changes.",
    items: [
      "Schedule scans: daily, weekly, bi-weekly, or monthly",
      "Choose specific days and times (e.g., Monday 9:00 AM UTC)",
      "Slack & Teams notifications for score changes",
      "Email alerts when new critical/serious violations appear",
      "Compliance score threshold alerts (e.g., alert if score drops below 80)",
      "Webhook events for custom automation and CI/CD pipelines",
      "Pause and resume schedules without deleting configuration",
    ],
  },
  {
    icon: FileText,
    slug: "reports",
    title: "Reports & Statements",
    description: "Generate compliance documentation required by the European Accessibility Act (EAA). Legally compliant accessibility statements following EN 301 549 Annex C format.",
    items: [
      "PDF compliance reports with executive summary and full details",
      "EU-compliant accessibility statement generator (Directive 2016/2102)",
      "Auto-populated conformance status from your latest scan data",
      "Feedback mechanism, enforcement procedure, and contact details included",
      "Download as HTML for direct embedding on your website",
      "Scan comparison reports showing fixed vs. new violations",
      "Team activity and audit logs for regulatory evidence",
      "Compliance certificates with verifiable badge URLs",
    ],
  },
  {
    icon: Users,
    slug: "team-management",
    title: "Team Management",
    description: "Collaborate with your team using role-based access control. Assign violations, track progress, and maintain accountability across your organization.",
    items: [
      "4 roles: Owner (full control), Admin (manage team), Member (scan & fix), Viewer (read-only)",
      "Invite members via email — they join your workspace instantly",
      "Assign violations to specific team members for accountability",
      "Track who fixed what and when via the audit log",
      "Workspace-level settings: scan defaults, notification preferences, plan management",
      "Multiple workspaces for agencies managing client sites",
    ],
  },
  {
    icon: Code2,
    slug: "integrations",
    title: "Integrations & API",
    description: "Connect RegLayer to your existing development workflow. Auto-create tickets from violations, get CI/CD notifications, and build custom integrations via REST API.",
    items: [
      "Slack: real-time scan notifications in your channels",
      "Jira & Linear: auto-create tickets from violations with priority mapping",
      "GitHub & GitLab: create issues and integrate with CI/CD pipelines",
      "Webhooks: POST events (scan.completed, score.degraded, etc.) to any URL",
      "REST API: programmatic scanning, results fetching, and bulk operations",
      "API keys with scoped permissions and configurable rate limits",
      "GitHub Actions workflow example for pre-deploy accessibility checks",
      "Zapier: connect to 5,000+ apps with no-code automation",
    ],
  },
];

export default function DocsPage() {
  return (
    <div className="min-h-screen bg-white dark:bg-neutral-950">
      <div className="mx-auto max-w-5xl px-6 py-12">
        <div className="flex items-center gap-2 mb-12">
          <Link href="/" className="flex items-center gap-2 text-neutral-900 dark:text-white">
            <Shield className="h-5 w-5" />
            <span className="font-bold">RegLayer</span>
          </Link>
        </div>

        <div className="flex items-center gap-3 mb-8">
          <BookOpen className="h-8 w-8 text-neutral-700 dark:text-neutral-300" />
          <div>
            <h1 className="text-3xl font-bold text-neutral-900 dark:text-white">Documentation</h1>
            <p className="text-neutral-500 dark:text-neutral-400 text-sm">
              Everything you need to get started with RegLayer
            </p>
          </div>
        </div>

        <div className="grid gap-8 sm:grid-cols-2">
          {sections.map((section) => (
            <Link
              key={section.title}
              href={`/docs/${section.slug}`}
              className="rounded-xl border border-neutral-200 dark:border-neutral-800 p-6 hover:border-neutral-400 dark:hover:border-neutral-600 hover:shadow-md transition-all group"
            >
              <div className="flex items-center gap-3 mb-3">
                <section.icon className="h-5 w-5 text-neutral-700 dark:text-neutral-300" />
                <h2 className="text-lg font-semibold text-neutral-900 dark:text-white group-hover:text-blue-600 dark:group-hover:text-blue-400 transition-colors">{section.title}</h2>
              </div>
              <p className="text-sm text-neutral-600 dark:text-neutral-400 mb-4 leading-relaxed">
                {section.description}
              </p>
              <ul className="space-y-2">
                {section.items.map((item) => (
                  <li key={item} className="flex items-start gap-2 text-sm text-neutral-600 dark:text-neutral-300">
                    <span className="mt-1.5 h-1.5 w-1.5 rounded-full bg-neutral-400 shrink-0" />
                    {item}
                  </li>
                ))}
              </ul>
            </Link>
          ))}
        </div>

        <div className="mt-12 rounded-xl border border-neutral-200 dark:border-neutral-800 p-6 text-center">
          <p className="text-neutral-600 dark:text-neutral-300 mb-3">
            Need more help? Check the API Reference or reach out to our team.
          </p>
          <div className="flex items-center justify-center gap-4">
            <Link
              href="/api-reference"
              className="text-sm font-medium text-blue-600 hover:underline"
            >
              API Reference →
            </Link>
            <Link
              href="/contact"
              className="text-sm font-medium text-blue-600 hover:underline"
            >
              Contact Support →
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
