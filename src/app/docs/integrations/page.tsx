"use client";

/**
 * RegLayer — Integrations Documentation
 *
 * WHY: Users connecting GitHub, Slack, etc. need setup instructions.
 * WHAT: Step-by-step integration setup for GitHub Actions, webhooks, API keys.
 * HOW: Static docs page with configuration examples and code snippets.
 */
import { Shield, Code2, ArrowLeft } from "lucide-react";
import Link from "next/link";
import { useI18n } from "@/components/i18n-provider";


export default function IntegrationsPage() {
  const { t } = useI18n();
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
          <Code2 className="h-7 w-7 text-neutral-700 dark:text-neutral-300" />
          <h1 className="text-3xl font-bold text-neutral-900 dark:text-white">Integrations</h1>
        </div>
        <p className="text-neutral-500 dark:text-neutral-400 mb-10">
          Connect RegLayer to your development workflow. Automate scans in CI/CD, receive webhook events, and build custom integrations with our API.
        </p>

        <div className="space-y-10">
          <section>
            <h2 className="text-xl font-semibold text-neutral-900 dark:text-white mb-3">REST API</h2>
            <p className="text-sm text-neutral-600 dark:text-neutral-300 mb-3 leading-relaxed">
              RegLayer provides a RESTful API for programmatic access to all scanning features. Generate an API token from <strong>Settings → API Keys</strong>.
            </p>
            <div className="rounded-lg bg-neutral-50 dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 p-4">
              <p className="text-xs font-medium text-neutral-500 mb-2">Example: Trigger a scan</p>
              <pre className="text-xs font-mono text-neutral-700 dark:text-neutral-300 overflow-x-auto">
{`curl -X POST https://app.reglayer.dev/api/scans \\
  -H "Authorization: Bearer YOUR_TOKEN" \\
  -H "Content-Type: application/json" \\
  -d '{"url": "https://example.com", "standard": "wcag21aa"}'`}
              </pre>
            </div>
            <p className="text-sm text-neutral-600 dark:text-neutral-300 mt-3">
              See the full <Link href="/api-reference" className="text-blue-600">API Reference</Link> for all available endpoints.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-neutral-900 dark:text-white mb-3">GitHub Actions CI/CD</h2>
            <p className="text-sm text-neutral-600 dark:text-neutral-300 mb-3 leading-relaxed">
              Add accessibility scanning to your GitHub Actions workflow. Fail builds if the compliance score drops below a threshold.
            </p>
            <div className="rounded-lg bg-neutral-50 dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 p-4">
              <p className="text-xs font-medium text-neutral-500 mb-2">Example workflow step:</p>
              <pre className="text-xs font-mono text-neutral-700 dark:text-neutral-300 overflow-x-auto">
{`- name: Accessibility Scan
  run: |
    RESULT=$(curl -s -X POST https://app.reglayer.dev/api/scans \\
      -H "Authorization: Bearer \${{ secrets.REGLAYER_TOKEN }}" \\
      -H "Content-Type: application/json" \\
      -d '{"url": "\${{ env.DEPLOY_URL }}", "standard": "wcag21aa"}')
    
    SCORE=$(echo $RESULT | jq -r '.score')
    echo "Compliance score: $SCORE"
    
    if [ "$SCORE" -lt 80 ]; then
      echo "❌ Score below threshold (80)"
      exit 1
    fi`}
              </pre>
            </div>
            <div className="mt-4 rounded-lg bg-neutral-50 dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 p-4">
              <p className="text-sm text-neutral-700 dark:text-neutral-300">
                <strong>Tip:</strong> Add <code className="text-xs bg-neutral-100 dark:bg-neutral-800 px-1 py-0.5 rounded">REGLAYER_TOKEN</code> as a repository secret in GitHub Settings → Secrets.
              </p>
            </div>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-neutral-900 dark:text-white mb-3">Webhooks</h2>
            <p className="text-sm text-neutral-600 dark:text-neutral-300 mb-3 leading-relaxed">
              Receive real-time HTTP POST notifications when events occur. Configure from <strong>Webhooks</strong> in the sidebar.
            </p>
            <p className="text-sm text-neutral-600 dark:text-neutral-300 mb-3 font-medium">Webhook payload example:</p>
            <div className="rounded-lg bg-neutral-50 dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 p-4">
              <pre className="text-xs font-mono text-neutral-700 dark:text-neutral-300 overflow-x-auto">
{`{
  "event": "scan.completed",
  "timestamp": "2026-05-26T10:30:00Z",
  "data": {
    "scanId": "scan_abc123",
    "url": "https://example.com",
    "score": 87,
    "violations": 12,
    "critical": 0,
    "serious": 3,
    "moderate": 5,
    "minor": 4
  }
}`}
              </pre>
            </div>
            <p className="text-sm text-neutral-600 dark:text-neutral-300 mt-3">
              Webhooks include an <code className="text-xs bg-neutral-100 dark:bg-neutral-800 px-1 py-0.5 rounded">X-RegLayer-Signature</code> header for payload verification (HMAC-SHA256).
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-neutral-900 dark:text-white mb-3">Rate Limits & Authentication</h2>
            <div className="text-sm text-neutral-600 dark:text-neutral-300 space-y-3 leading-relaxed">
              <p>
                All API requests require a Bearer token. Tokens are scoped to a workspace and inherit the permissions of the user who created them.
              </p>
              <div className="rounded-lg border border-neutral-200 dark:border-neutral-800 overflow-hidden">
                <table className="w-full text-sm">
                  <thead className="bg-neutral-50 dark:bg-neutral-900 border-b border-neutral-200 dark:border-neutral-800">
                    <tr>
                      <th className="text-left px-4 py-2 font-medium text-neutral-900 dark:text-white">Plan</th>
                      <th className="text-left px-4 py-2 font-medium text-neutral-900 dark:text-white">Rate Limit</th>
                      <th className="text-left px-4 py-2 font-medium text-neutral-900 dark:text-white">Daily Scans</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-neutral-200 dark:divide-neutral-800">
                    <tr>
                      <td className="px-4 py-2">Free</td>
                      <td className="px-4 py-2">60 req/min</td>
                      <td className="px-4 py-2">10</td>
                    </tr>
                    <tr>
                      <td className="px-4 py-2">Pro</td>
                      <td className="px-4 py-2">300 req/min</td>
                      <td className="px-4 py-2">100</td>
                    </tr>
                    <tr>
                      <td className="px-4 py-2">Enterprise</td>
                      <td className="px-4 py-2">Custom</td>
                      <td className="px-4 py-2">Custom</td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-neutral-900 dark:text-white mb-3">Next Steps</h2>
            <div className="grid gap-3 sm:grid-cols-2">
              <Link href="/api-reference" className="rounded-lg border border-neutral-200 dark:border-neutral-800 p-4 hover:border-neutral-400 transition-colors">
                <p className="font-medium text-sm text-neutral-900 dark:text-white">API Reference →</p>
                <p className="text-xs text-neutral-500 mt-1">Full endpoint documentation</p>
              </Link>
              <Link href="/docs/getting-started" className="rounded-lg border border-neutral-200 dark:border-neutral-800 p-4 hover:border-neutral-400 transition-colors">
                <p className="font-medium text-sm text-neutral-900 dark:text-white">Getting Started →</p>
                <p className="text-xs text-neutral-500 mt-1">Back to the basics</p>
              </Link>
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}
