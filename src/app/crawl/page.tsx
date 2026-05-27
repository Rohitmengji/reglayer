"use client";

import { useState } from "react";
import { AppShell } from "@/components/layout/app-shell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Globe,
  Loader2,
  AlertTriangle,
  TrendingDown,
  ExternalLink,
} from "lucide-react";
import Link from "next/link";
import { useI18n } from "@/components/i18n-provider";

interface CrawlPageResult {
  url: string;
  scanId: string;
  score: number;
  violations: number;
  critical: number;
  serious: number;
  depth: number;
}

interface CrawlResult {
  id: string;
  startUrl: string;
  pagesScanned: number;
  pagesDiscovered: number;
  averageScore: number;
  lowestScore: { url: string; score: number };
  highestScore: { url: string; score: number };
  totalViolations: number;
  criticalPages: Array<{ url: string; score: number; critical: number }>;
  duration: number;
  pages: CrawlPageResult[];
}

export default function CrawlPage() {
  const [url, setUrl] = useState("");
  const [maxPages, setMaxPages] = useState("10");
  const [maxDepth, setMaxDepth] = useState("3");
  const [crawling, setCrawling] = useState(false);
  const [result, setResult] = useState<CrawlResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const { t } = useI18n();

  async function handleCrawl(e: React.FormEvent) {
    e.preventDefault();
    setCrawling(true);
    setError(null);
    setResult(null);

    try {
      const res = await fetch("/api/crawl", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          url,
          maxPages: Number(maxPages),
          maxDepth: Number(maxDepth),
          concurrency: 2,
        }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Crawl failed");
      }

      const data = await res.json();
      setResult(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Crawl failed");
    } finally {
      setCrawling(false);
    }
  }

  return (
    <AppShell>
      <div className="space-y-8">
        {/* Header */}
        <div>
          <h1 className="text-2xl font-bold text-neutral-900 dark:text-white">{t("crawl.title")}</h1>
          <p className="mt-1 text-sm text-neutral-500 dark:text-neutral-400">
            {t("crawl.subtitle")}
          </p>
        </div>

        {/* Crawl Form */}
        <Card>
          <CardContent className="p-6">
            <form onSubmit={handleCrawl} className="space-y-4">
              <div>
                <label className="text-sm font-medium text-neutral-700 dark:text-neutral-200">{t("crawl.startUrl")}</label>
                <Input
                  type="url"
                  placeholder={t("crawl.startUrlPlaceholder")}
                  value={url}
                  onChange={(e) => setUrl(e.target.value)}
                  required
                  disabled={crawling}
                  className="mt-1"
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-sm font-medium text-neutral-700 dark:text-neutral-200">{t("crawl.maxPages")}</label>
                  <Input
                    type="number"
                    min="1"
                    max="50"
                    value={maxPages}
                    onChange={(e) => setMaxPages(e.target.value)}
                    disabled={crawling}
                    className="mt-1"
                  />
                </div>
                <div>
                  <label className="text-sm font-medium text-neutral-700 dark:text-neutral-200">{t("crawl.maxDepth")}</label>
                  <Input
                    type="number"
                    min="1"
                    max="5"
                    value={maxDepth}
                    onChange={(e) => setMaxDepth(e.target.value)}
                    disabled={crawling}
                    className="mt-1"
                  />
                </div>
              </div>
              <Button type="submit" disabled={crawling} className="w-full">
                {crawling ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    {t("crawl.crawling")}
                  </>
                ) : (
                  <>
                    <Globe className="mr-2 h-4 w-4" />
                    {t("crawl.startCrawl")}
                  </>
                )}
              </Button>
              {crawling && (
                <p className="text-xs text-neutral-400 text-center">
                  {t("crawl.durationNote")}
                </p>
              )}
            </form>
          </CardContent>
        </Card>

        {/* Error */}
        {error && (
          <div className="rounded-xl border border-red-200 dark:border-red-800 bg-red-50 dark:bg-red-950 p-4 text-sm text-red-700">
            <AlertTriangle className="h-4 w-4 inline mr-2" />
            {error}
          </div>
        )}

        {/* Results */}
        {result && (
          <div className="space-y-6">
            {/* Summary */}
            <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
              <SummaryCard label="Pages Scanned" value={result.pagesScanned.toString()} />
              <SummaryCard label="Avg Score" value={result.averageScore.toString()} highlight />
              <SummaryCard label="Total Violations" value={result.totalViolations.toString()} />
              <SummaryCard label="Lowest Score" value={result.lowestScore.score.toString()} bad />
              <SummaryCard label="Duration" value={`${Math.round(result.duration / 1000)}s`} />
            </div>

            {/* Critical Pages Alert */}
            {result.criticalPages.length > 0 && (
              <div className="rounded-xl border border-red-200 dark:border-red-800 bg-red-50 dark:bg-red-950 p-5">
                <h3 className="text-sm font-semibold text-red-800 flex items-center gap-2 mb-3">
                  <AlertTriangle className="h-4 w-4" />
                  Pages with Critical Violations ({result.criticalPages.length})
                </h3>
                <div className="space-y-2">
                  {result.criticalPages.map((p) => (
                    <div key={p.url} className="flex items-center justify-between text-sm">
                      <span className="truncate text-red-700">{p.url}</span>
                      <div className="flex items-center gap-2">
                        <Badge variant="critical">{p.critical} critical</Badge>
                        <span className="text-red-600 font-bold">{p.score}</span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Page Results Table */}
            <Card>
              <CardHeader>
                <CardTitle className="text-sm">All Pages ({result.pages.length})</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-2">
                  {result.pages.map((page) => (
                    <div
                      key={page.url}
                      className="flex items-center gap-4 rounded-lg p-3 hover:bg-neutral-50 dark:hover:bg-neutral-800 transition-colors"
                    >
                      {/* Score */}
                      <span
                        className={`text-lg font-bold w-10 text-center ${
                          page.score >= 90
                            ? "text-green-600"
                            : page.score >= 70
                            ? "text-yellow-600"
                            : page.score >= 50
                            ? "text-orange-600"
                            : "text-red-600"
                        }`}
                      >
                        {page.score > 0 ? Math.round(page.score) : "—"}
                      </span>

                      {/* URL */}
                      <div className="flex-1 min-w-0">
                        <p className="text-sm text-neutral-900 dark:text-white truncate">{page.url}</p>
                        <p className="text-xs text-neutral-400">Depth {page.depth}</p>
                      </div>

                      {/* Violations */}
                      <div className="flex items-center gap-1.5">
                        {page.critical > 0 && <Badge variant="critical">{page.critical}</Badge>}
                        {page.serious > 0 && <Badge variant="serious">{page.serious}</Badge>}
                        {page.violations === 0 && <Badge variant="success">Clean</Badge>}
                      </div>

                      {/* Link */}
                      {page.scanId && (
                        <Link
                          href={`/report/${page.scanId}`}
                          className="text-neutral-400 hover:text-neutral-600 dark:text-neutral-300 dark:hover:text-white"
                        >
                          <ExternalLink className="h-4 w-4" />
                        </Link>
                      )}
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>

            {/* Weakest Page Highlight */}
            <div className="rounded-xl border border-orange-200 dark:border-orange-800 bg-orange-50 dark:bg-orange-950 p-5">
              <div className="flex items-center gap-2 mb-2">
                <TrendingDown className="h-5 w-5 text-orange-600" />
                <h3 className="text-sm font-semibold text-orange-800">Weakest Page</h3>
              </div>
              <p className="text-sm text-orange-700">{result.lowestScore.url}</p>
              <p className="text-2xl font-bold text-orange-600 mt-1">
                Score: {result.lowestScore.score}
              </p>
            </div>
          </div>
        )}
      </div>
    </AppShell>
  );
}

function SummaryCard({
  label,
  value,
  highlight,
  bad,
}: {
  label: string;
  value: string;
  highlight?: boolean;
  bad?: boolean;
}) {
  return (
    <div className="rounded-xl border border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-900 p-4 text-center">
      <p className={`text-2xl font-bold ${highlight ? "text-blue-600" : bad ? "text-red-600" : "text-neutral-900 dark:text-white"}`}>
        {value}
      </p>
      <p className="text-xs text-neutral-500 dark:text-neutral-400 mt-1">{label}</p>
    </div>
  );
}
