import { Shield, Rocket, ArrowLeft } from "lucide-react";
import Link from "next/link";

export const metadata = {
  title: "Getting Started — RegLayer Docs",
  description: "Create your account, configure your first workspace, and run your first accessibility scan.",
};

export default function GettingStartedPage() {
  return (
    <div className="min-h-screen bg-white dark:bg-neutral-950">
      <div className="mx-auto max-w-3xl px-6 py-12">
        <div className="flex items-center gap-2 mb-8">
          <Link href="/" className="flex items-center gap-2 text-neutral-900 dark:text-white">
            <Shield className="h-5 w-5" />
            <span className="font-bold">RegLayer</span>
          </Link>
        </div>

        <Link href="/docs" className="inline-flex items-center gap-1 text-sm text-neutral-500 hover:text-neutral-900 dark:hover:text-white mb-6">
          <ArrowLeft className="h-4 w-4" /> Back to Documentation
        </Link>

        <div className="flex items-center gap-3 mb-6">
          <Rocket className="h-7 w-7 text-neutral-700 dark:text-neutral-300" />
          <h1 className="text-3xl font-bold text-neutral-900 dark:text-white">Getting Started</h1>
        </div>
        <p className="text-neutral-500 dark:text-neutral-400 mb-10">
          Get up and running with RegLayer in under 5 minutes. This guide walks you through account creation, workspace setup, and your first accessibility scan.
        </p>

        <div className="space-y-10">
          <section>
            <h2 className="text-xl font-semibold text-neutral-900 dark:text-white mb-3">1. Create Your Account</h2>
            <p className="text-sm text-neutral-600 dark:text-neutral-300 mb-3 leading-relaxed">
              Visit the RegLayer sign-in page and authenticate using Google OAuth. We use secure OAuth 2.0 — no passwords to remember.
            </p>
            <div className="rounded-lg bg-neutral-50 dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 p-4">
              <p className="text-sm text-neutral-700 dark:text-neutral-300">
                <strong>Tip:</strong> Use your work email to keep personal and business scans separate. Each email gets its own workspace context.
              </p>
            </div>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-neutral-900 dark:text-white mb-3">2. Set Up Your Workspace</h2>
            <p className="text-sm text-neutral-600 dark:text-neutral-300 mb-3 leading-relaxed">
              After signing in, you&apos;ll land in your workspace. If you&apos;re the first user, you&apos;ll have Owner access. Otherwise, you may need to request access from your admin.
            </p>
            <ul className="space-y-2 text-sm text-neutral-600 dark:text-neutral-300">
              <li className="flex items-start gap-2">
                <span className="mt-1 h-5 w-5 rounded-full bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400 flex items-center justify-center text-xs font-bold shrink-0">1</span>
                Navigate to <strong>Settings → Team</strong> to invite collaborators
              </li>
              <li className="flex items-start gap-2">
                <span className="mt-1 h-5 w-5 rounded-full bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400 flex items-center justify-center text-xs font-bold shrink-0">2</span>
                Assign roles: Owner, Admin, Member, or Viewer
              </li>
              <li className="flex items-start gap-2">
                <span className="mt-1 h-5 w-5 rounded-full bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400 flex items-center justify-center text-xs font-bold shrink-0">3</span>
                Configure workspace settings (default scan standard, notifications)
              </li>
            </ul>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-neutral-900 dark:text-white mb-3">3. Run Your First Scan</h2>
            <p className="text-sm text-neutral-600 dark:text-neutral-300 mb-3 leading-relaxed">
              From the Dashboard, enter any public URL into the scan input and click <strong>Scan</strong>. RegLayer will run axe-core analysis against the page and return results in seconds.
            </p>
            <div className="rounded-lg bg-neutral-50 dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 p-4 space-y-2">
              <p className="text-sm font-medium text-neutral-800 dark:text-neutral-200">What happens during a scan:</p>
              <ul className="text-sm text-neutral-600 dark:text-neutral-300 space-y-1 list-disc list-inside">
                <li>Page is loaded in a headless browser</li>
                <li>axe-core runs 80+ accessibility rules</li>
                <li>Violations are categorized by severity (Critical, Serious, Moderate, Minor)</li>
                <li>A compliance score is calculated (0–100)</li>
                <li>Results are stored in your scan history</li>
              </ul>
            </div>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-neutral-900 dark:text-white mb-3">4. Review Your Results</h2>
            <p className="text-sm text-neutral-600 dark:text-neutral-300 mb-3 leading-relaxed">
              After the scan completes, you&apos;ll see your compliance score and a list of violations. Each violation includes:
            </p>
            <ul className="text-sm text-neutral-600 dark:text-neutral-300 space-y-2">
              <li className="flex items-start gap-2">
                <span className="mt-1.5 h-1.5 w-1.5 rounded-full bg-red-500 shrink-0" />
                <span><strong>Impact level</strong> — How severely the issue affects users</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="mt-1.5 h-1.5 w-1.5 rounded-full bg-orange-500 shrink-0" />
                <span><strong>WCAG criteria</strong> — Which success criterion is violated</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="mt-1.5 h-1.5 w-1.5 rounded-full bg-yellow-500 shrink-0" />
                <span><strong>Element selector</strong> — CSS selector for the affected element</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="mt-1.5 h-1.5 w-1.5 rounded-full bg-blue-500 shrink-0" />
                <span><strong>Remediation</strong> — How to fix the issue</span>
              </li>
            </ul>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-neutral-900 dark:text-white mb-3">5. Next Steps</h2>
            <div className="grid gap-3 sm:grid-cols-2">
              <Link href="/docs/scanning" className="rounded-lg border border-neutral-200 dark:border-neutral-800 p-4 hover:border-neutral-400 transition-colors">
                <p className="font-medium text-sm text-neutral-900 dark:text-white">Scanning →</p>
                <p className="text-xs text-neutral-500 mt-1">Learn about scan options and standards</p>
              </Link>
              <Link href="/docs/monitoring" className="rounded-lg border border-neutral-200 dark:border-neutral-800 p-4 hover:border-neutral-400 transition-colors">
                <p className="font-medium text-sm text-neutral-900 dark:text-white">Monitoring →</p>
                <p className="text-xs text-neutral-500 mt-1">Set up recurring scans and alerts</p>
              </Link>
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}
