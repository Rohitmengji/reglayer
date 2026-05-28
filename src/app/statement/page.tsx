"use client";

/**
 * RegLayer — Accessibility Statement Generator
 *
 * WHY: EU law (EN 301 549 Annex C) requires websites to publish an accessibility statement.
 * WHAT: Form to generate a compliant accessibility statement with auto-filled scan data.
 * HOW: Fetches latest scan results, pre-fills statement template. POSTs to /api/statement/generate for final text.
 */

import { useState } from "react";
import { AppShell } from "@/components/layout/app-shell";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { FileText, Download, Copy, Check, Globe, Mail, Building2, ExternalLink } from "lucide-react";
import { useI18n } from "@/components/i18n-provider";

interface StatementResult {
  html: string;
  markdown: string;
  metadata: {
    conformanceStatus: string;
    preparationDate: string;
    reviewDate: string;
    score: number | null;
    violationCount: number;
    standard: string;
    directive: string;
  };
}

export default function StatementPage() {
  const [form, setForm] = useState({
    organizationName: "",
    websiteUrl: "",
    websiteName: "",
    contactEmail: "",
    contactPhone: "",
    enforcementBody: "",
    nonAccessibleContent: "",
    disproportionateBurden: "",
  });
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<StatementResult | null>(null);
  const [copied, setCopied] = useState<"html" | "markdown" | null>(null);
  const { t } = useI18n();

  async function handleGenerate(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    try {
      const res = await fetch("/api/statement/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...form,
          nonAccessibleContent: form.nonAccessibleContent
            .split("\n")
            .filter(Boolean),
          disproportionateBurden: form.disproportionateBurden
            .split("\n")
            .filter(Boolean),
        }),
      });
      const data = await res.json();
      if (res.ok) setResult(data);
    } finally {
      setLoading(false);
    }
  }

  function handleCopy(type: "html" | "markdown") {
    const text = type === "html" ? result?.html : result?.markdown;
    if (text) {
      navigator.clipboard.writeText(text);
      setCopied(type);
      setTimeout(() => setCopied(null), 2000);
    }
  }

  function handleDownloadHTML() {
    if (!result) return;
    const blob = new Blob([result.html], { type: "text/html" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "accessibility-statement.html";
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <AppShell>
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-neutral-900 dark:text-white">
            {t("statement.title")}
          </h1>
          <p className="mt-1 text-sm text-neutral-500 dark:text-neutral-400">
            {t("statement.subtitle")}
          </p>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Form */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <Building2 className="h-4 w-4" />
                Organization Details
              </CardTitle>
            </CardHeader>
            <CardContent>
              <form onSubmit={handleGenerate} className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-neutral-700 dark:text-neutral-300 mb-1">
                    Organization Name *
                  </label>
                  <input
                    type="text"
                    required
                    value={form.organizationName}
                    onChange={(e) => setForm({ ...form, organizationName: e.target.value })}
                    className="w-full rounded-lg border border-neutral-200 px-3 py-2 text-sm dark:border-neutral-700 dark:bg-neutral-800 dark:text-neutral-100"
                    placeholder="Acme Corporation"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-neutral-700 dark:text-neutral-300 mb-1">
                    <Globe className="inline h-3.5 w-3.5 mr-1" />
                    Website URL *
                  </label>
                  <input
                    type="url"
                    required
                    value={form.websiteUrl}
                    onChange={(e) => setForm({ ...form, websiteUrl: e.target.value })}
                    className="w-full rounded-lg border border-neutral-200 px-3 py-2 text-sm dark:border-neutral-700 dark:bg-neutral-800 dark:text-neutral-100"
                    placeholder="https://example.com"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-neutral-700 dark:text-neutral-300 mb-1">
                    Website Name *
                  </label>
                  <input
                    type="text"
                    required
                    value={form.websiteName}
                    onChange={(e) => setForm({ ...form, websiteName: e.target.value })}
                    className="w-full rounded-lg border border-neutral-200 px-3 py-2 text-sm dark:border-neutral-700 dark:bg-neutral-800 dark:text-neutral-100"
                    placeholder="Acme Web Platform"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-neutral-700 dark:text-neutral-300 mb-1">
                    <Mail className="inline h-3.5 w-3.5 mr-1" />
                    Contact Email *
                  </label>
                  <input
                    type="email"
                    required
                    value={form.contactEmail}
                    onChange={(e) => setForm({ ...form, contactEmail: e.target.value })}
                    className="w-full rounded-lg border border-neutral-200 px-3 py-2 text-sm dark:border-neutral-700 dark:bg-neutral-800 dark:text-neutral-100"
                    placeholder="accessibility@example.com"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-neutral-700 dark:text-neutral-300 mb-1">
                    Contact Phone
                  </label>
                  <input
                    type="tel"
                    value={form.contactPhone}
                    onChange={(e) => setForm({ ...form, contactPhone: e.target.value })}
                    className="w-full rounded-lg border border-neutral-200 px-3 py-2 text-sm dark:border-neutral-700 dark:bg-neutral-800 dark:text-neutral-100"
                    placeholder="+49 30 1234567"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-neutral-700 dark:text-neutral-300 mb-1">
                    Enforcement Body
                  </label>
                  <input
                    type="text"
                    value={form.enforcementBody}
                    onChange={(e) => setForm({ ...form, enforcementBody: e.target.value })}
                    className="w-full rounded-lg border border-neutral-200 px-3 py-2 text-sm dark:border-neutral-700 dark:bg-neutral-800 dark:text-neutral-100"
                    placeholder="e.g., Federal Monitoring Body for Accessibility (Germany)"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-neutral-700 dark:text-neutral-300 mb-1">
                    Non-accessible Content
                  </label>
                  <textarea
                    rows={3}
                    value={form.nonAccessibleContent}
                    onChange={(e) => setForm({ ...form, nonAccessibleContent: e.target.value })}
                    className="w-full rounded-lg border border-neutral-200 px-3 py-2 text-sm dark:border-neutral-700 dark:bg-neutral-800 dark:text-neutral-100"
                    placeholder="One item per line. E.g.&#10;Legacy PDF documents lack alt text&#10;Third-party video player missing captions"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-neutral-700 dark:text-neutral-300 mb-1">
                    Disproportionate Burden
                  </label>
                  <textarea
                    rows={2}
                    value={form.disproportionateBurden}
                    onChange={(e) => setForm({ ...form, disproportionateBurden: e.target.value })}
                    className="w-full rounded-lg border border-neutral-200 px-3 py-2 text-sm dark:border-neutral-700 dark:bg-neutral-800 dark:text-neutral-100"
                    placeholder="One item per line (if applicable)"
                  />
                </div>

                <button
                  type="submit"
                  disabled={loading}
                  className="w-full rounded-lg bg-neutral-900 px-4 py-2.5 text-sm font-medium text-white hover:bg-neutral-800 disabled:opacity-50 dark:bg-white dark:text-neutral-900 dark:hover:bg-neutral-100 transition-colors"
                >
                  {loading ? "Generating..." : "Generate Accessibility Statement"}
                </button>
              </form>
            </CardContent>
          </Card>

          {/* Result / Info */}
          {result ? (
            <div className="space-y-4">
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center justify-between text-base">
                    <span className="flex items-center gap-2">
                      <FileText className="h-4 w-4" />
                      Generated Statement
                    </span>
                    <Badge variant={
                      result.metadata.conformanceStatus === "fully" ? "success" :
                      result.metadata.conformanceStatus === "partially" ? "moderate" : "destructive"
                    }>
                      {result.metadata.conformanceStatus} conformant
                    </Badge>
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="grid grid-cols-2 gap-3 text-sm">
                    <div className="rounded-lg bg-neutral-50 p-3 dark:bg-neutral-800">
                      <p className="text-neutral-500 dark:text-neutral-400">Standard</p>
                      <p className="font-medium text-neutral-900 dark:text-white">{result.metadata.standard}</p>
                    </div>
                    <div className="rounded-lg bg-neutral-50 p-3 dark:bg-neutral-800">
                      <p className="text-neutral-500 dark:text-neutral-400">Score</p>
                      <p className="font-medium text-neutral-900 dark:text-white">
                        {result.metadata.score !== null ? `${result.metadata.score}%` : "N/A"}
                      </p>
                    </div>
                    <div className="rounded-lg bg-neutral-50 p-3 dark:bg-neutral-800">
                      <p className="text-neutral-500 dark:text-neutral-400">Issues</p>
                      <p className="font-medium text-neutral-900 dark:text-white">{result.metadata.violationCount}</p>
                    </div>
                    <div className="rounded-lg bg-neutral-50 p-3 dark:bg-neutral-800">
                      <p className="text-neutral-500 dark:text-neutral-400">Reviewed</p>
                      <p className="font-medium text-neutral-900 dark:text-white">{result.metadata.reviewDate}</p>
                    </div>
                  </div>

                  <div className="flex gap-2">
                    <button
                      onClick={handleDownloadHTML}
                      className="flex items-center gap-1.5 rounded-lg border border-neutral-200 px-3 py-2 text-sm font-medium hover:bg-neutral-50 dark:border-neutral-700 dark:hover:bg-neutral-800 transition-colors"
                    >
                      <Download className="h-3.5 w-3.5" />
                      Download HTML
                    </button>
                    <button
                      onClick={() => handleCopy("html")}
                      className="flex items-center gap-1.5 rounded-lg border border-neutral-200 px-3 py-2 text-sm font-medium hover:bg-neutral-50 dark:border-neutral-700 dark:hover:bg-neutral-800 transition-colors"
                    >
                      {copied === "html" ? <Check className="h-3.5 w-3.5 text-green-600" /> : <Copy className="h-3.5 w-3.5" />}
                      Copy HTML
                    </button>
                    <button
                      onClick={() => handleCopy("markdown")}
                      className="flex items-center gap-1.5 rounded-lg border border-neutral-200 px-3 py-2 text-sm font-medium hover:bg-neutral-50 dark:border-neutral-700 dark:hover:bg-neutral-800 transition-colors"
                    >
                      {copied === "markdown" ? <Check className="h-3.5 w-3.5 text-green-600" /> : <Copy className="h-3.5 w-3.5" />}
                      Copy Markdown
                    </button>
                  </div>

                  {/* Preview */}
                  <div className="rounded-lg border border-neutral-200 dark:border-neutral-700 overflow-hidden">
                    <div className="bg-neutral-50 dark:bg-neutral-800 px-3 py-2 border-b border-neutral-200 dark:border-neutral-700 flex items-center justify-between">
                      <span className="text-xs font-medium text-neutral-500">Preview</span>
                      <button
                        onClick={() => {
                          const blob = new Blob([result.html], { type: "text/html" });
                          const url = URL.createObjectURL(blob);
                          window.open(url, "_blank");
                        }}
                        className="text-xs text-blue-600 flex items-center gap-1"
                      >
                        Open in new tab <ExternalLink className="h-3 w-3" />
                      </button>
                    </div>
                    <iframe
                      srcDoc={result.html}
                      className="w-full h-96 bg-white"
                      title="Accessibility Statement Preview"
                    />
                  </div>
                </CardContent>
              </Card>
            </div>
          ) : (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-base">
                  <FileText className="h-4 w-4" />
                  About This Tool
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4 text-sm text-neutral-600 dark:text-neutral-300">
                <p>
                  Accessibility laws worldwide require organizations to publish an accessibility 
                  statement declaring their conformance status and providing contact information.
                </p>
                <div className="rounded-lg bg-blue-50 dark:bg-blue-950/30 border border-blue-100 dark:border-blue-900 p-4">
                  <p className="font-medium text-blue-900 dark:text-blue-200 mb-2">Supported Standards</p>
                  <ul className="list-disc list-inside space-y-1 text-blue-800 dark:text-blue-300 text-xs">
                    <li>WCAG 2.2 Level AA (W3C global standard)</li>
                    <li>ADA Title III (United States)</li>
                    <li>Section 508 (US Federal)</li>
                    <li>EAA / EN 301 549 (European Union)</li>
                    <li>AODA (Canada — Ontario)</li>
                  </ul>
                </div>
                <div className="space-y-2">
                  <p className="font-medium text-neutral-900 dark:text-white">Your statement will include:</p>
                  <ul className="list-disc list-inside space-y-1 text-xs">
                    <li>Conformance status based on latest scan results</li>
                    <li>Non-accessible content declarations</li>
                    <li>Feedback mechanism and contact details</li>
                    <li>Enforcement procedure information</li>
                    <li>Technical compliance details (EN 301 549 mapping)</li>
                    <li>Preparation and review dates</li>
                  </ul>
                </div>
                <div className="rounded-lg bg-amber-50 dark:bg-amber-950/30 border border-amber-100 dark:border-amber-900 p-4">
                  <p className="text-xs text-amber-800 dark:text-amber-300">
                    <strong>Tip:</strong> Run a scan on your website first. The generator will 
                    automatically pull your latest compliance score and violation data.
                  </p>
                </div>
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </AppShell>
  );
}
