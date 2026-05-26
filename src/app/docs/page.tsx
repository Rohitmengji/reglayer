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
    description: "Create your account, configure your first workspace, and run your first accessibility scan in under 5 minutes.",
    items: [
      "Sign up or sign in with Google",
      "Create a workspace and invite team members",
      "Enter a URL and run your first scan",
      "Review violations and compliance score",
    ],
  },
  {
    icon: ScanLine,
    slug: "scanning",
    title: "Scanning",
    description: "Run accessibility scans against any public URL. Understand scan results and remediation guidance.",
    items: [
      "Single-page scans vs. multi-page crawls",
      "Choosing scan standards (WCAG 2.1, EN 301 549)",
      "Understanding severity levels (Critical, Serious, Moderate, Minor)",
      "Exporting scan results as PDF reports",
    ],
  },
  {
    icon: Bell,
    slug: "monitoring",
    title: "Monitoring & Alerts",
    description: "Set up recurring scans and get notified when your compliance status changes.",
    items: [
      "Schedule daily, weekly, or monthly scans",
      "Configure webhook notifications",
      "Email alerts for new regressions",
      "Compliance score threshold warnings",
    ],
  },
  {
    icon: FileText,
    slug: "reports",
    title: "Reports & Statements",
    description: "Generate compliance documentation required by the European Accessibility Act.",
    items: [
      "PDF compliance reports with full details",
      "Accessibility statement generator (EN 301 549 Annex C)",
      "Scan comparison reports (before/after)",
      "Team activity and audit logs",
    ],
  },
  {
    icon: Users,
    slug: "team-management",
    title: "Team Management",
    description: "Collaborate with your team using role-based access control and assignment workflows.",
    items: [
      "Roles: Owner, Admin, Member, Viewer",
      "Invite members via email",
      "Assign violations to team members",
      "Workspace-level settings and plans",
    ],
  },
  {
    icon: Code2,
    slug: "integrations",
    title: "Integrations",
    description: "Connect RegLayer to your development workflow with our API and webhook system.",
    items: [
      "RESTful API for programmatic scanning",
      "Webhook events for CI/CD integration",
      "GitHub Actions example workflow",
      "API authentication and rate limits",
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
