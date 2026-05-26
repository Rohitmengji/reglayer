import { Shield, Code2, Lock, Zap } from "lucide-react";
import Link from "next/link";

export const metadata = {
  title: "API Reference — RegLayer",
  description: "RegLayer REST API documentation. Integrate accessibility scanning into your CI/CD pipeline.",
};

const endpoints = [
  {
    method: "POST",
    path: "/api/scans",
    description: "Start a new accessibility scan",
    body: '{ "url": "https://example.com", "standard": "wcag21aa" }',
    response: '{ "id": "scan_abc123", "status": "running", "url": "https://example.com" }',
  },
  {
    method: "GET",
    path: "/api/scans/:id",
    description: "Get scan results by ID",
    body: null,
    response: '{ "id": "scan_abc123", "status": "completed", "score": 87, "violations": [...] }',
  },
  {
    method: "GET",
    path: "/api/scans",
    description: "List all scans for the workspace",
    body: null,
    response: '{ "scans": [...], "total": 42, "page": 1, "limit": 20 }',
  },
  {
    method: "GET",
    path: "/api/scans/compare",
    description: "Compare two scans (base vs head)",
    body: null,
    response: '{ "comparison": { "fixed": [...], "introduced": [...], "persistent": [...] } }',
  },
  {
    method: "POST",
    path: "/api/crawl",
    description: "Start a multi-page site crawl",
    body: '{ "url": "https://example.com", "maxPages": 50, "standard": "en301549" }',
    response: '{ "id": "crawl_xyz789", "status": "running", "pagesQueued": 50 }',
  },
  {
    method: "GET",
    path: "/api/reports/:id/pdf",
    description: "Download scan report as PDF",
    body: null,
    response: "Binary PDF file (application/pdf)",
  },
  {
    method: "POST",
    path: "/api/webhooks",
    description: "Create a webhook subscription",
    body: '{ "url": "https://your-server.com/hook", "events": ["scan.completed", "regression.detected"] }',
    response: '{ "id": "wh_001", "url": "...", "events": [...], "active": true }',
  },
  {
    method: "GET",
    path: "/api/health",
    description: "Health check endpoint (public)",
    body: null,
    response: '{ "status": "ok", "version": "1.0.0" }',
  },
];

const methodColors: Record<string, string> = {
  GET: "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400",
  POST: "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400",
  PUT: "bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400",
  DELETE: "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400",
};

export default function ApiReferencePage() {
  return (
    <div className="min-h-screen bg-white dark:bg-neutral-950">
      <div className="mx-auto max-w-5xl px-6 py-12">
        <div className="flex items-center gap-2 mb-12">
          <Link href="/" className="flex items-center gap-2 text-neutral-900 dark:text-white">
            <Shield className="h-5 w-5" />
            <span className="font-bold">RegLayer</span>
          </Link>
        </div>

        <div className="flex items-center gap-3 mb-4">
          <Code2 className="h-8 w-8 text-neutral-700 dark:text-neutral-300" />
          <h1 className="text-3xl font-bold text-neutral-900 dark:text-white">API Reference</h1>
        </div>
        <p className="text-neutral-500 dark:text-neutral-400 mb-8">
          Integrate RegLayer scanning into your CI/CD pipeline, custom dashboards, or internal tools.
        </p>

        {/* Auth section */}
        <div className="rounded-xl border border-neutral-200 dark:border-neutral-800 p-6 mb-8">
          <div className="flex items-center gap-2 mb-3">
            <Lock className="h-4 w-4 text-neutral-700 dark:text-neutral-300" />
            <h2 className="text-lg font-semibold text-neutral-900 dark:text-white">Authentication</h2>
          </div>
          <p className="text-sm text-neutral-600 dark:text-neutral-300 mb-3">
            All API requests (except <code className="text-xs bg-neutral-100 dark:bg-neutral-800 px-1.5 py-0.5 rounded">/api/health</code>) require a Bearer token in the Authorization header:
          </p>
          <pre className="bg-neutral-50 dark:bg-neutral-900 rounded-lg p-4 text-xs font-mono text-neutral-700 dark:text-neutral-300 overflow-x-auto">
{`Authorization: Bearer your_api_token_here`}
          </pre>
          <p className="text-xs text-neutral-500 mt-3">
            Generate API tokens from Settings → API Keys in your workspace dashboard.
          </p>
        </div>

        {/* Rate limits */}
        <div className="rounded-xl border border-neutral-200 dark:border-neutral-800 p-6 mb-8">
          <div className="flex items-center gap-2 mb-3">
            <Zap className="h-4 w-4 text-neutral-700 dark:text-neutral-300" />
            <h2 className="text-lg font-semibold text-neutral-900 dark:text-white">Rate Limits</h2>
          </div>
          <div className="text-sm text-neutral-600 dark:text-neutral-300 space-y-1">
            <p><strong>Free plan:</strong> 60 requests/minute, 10 scans/day</p>
            <p><strong>Pro plan:</strong> 300 requests/minute, 100 scans/day</p>
            <p><strong>Enterprise:</strong> Custom limits</p>
          </div>
          <p className="text-xs text-neutral-500 mt-3">
            Rate limit headers (<code className="bg-neutral-100 dark:bg-neutral-800 px-1 py-0.5 rounded">X-RateLimit-Remaining</code>) are included in every response.
          </p>
        </div>

        {/* Endpoints */}
        <h2 className="text-xl font-semibold text-neutral-900 dark:text-white mb-4">Endpoints</h2>
        <div className="space-y-4">
          {endpoints.map((ep) => (
            <div
              key={`${ep.method}-${ep.path}`}
              className="rounded-xl border border-neutral-200 dark:border-neutral-800 overflow-hidden"
            >
              <div className="flex items-center gap-3 p-4 bg-neutral-50 dark:bg-neutral-900/50">
                <span className={`text-xs font-bold px-2 py-1 rounded ${methodColors[ep.method]}`}>
                  {ep.method}
                </span>
                <code className="text-sm font-mono text-neutral-800 dark:text-neutral-200">{ep.path}</code>
                <span className="text-sm text-neutral-500 dark:text-neutral-400 ml-auto hidden sm:block">
                  {ep.description}
                </span>
              </div>
              <div className="p-4 space-y-3">
                <p className="text-sm text-neutral-600 dark:text-neutral-300 sm:hidden">{ep.description}</p>
                {ep.body && (
                  <div>
                    <p className="text-xs font-medium text-neutral-500 mb-1">Request Body</p>
                    <pre className="bg-neutral-50 dark:bg-neutral-900 rounded p-3 text-xs font-mono text-neutral-700 dark:text-neutral-300 overflow-x-auto">
                      {ep.body}
                    </pre>
                  </div>
                )}
                <div>
                  <p className="text-xs font-medium text-neutral-500 mb-1">Response</p>
                  <pre className="bg-neutral-50 dark:bg-neutral-900 rounded p-3 text-xs font-mono text-neutral-700 dark:text-neutral-300 overflow-x-auto">
                    {ep.response}
                  </pre>
                </div>
              </div>
            </div>
          ))}
        </div>

        <div className="mt-12 text-center text-sm text-neutral-500">
          <p>
            Need help integrating? <Link href="/contact" className="text-blue-600 hover:underline">Contact our team</Link> or check the{" "}
            <Link href="/docs" className="text-blue-600 hover:underline">Documentation</Link>.
          </p>
        </div>
      </div>
    </div>
  );
}
