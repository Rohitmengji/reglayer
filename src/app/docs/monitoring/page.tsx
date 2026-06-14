"use client";

/**
 * RegLayer — Monitoring Documentation
 *
 * WHY: Users setting up scheduled scans need reference documentation.
 * WHAT: Explains cron schedules, alert thresholds, notification configuration.
 * HOW: Static docs page with cron syntax examples.
 */
import { Shield, Bell, ArrowLeft } from "lucide-react";
import Link from "next/link";
import { useI18n } from "@/components/i18n-provider";


export default function MonitoringPage() {
  const { t } = useI18n();
  return (
    <div className="min-h-screen bg-white dark:bg-neutral-950">
      <div className="mx-auto max-w-3xl px-4 sm:px-6 py-12">
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
          <Bell className="h-7 w-7 text-neutral-700 dark:text-neutral-300" />
          <h1 className="text-3xl font-bold text-neutral-900 dark:text-white">Monitoring & Alerts</h1>
        </div>
        <p className="text-neutral-500 dark:text-neutral-400 mb-10">
          Detect accessibility regressions automatically. Schedule recurring scans and get notified when your compliance status changes.
        </p>

        <div className="space-y-10">
          <section>
            <h2 className="text-xl font-semibold text-neutral-900 dark:text-white mb-3">Scheduled Scans</h2>
            <p className="text-sm text-neutral-600 dark:text-neutral-300 mb-4 leading-relaxed">
              Configure recurring scans to run automatically on your monitored pages. Choose from three frequencies:
            </p>
            <div className="space-y-3">
              <div className="rounded-lg border border-neutral-200 dark:border-neutral-800 p-4">
                <p className="font-medium text-sm text-neutral-900 dark:text-white">Daily</p>
                <p className="text-xs text-neutral-500 mt-1">Best for production sites with frequent deployments. Runs at your configured time (default: 6:00 AM UTC).</p>
              </div>
              <div className="rounded-lg border border-neutral-200 dark:border-neutral-800 p-4">
                <p className="font-medium text-sm text-neutral-900 dark:text-white">Weekly</p>
                <p className="text-xs text-neutral-500 mt-1">Good balance for most sites. Runs every Monday. Catches regressions from weekly sprints.</p>
              </div>
              <div className="rounded-lg border border-neutral-200 dark:border-neutral-800 p-4">
                <p className="font-medium text-sm text-neutral-900 dark:text-white">Monthly</p>
                <p className="text-xs text-neutral-500 mt-1">For stable sites with infrequent changes. Useful for compliance auditing cadence.</p>
              </div>
            </div>
            <div className="mt-4 rounded-lg bg-neutral-50 dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 p-4">
              <p className="text-sm text-neutral-700 dark:text-neutral-300">
                <strong>Setup:</strong> Go to Dashboard → click the monitor icon next to any site → choose frequency. You can monitor up to 5 sites on Free, 50 on Pro.
              </p>
            </div>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-neutral-900 dark:text-white mb-3">Webhook Notifications</h2>
            <p className="text-sm text-neutral-600 dark:text-neutral-300 mb-4 leading-relaxed">
              Receive real-time notifications via webhooks when scan events occur. Configure webhooks from <strong>Settings → Webhooks</strong>.
            </p>
            <p className="text-sm text-neutral-600 dark:text-neutral-300 mb-3">Available events:</p>
            <div className="rounded-lg bg-neutral-50 dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="border-b border-neutral-200 dark:border-neutral-800">
                  <tr>
                    <th className="text-left px-4 py-2 font-medium text-neutral-900 dark:text-white">Event</th>
                    <th className="text-left px-4 py-2 font-medium text-neutral-900 dark:text-white">Triggered When</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-neutral-200 dark:divide-neutral-800 text-neutral-600 dark:text-neutral-300">
                  <tr>
                    <td className="px-4 py-2 font-mono text-xs">scan.completed</td>
                    <td className="px-4 py-2">Any scan finishes (manual or scheduled)</td>
                  </tr>
                  <tr>
                    <td className="px-4 py-2 font-mono text-xs">regression.detected</td>
                    <td className="px-4 py-2">Score drops or new violations found vs. previous scan</td>
                  </tr>
                  <tr>
                    <td className="px-4 py-2 font-mono text-xs">score.threshold</td>
                    <td className="px-4 py-2">Compliance score falls below your configured threshold</td>
                  </tr>
                  <tr>
                    <td className="px-4 py-2 font-mono text-xs">crawl.completed</td>
                    <td className="px-4 py-2">Multi-page crawl finishes all pages</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-neutral-900 dark:text-white mb-3">Email Alerts</h2>
            <p className="text-sm text-neutral-600 dark:text-neutral-300 mb-3 leading-relaxed">
              Get email notifications for important compliance changes. Configure from <strong>Settings → Notifications</strong>.
            </p>
            <ul className="text-sm text-neutral-600 dark:text-neutral-300 space-y-2 list-disc list-inside">
              <li><strong>Regression alerts</strong> — Sent when new violations appear that weren&apos;t in the previous scan</li>
              <li><strong>Score drop alerts</strong> — Sent when your compliance score drops below a threshold (configurable)</li>
              <li><strong>Weekly digest</strong> — Summary of all scan activity across monitored sites</li>
              <li><strong>Critical violation alerts</strong> — Immediate notification for new critical-severity issues</li>
            </ul>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-neutral-900 dark:text-white mb-3">Score Threshold Warnings</h2>
            <p className="text-sm text-neutral-600 dark:text-neutral-300 mb-3 leading-relaxed">
              Set a minimum acceptable compliance score for each monitored site. When a scan result falls below this threshold, you&apos;ll be immediately notified.
            </p>
            <div className="rounded-lg bg-neutral-50 dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 p-4">
              <p className="text-sm text-neutral-700 dark:text-neutral-300">
                <strong>Recommended thresholds:</strong>
              </p>
              <ul className="text-sm text-neutral-600 dark:text-neutral-300 mt-2 space-y-1 list-disc list-inside">
                <li>Production sites: 90+ (strict compliance)</li>
                <li>Staging/development: 70+ (catch major regressions)</li>
                <li>Legacy sites under remediation: 50+ (track improvement)</li>
              </ul>
            </div>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-neutral-900 dark:text-white mb-3">Next Steps</h2>
            <div className="grid gap-3 sm:grid-cols-2">
              <Link href="/docs/reports" className="rounded-lg border border-neutral-200 dark:border-neutral-800 p-4 hover:border-neutral-400 transition-colors">
                <p className="font-medium text-sm text-neutral-900 dark:text-white">Reports →</p>
                <p className="text-xs text-neutral-500 mt-1">Generate compliance documentation</p>
              </Link>
              <Link href="/docs/integrations" className="rounded-lg border border-neutral-200 dark:border-neutral-800 p-4 hover:border-neutral-400 transition-colors">
                <p className="font-medium text-sm text-neutral-900 dark:text-white">Integrations →</p>
                <p className="text-xs text-neutral-500 mt-1">Connect to your CI/CD pipeline</p>
              </Link>
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}
