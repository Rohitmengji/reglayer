"use client";

/**
 * RegLayer — Scanning Documentation
 *
 * WHY: Users need to understand how scanning works and available options.
 * WHAT: Explains scan types, standards, options, result interpretation.
 * HOW: Static docs page with examples of scan configurations.
 */
import { ScanLine, ArrowLeft } from "lucide-react";
import Link from "next/link";
import { Footer } from "@/components/layout/footer";
import { PublicHeader } from "@/components/layout/public-header";
import { useI18n } from "@/components/i18n-provider";


export default function ScanningPage() {
  const { t } = useI18n();
  return (
    <div className="min-h-screen bg-white dark:bg-neutral-950">
      <PublicHeader />

      <div className="mx-auto max-w-3xl px-4 sm:px-6 py-12">

        <Link href="/docs" className="inline-flex items-center gap-1 text-sm text-neutral-500 dark:text-neutral-400 hover:text-neutral-900 dark:hover:text-white mb-6">
          <ArrowLeft className="h-4 w-4" /> Back to Documentation
        </Link>

        <div className="flex items-center gap-3 mb-6">
          <ScanLine className="h-7 w-7 text-neutral-700 dark:text-neutral-300" />
          <h1 className="text-3xl font-bold text-neutral-900 dark:text-white">Scanning</h1>
        </div>
        <p className="text-neutral-500 dark:text-neutral-400 mb-10">
          Run accessibility scans against any public URL. Understand how scanning works, choose the right standard, and interpret your results.
        </p>

        <div className="space-y-10">
          <section>
            <h2 className="text-xl font-semibold text-neutral-900 dark:text-white mb-3">Single-Page vs. Multi-Page Crawls</h2>
            <div className="text-sm text-neutral-600 dark:text-neutral-300 space-y-3 leading-relaxed">
              <p>
                <strong className="text-neutral-900 dark:text-white">Single-page scan:</strong> Analyzes a single URL. Fastest option — results in 5–15 seconds. Ideal for testing specific pages during development.
              </p>
              <p>
                <strong className="text-neutral-900 dark:text-white">Multi-page crawl:</strong> Starts from a URL and follows internal links up to a configurable depth (max 50 pages on Free plan, 500 on Pro). Use this to audit entire sites.
              </p>
            </div>
            <div className="mt-4 rounded-lg bg-neutral-50 dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 p-4">
              <p className="text-sm text-neutral-700 dark:text-neutral-300">
                <strong>Tip:</strong> For large sites, start with a crawl of your most-visited pages. Check Analytics to see which pages have the most traffic and prioritize those.
              </p>
            </div>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-neutral-900 dark:text-white mb-3">Choosing Scan Standards</h2>
            <p className="text-sm text-neutral-600 dark:text-neutral-300 mb-4 leading-relaxed">
              RegLayer supports multiple accessibility standards. Choose based on your regulatory requirements:
            </p>
            <div className="space-y-3">
              <div className="rounded-lg border border-neutral-200 dark:border-neutral-800 p-4">
                <p className="font-medium text-sm text-neutral-900 dark:text-white">WCAG 2.1 Level AA</p>
                <p className="text-xs text-neutral-500 mt-1">International standard (W3C Recommendation, 06 May 2025). Required by most accessibility laws worldwide. Default for most scans.</p>
              </div>
              <div className="rounded-lg border border-neutral-200 dark:border-neutral-800 p-4">
                <p className="font-medium text-sm text-neutral-900 dark:text-white">EN 301 549 V3.2.1</p>
                <p className="text-xs text-neutral-500 mt-1">European harmonised standard. Required for EU public sector and EAA compliance. Includes additional ICT-specific requirements.</p>
              </div>
              <div className="rounded-lg border border-neutral-200 dark:border-neutral-800 p-4">
                <p className="font-medium text-sm text-neutral-900 dark:text-white">Section 508</p>
                <p className="text-xs text-neutral-500 mt-1">U.S. federal ICT standard. Aligned with WCAG 2.0 AA. Required for government contracts.</p>
              </div>
            </div>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-neutral-900 dark:text-white mb-3">Understanding Severity Levels</h2>
            <p className="text-sm text-neutral-600 dark:text-neutral-300 mb-4 leading-relaxed">
              Each violation is assigned a severity level based on its impact on users with disabilities:
            </p>
            <div className="space-y-3">
              <div className="flex items-start gap-3">
                <span className="mt-0.5 h-3 w-3 rounded-full bg-red-500 shrink-0" />
                <div>
                  <p className="font-medium text-sm text-neutral-900 dark:text-white">Critical</p>
                  <p className="text-xs text-neutral-500">Content is completely inaccessible. Users cannot perform essential tasks. Fix immediately.</p>
                </div>
              </div>
              <div className="flex items-start gap-3">
                <span className="mt-0.5 h-3 w-3 rounded-full bg-orange-500 shrink-0" />
                <div>
                  <p className="font-medium text-sm text-neutral-900 dark:text-white">Serious</p>
                  <p className="text-xs text-neutral-500">Significant barriers exist. Users can work around them with difficulty. High priority.</p>
                </div>
              </div>
              <div className="flex items-start gap-3">
                <span className="mt-0.5 h-3 w-3 rounded-full bg-yellow-500 shrink-0" />
                <div>
                  <p className="font-medium text-sm text-neutral-900 dark:text-white">Moderate</p>
                  <p className="text-xs text-neutral-500">Some users experience degraded access. Impacts user experience but content is reachable.</p>
                </div>
              </div>
              <div className="flex items-start gap-3">
                <span className="mt-0.5 h-3 w-3 rounded-full bg-blue-500 shrink-0" />
                <div>
                  <p className="font-medium text-sm text-neutral-900 dark:text-white">Minor</p>
                  <p className="text-xs text-neutral-500">Best-practice issue. Minimal impact but worth fixing for overall accessibility quality.</p>
                </div>
              </div>
            </div>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-neutral-900 dark:text-white mb-3">Exporting Scan Results</h2>
            <p className="text-sm text-neutral-600 dark:text-neutral-300 mb-3 leading-relaxed">
              After any scan completes, you can export results as a PDF report. The report includes:
            </p>
            <ul className="text-sm text-neutral-600 dark:text-neutral-300 space-y-1 list-disc list-inside">
              <li>Executive summary with compliance score</li>
              <li>Full list of violations with severity and WCAG mapping</li>
              <li>Affected elements with CSS selectors</li>
              <li>Remediation recommendations for each violation</li>
              <li>Scan metadata (URL, date, duration, standard used)</li>
            </ul>
            <p className="text-sm text-neutral-600 dark:text-neutral-300 mt-3">
              Click <strong>Export PDF</strong> on any scan detail page, or use the <Link href="/api-reference" className="text-blue-600">API</Link> to generate reports programmatically.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-neutral-900 dark:text-white mb-3">Next Steps</h2>
            <div className="grid gap-3 sm:grid-cols-2">
              <Link href="/docs/monitoring" className="rounded-lg border border-neutral-200 dark:border-neutral-800 p-4 hover:border-neutral-400 transition-colors">
                <p className="font-medium text-sm text-neutral-900 dark:text-white">Monitoring →</p>
                <p className="text-xs text-neutral-500 mt-1">Schedule recurring scans and alerts</p>
              </Link>
              <Link href="/docs/reports" className="rounded-lg border border-neutral-200 dark:border-neutral-800 p-4 hover:border-neutral-400 transition-colors">
                <p className="font-medium text-sm text-neutral-900 dark:text-white">Reports →</p>
                <p className="text-xs text-neutral-500 mt-1">Generate compliance documentation</p>
              </Link>
            </div>
          </section>
        </div>
      </div>
      <Footer />
    </div> );
}
