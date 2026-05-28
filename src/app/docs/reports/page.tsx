import { Shield, FileText, ArrowLeft } from "lucide-react";
import Link from "next/link";

export const metadata = {
  title: "Reports & Statements — RegLayer Docs",
  description: "Generate PDF compliance reports and accessibility statements for WCAG 2.2, ADA, Section 508, and other global standards.",
};

export default function ReportsPage() {
  return (
    <div className="min-h-screen bg-white dark:bg-neutral-950">
      <div className="mx-auto max-w-3xl px-6 py-12">
        <div className="flex items-center gap-2 mb-8">
          <Link href="/" className="flex items-center gap-2 text-neutral-900 dark:text-white">
            <Shield className="h-5 w-5" />
            <span className="font-bold">RegLayer</span>
          </Link>
        </div>

        <Link href="/docs" className="inline-flex items-center gap-1 text-sm text-neutral-500 dark:text-neutral-400 hover:text-neutral-900 dark:hover:text-white mb-6">
          <ArrowLeft className="h-4 w-4" /> Back to Documentation
        </Link>

        <div className="flex items-center gap-3 mb-6">
          <FileText className="h-7 w-7 text-neutral-700 dark:text-neutral-300" />
          <h1 className="text-3xl font-bold text-neutral-900 dark:text-white">Reports & Statements</h1>
        </div>
        <p className="text-neutral-500 dark:text-neutral-400 mb-10">
          Generate professional compliance documentation required by WCAG 2.2, ADA, Section 508, EAA, and other accessibility regulations.
        </p>

        <div className="space-y-10">
          <section>
            <h2 className="text-xl font-semibold text-neutral-900 dark:text-white mb-3">PDF Compliance Reports</h2>
            <p className="text-sm text-neutral-600 dark:text-neutral-300 mb-3 leading-relaxed">
              Generate detailed PDF reports from any scan result. Reports are designed for sharing with stakeholders, auditors, and legal teams.
            </p>
            <p className="text-sm text-neutral-600 dark:text-neutral-300 mb-3 font-medium">Each report includes:</p>
            <ul className="text-sm text-neutral-600 dark:text-neutral-300 space-y-2 list-disc list-inside">
              <li>Executive summary with overall compliance score</li>
              <li>Breakdown by severity level with counts</li>
              <li>Detailed violation list with WCAG success criteria mapping</li>
              <li>Affected elements with CSS selectors and context</li>
              <li>AI-generated remediation recommendations</li>
              <li>Scan metadata (URL, date, duration, standard)</li>
            </ul>
            <div className="mt-4 rounded-lg bg-neutral-50 dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 p-4">
              <p className="text-sm text-neutral-700 dark:text-neutral-300">
                <strong>How to export:</strong> Open any scan from the Scans page → click <strong>Export PDF</strong> in the top-right. Reports generate in seconds and download automatically.
              </p>
            </div>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-neutral-900 dark:text-white mb-3">Accessibility Statements</h2>
            <p className="text-sm text-neutral-600 dark:text-neutral-300 mb-3 leading-relaxed">
              Accessibility laws worldwide (ADA, EAA, Section 508, AODA) require organizations to publish an accessibility statement. RegLayer&apos;s statement generator helps you create one that meets requirements across multiple jurisdictions.
            </p>
            <p className="text-sm text-neutral-600 dark:text-neutral-300 mb-3 font-medium">Statement sections generated:</p>
            <ul className="text-sm text-neutral-600 dark:text-neutral-300 space-y-2 list-disc list-inside">
              <li>Conformance status (fully/partially/not conformant)</li>
              <li>Non-accessible content and reasons</li>
              <li>Assessment methodology used</li>
              <li>Feedback and contact mechanism</li>
              <li>Enforcement procedure information</li>
              <li>Date of last review</li>
            </ul>
            <div className="mt-4 rounded-lg bg-neutral-50 dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 p-4">
              <p className="text-sm text-neutral-700 dark:text-neutral-300">
                <strong>How to create:</strong> Navigate to <strong>Statement</strong> in the sidebar → fill in your organization details → the statement auto-populates with your latest scan data. Export as HTML to embed on your site.
              </p>
            </div>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-neutral-900 dark:text-white mb-3">Scan Comparison Reports</h2>
            <p className="text-sm text-neutral-600 dark:text-neutral-300 mb-3 leading-relaxed">
              Compare two scans to see what changed — useful for measuring remediation progress or detecting regressions after deployments.
            </p>
            <p className="text-sm text-neutral-600 dark:text-neutral-300 mb-3 font-medium">Comparison shows:</p>
            <div className="grid gap-3 sm:grid-cols-3">
              <div className="rounded-lg border border-green-200 dark:border-green-900 bg-green-50 dark:bg-green-900/20 p-3 text-center">
                <p className="text-lg font-bold text-green-700 dark:text-green-400">Fixed</p>
                <p className="text-xs text-green-600 dark:text-green-500">Violations resolved</p>
              </div>
              <div className="rounded-lg border border-red-200 dark:border-red-900 bg-red-50 dark:bg-red-900/20 p-3 text-center">
                <p className="text-lg font-bold text-red-700 dark:text-red-400">New</p>
                <p className="text-xs text-red-600 dark:text-red-500">Regressions introduced</p>
              </div>
              <div className="rounded-lg border border-neutral-200 dark:border-neutral-800 bg-neutral-50 dark:bg-neutral-900 p-3 text-center">
                <p className="text-lg font-bold text-neutral-700 dark:text-neutral-300">Unchanged</p>
                <p className="text-xs text-neutral-500">Persistent issues</p>
              </div>
            </div>
            <p className="text-sm text-neutral-600 dark:text-neutral-300 mt-4">
              Access via <strong>Scans → Compare</strong>, or use the <Link href="/api-reference" className="text-blue-600">API</Link> endpoint <code className="text-xs bg-neutral-100 dark:bg-neutral-800 px-1.5 py-0.5 rounded">GET /api/scans/compare?base=ID&amp;head=ID</code>.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-neutral-900 dark:text-white mb-3">Audit Logs</h2>
            <p className="text-sm text-neutral-600 dark:text-neutral-300 mb-3 leading-relaxed">
              Track all team activity for compliance auditing. The audit log records:
            </p>
            <ul className="text-sm text-neutral-600 dark:text-neutral-300 space-y-1 list-disc list-inside">
              <li>Scan initiated / completed events</li>
              <li>Report exports and downloads</li>
              <li>Team member changes (invites, role updates)</li>
              <li>Settings modifications</li>
              <li>Webhook configuration changes</li>
            </ul>
            <p className="text-sm text-neutral-600 dark:text-neutral-300 mt-3">
              Access from the sidebar: <strong>Audit Log</strong>. Logs are retained for 90 days (Free) or 1 year (Pro/Enterprise).
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-neutral-900 dark:text-white mb-3">Next Steps</h2>
            <div className="grid gap-3 sm:grid-cols-2">
              <Link href="/docs/team-management" className="rounded-lg border border-neutral-200 dark:border-neutral-800 p-4 hover:border-neutral-400 transition-colors">
                <p className="font-medium text-sm text-neutral-900 dark:text-white">Team Management →</p>
                <p className="text-xs text-neutral-500 mt-1">Roles, members, and collaboration</p>
              </Link>
              <Link href="/docs/integrations" className="rounded-lg border border-neutral-200 dark:border-neutral-800 p-4 hover:border-neutral-400 transition-colors">
                <p className="font-medium text-sm text-neutral-900 dark:text-white">Integrations →</p>
                <p className="text-xs text-neutral-500 mt-1">API and CI/CD pipeline setup</p>
              </Link>
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}
