"use client";

/**
 * RegLayer — Remediation Workspace
 *
 * WHY: Teams want to actually FIX accessibility issues, not just see them. This
 *      surfaces the full power of the remediation engine: choose which fixes to
 *      apply, run them against a live URL, and see exactly what changed —
 *      before→after, mapped to the WCAG criterion each fix satisfies — then
 *      deploy the drop-in script or download the corrected HTML.
 * WHAT: Two real, engine-backed paths — a client-side drop-in script, and
 *       server-side remediation with a per-category config + rich diff results.
 * HOW: POST /api/remediate (config honored by the engine; returns FixRecords with
 *      before/after/selector/wcagCriteria + a category breakdown). Download uses
 *      returnFormat:"html". Everything shown maps to a real applied transform —
 *      no cosmetic claims; meaningful-content fixes are explicitly flagged as
 *      needing human review.
 */

import { useState, useEffect } from "react";
import { toast } from "sonner";
import { AppShell } from "@/components/layout/app-shell";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ModernSelect } from "@/components/ui/modern-select";
import {
  Wand2, Code, Globe, Copy, Check, Download, Loader2, AlertTriangle,
  Languages, SkipForward, LayoutTemplate, Image as ImageIcon, FormInput,
  MousePointerClick, ArrowDownUp, Contrast, ShieldCheck, Info, Stethoscope, UserCog,
} from "lucide-react";
import { useI18n } from "@/components/i18n-provider";
import type { TranslationKey } from "@/lib/i18n/translations";
import { analyzeFixability, type FixabilitySummary } from "@/lib/remediation/fixability";

// ── Engine fix-category catalog ─────────────────────────────────────────────
// Each entry maps a RemediationConfig flag (sent to /api/remediate) to the fix
// `category` the engine emits, plus the WCAG criterion it satisfies. `risky`
// fixes alter visual design and are off by default.
interface FixCatalogEntry {
  configKey: string;       // RemediationConfig flag
  category: string;        // FixRecord.category emitted by the engine
  labelKey: TranslationKey;
  wcag: string;
  descKey: TranslationKey;
  Icon: typeof Wand2;
  risky?: boolean;
  /** Engine can apply the markup, but the VALUE still needs human review. */
  needsReview?: boolean;
}

const FIX_CATALOG: FixCatalogEntry[] = [
  { configKey: "enableLangAttr", category: "lang-attribute", labelKey: "remediation.catLangLabel", wcag: "WCAG 3.1.1", descKey: "remediation.catLangDesc", Icon: Languages },
  { configKey: "enableSkipLinks", category: "skip-links", labelKey: "remediation.catSkipLabel", wcag: "WCAG 2.4.1", descKey: "remediation.catSkipDesc", Icon: SkipForward },
  { configKey: "enableLandmarks", category: "landmarks", labelKey: "remediation.catLandmarksLabel", wcag: "WCAG 1.3.1", descKey: "remediation.catLandmarksDesc", Icon: LayoutTemplate },
  { configKey: "enableAltText", category: "alt-text", labelKey: "remediation.catAltLabel", wcag: "WCAG 1.1.1", descKey: "remediation.catAltDesc", Icon: ImageIcon, needsReview: true },
  { configKey: "enableFormLabels", category: "form-labels", labelKey: "remediation.catFormLabel", wcag: "WCAG 1.3.1 / 3.3.2", descKey: "remediation.catFormDesc", Icon: FormInput, needsReview: true },
  { configKey: "enableButtonLabels", category: "button-labels", labelKey: "remediation.catButtonLabel", wcag: "WCAG 4.1.2", descKey: "remediation.catButtonDesc", Icon: MousePointerClick, needsReview: true },
  { configKey: "enableFocusOrder", category: "focus-order", labelKey: "remediation.catFocusLabel", wcag: "WCAG 2.4.3", descKey: "remediation.catFocusDesc", Icon: ArrowDownUp },
  { configKey: "enableContrastFixes", category: "contrast", labelKey: "remediation.catContrastLabel", wcag: "WCAG 1.4.3", descKey: "remediation.catContrastDesc", Icon: Contrast, risky: true },
];

type RemediationConfigState = Record<string, boolean>;

const DEFAULT_CONFIG: RemediationConfigState = Object.fromEntries(
  FIX_CATALOG.map((f) => [f.configKey, !f.risky]) // all on except risky (contrast)
);

interface FixRecord {
  category: string;
  element: string;
  selector: string;
  before: string;
  after: string;
  wcagCriteria: string;
  description: string;
}
interface RemediationResult {
  url: string;
  totalFixes: number;
  categories: Record<string, number>;
  fixes: FixRecord[];
  timestamp: string;
}
interface ScanOption {
  id: string;
  url: string;
  totalViolations: number;
  createdAt: string;
}

const catalogFor = (category: string) => FIX_CATALOG.find((f) => f.category === category);
function truncate(s: string, n = 240): string {
  const t = (s ?? "").trim();
  return t.length > n ? `${t.slice(0, n)}…` : t;
}
function hostOf(url: string): string {
  try {
    return new URL(url).hostname;
  } catch {
    return "page";
  }
}

export default function RemediationPage() {
  const { t } = useI18n();
  const [loading, setLoading] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [url, setUrl] = useState("https://");
  const [config, setConfig] = useState<RemediationConfigState>(DEFAULT_CONFIG);
  const [result, setResult] = useState<RemediationResult | null>(null);
  const [copied, setCopied] = useState(false);
  const [scriptSnippet, setScriptSnippet] = useState("");

  // "Fixability from a scan" — pick a past scan, see how much is auto-fixable.
  const [scans, setScans] = useState<ScanOption[]>([]);
  const [selectedScanId, setSelectedScanId] = useState("");
  const [analyzing, setAnalyzing] = useState(false);
  const [fixability, setFixability] = useState<FixabilitySummary | null>(null);

  const enabledCount = Object.values(config).filter(Boolean).length;
  const isValidUrl = (s: string) => /^https?:\/\/.+\..+/.test(s.trim());
  const canRun = !loading && isValidUrl(url) && enabledCount > 0;

  // Load the user's recent completed scans for the fixability picker.
  useEffect(() => {
    let active = true;
    fetch("/api/scans?limit=25")
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (!active || !Array.isArray(data?.scans)) return;
        setScans(
          (data.scans as Array<Record<string, unknown>>)
            .filter((s) => (s.status ?? "COMPLETED") === "COMPLETED")
            .map((s) => ({ id: String(s.id), url: String(s.url ?? ""), totalViolations: Number(s.totalViolations ?? 0), createdAt: String(s.createdAt ?? "") }))
        );
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, []);

  async function analyzeScan(scanId: string) {
    setSelectedScanId(scanId);
    setFixability(null);
    if (!scanId) return;
    setAnalyzing(true);
    try {
      const res = await fetch(`/api/scans/${scanId}`);
      if (!res.ok) {
        toast.error(t("remediation.toastCouldNotLoadScan"));
        return;
      }
      const data = await res.json();
      const violations = (data?.scan?.violations ?? []) as Array<{ id?: string; impact?: string }>;
      setFixability(analyzeFixability(violations));
      const scanUrl = data?.scan?.url;
      if (typeof scanUrl === "string" && scanUrl) setUrl(scanUrl);
    } catch {
      toast.error(t("remediation.toastCouldNotAnalyzeScan"));
    } finally {
      setAnalyzing(false);
    }
  }

  function toggle(key: string) {
    setConfig((prev) => ({ ...prev, [key]: !prev[key] }));
  }

  async function runRemediation(targetUrl?: string) {
    const target = (targetUrl ?? url).trim();
    if (loading || !isValidUrl(target) || enabledCount === 0) return;
    if (target !== url) setUrl(target);
    setLoading(true);
    setResult(null);
    try {
      const res = await fetch("/api/remediate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: target, config }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok) {
        setResult(data as RemediationResult);
      } else {
        toast.error(data.error || t("remediation.toastRemediationFailed"));
      }
    } catch {
      toast.error(t("remediation.toastCouldNotReachService"));
    } finally {
      setLoading(false);
    }
  }

  async function downloadFixedHtml() {
    setDownloading(true);
    try {
      const res = await fetch("/api/remediate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url, config, returnFormat: "html" }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        toast.error(err.error || t("remediation.toastCouldNotGenerateHtml"));
        return;
      }
      const html = await res.text();
      const blob = new Blob([html], { type: "text/html" });
      const href = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = href;
      a.download = `remediated-${hostOf(url)}.html`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(href);
      toast.success(t("remediation.toastDownloaded"));
    } catch {
      toast.error(t("remediation.toastDownloadFailed"));
    } finally {
      setDownloading(false);
    }
  }

  async function loadScript() {
    const res = await fetch("/api/remediate/script");
    if (res.ok) setScriptSnippet(await res.text());
  }

  function copyScript() {
    const tag = `<script src="${window.location.origin}/api/remediate/script"></script>`;
    navigator.clipboard.writeText(tag);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <AppShell>
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-neutral-900 dark:text-white">{t("remediation.title")}</h1>
          <p className="text-sm text-neutral-500 dark:text-neutral-400 mt-1">
            Apply real accessibility fixes — deploy a drop-in script, or remediate a live URL and see exactly what changed.
          </p>
        </div>

        {/* ── Fixability from a scan ─────────────────────────────────────── */}
        <Card>
          <CardContent className="pt-6">
            <div className="flex flex-wrap items-center gap-2 mb-1">
              <Stethoscope className="h-5 w-5 text-accent" />
              <h3 className="font-semibold text-neutral-900 dark:text-white">{t("remediation.fixabilityCardTitle")}</h3>
            </div>
            <p className="text-sm text-neutral-500 dark:text-neutral-400 mb-4">
              {t("remediation.fixabilityCardSubtitle")}
            </p>
            {scans.length === 0 ? (
              <p className="text-sm text-neutral-400 dark:text-neutral-500">
                {t("remediation.fixabilityNoScans")}
              </p>
            ) : (
              <ModernSelect
                value={selectedScanId}
                onChange={analyzeScan}
                placeholder={t("remediation.selectScanPlaceholder")}
                options={scans.map((s) => ({
                  value: s.id,
                  label: `${hostOf(s.url)} · ${s.totalViolations} ${s.totalViolations === 1 ? t("remediation.issueSingular") : t("remediation.issuePlural")}${s.createdAt ? ` · ${new Date(s.createdAt).toLocaleDateString()}` : ""}`,
                }))}
              />
            )}

            {analyzing && (
              <div className="mt-4 flex items-center gap-2 text-sm text-neutral-500 dark:text-neutral-400">
                <Loader2 className="h-4 w-4 animate-spin" /> {t("remediation.analyzingViolations")}
              </div>
            )}

            {fixability && !analyzing && (
              <FixabilityView
                fixability={fixability}
                onRemediate={() => runRemediation(url)}
                canRemediate={isValidUrl(url) && !loading}
              />
            )}
          </CardContent>
        </Card>

        {/* ── Server-side remediation ───────────────────────────────────── */}
        <Card>
          <CardContent className="pt-6">
            <div className="flex flex-wrap items-center gap-2 mb-1">
              <Globe className="h-5 w-5 text-accent" />
              <h3 className="font-semibold text-neutral-900 dark:text-white">{t("remediation.urlCardTitle")}</h3>
              <Badge variant="secondary">Pro</Badge>
            </div>
            <p className="text-sm text-neutral-500 dark:text-neutral-400 mb-4">
              {t("remediation.urlCardSubtitle")}
            </p>

            {/* Fix configuration */}
            <fieldset className="mb-4">
              <legend className="text-xs font-semibold uppercase tracking-wider text-neutral-500 dark:text-neutral-400 mb-2">
                {t("remediation.fixesToApplyLegend")} ({enabledCount}/{FIX_CATALOG.length})
              </legend>
              <div className="grid gap-2 sm:grid-cols-2">
                {FIX_CATALOG.map((f) => {
                  const on = !!config[f.configKey];
                  return (
                    <button
                      key={f.configKey}
                      type="button"
                      role="switch"
                      aria-checked={on}
                      onClick={() => toggle(f.configKey)}
                      className={`flex items-start gap-3 rounded-lg border p-3 text-left transition-colors ${
                        on
                          ? "border-accent/40 bg-accent/5"
                          : "border-neutral-200 dark:border-neutral-700 hover:border-neutral-300 dark:hover:border-neutral-600"
                      }`}
                    >
                      <f.Icon className={`mt-0.5 h-4 w-4 shrink-0 ${on ? "text-accent" : "text-neutral-400"}`} />
                      <span className="min-w-0 flex-1">
                        <span className="flex flex-wrap items-center gap-1.5">
                          <span className="text-sm font-medium text-neutral-900 dark:text-white">{t(f.labelKey)}</span>
                          <span className="rounded bg-neutral-100 dark:bg-neutral-800 px-1.5 py-0.5 text-[10px] font-medium text-neutral-500 dark:text-neutral-400">{f.wcag}</span>
                          {f.risky && (
                            <span className="flex items-center gap-0.5 rounded bg-amber-100 dark:bg-amber-900/30 px-1.5 py-0.5 text-[10px] font-medium text-amber-700 dark:text-amber-300">
                              <AlertTriangle className="h-2.5 w-2.5" /> {t("remediation.altersDesignBadge")}
                            </span>
                          )}
                        </span>
                        <span className="mt-0.5 block text-xs text-neutral-500 dark:text-neutral-400">{t(f.descKey)}</span>
                      </span>
                      {/* Switch track */}
                      <span
                        aria-hidden
                        className={`mt-0.5 flex h-5 w-9 shrink-0 items-center rounded-full p-0.5 transition-colors ${on ? "bg-accent" : "bg-neutral-300 dark:bg-neutral-600"}`}
                      >
                        <span className={`h-4 w-4 rounded-full bg-white shadow-sm transition-transform ${on ? "translate-x-4" : ""}`} />
                      </span>
                    </button>
                  );
                })}
              </div>
            </fieldset>

            <div className="flex flex-col sm:flex-row gap-3">
              <input
                type="url"
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && runRemediation()}
                placeholder="https://example.com"
                aria-label={t("remediation.urlInputAriaLabel")}
                className="flex-1 min-w-0 rounded-md border border-neutral-200 dark:border-neutral-700 px-3 py-2 text-sm bg-white dark:bg-neutral-900 text-neutral-900 dark:text-white outline-none focus:ring-2 focus:ring-accent/40 focus:border-accent"
              />
              <Button onClick={() => runRemediation()} disabled={!canRun} size="sm" className="w-full sm:w-auto shrink-0">
                {loading ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Wand2 className="h-4 w-4 mr-2" />}
                {loading ? t("remediation.fixingButton") : t("remediation.remediateButton")}
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* ── Results ───────────────────────────────────────────────────── */}
        {loading && (
          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center gap-3 text-sm text-neutral-500 dark:text-neutral-400">
                <Loader2 className="h-4 w-4 animate-spin" />
                {t("remediation.fetchingApplyingFixes", { host: hostOf(url) })}
              </div>
            </CardContent>
          </Card>
        )}

        {result && !loading && <ResultsView result={result} onDownload={downloadFixedHtml} downloading={downloading} />}

        {/* ── Drop-in script ────────────────────────────────────────────── */}
        <Card>
          <CardContent className="pt-6">
            <div className="flex flex-wrap items-center gap-2 mb-1">
              <Code className="h-5 w-5 text-accent" />
              <h3 className="font-semibold text-neutral-900 dark:text-white">{t("remediation.scriptCardTitle")}</h3>
              <Badge>{t("remediation.scriptBadge")}</Badge>
            </div>
            <p className="text-sm text-neutral-500 dark:text-neutral-400 mb-4">
              {t("remediation.scriptCardSubtitle")}
            </p>
            <div className="relative overflow-x-auto rounded-lg bg-neutral-900 dark:bg-neutral-800 p-4 font-mono text-sm">
              <code className="break-all text-neutral-100">{`<script src="${typeof window !== "undefined" ? window.location.origin : ""}/api/remediate/script"></script>`}</code>
              <Button size="sm" variant="ghost" className="absolute top-2 right-2 text-neutral-300 hover:text-white" onClick={copyScript} aria-label={t("remediation.copyScriptAriaLabel")}>
                {copied ? <Check className="h-4 w-4 text-green-400" /> : <Copy className="h-4 w-4" />}
              </Button>
            </div>

            {/* What it fixes, mapped to WCAG */}
            <div className="mt-4 grid gap-1.5 sm:grid-cols-2">
              {FIX_CATALOG.filter((f) => !f.risky).map((f) => (
                <div key={f.configKey} className="flex items-center gap-2 text-xs text-neutral-600 dark:text-neutral-300">
                  <f.Icon className="h-3.5 w-3.5 shrink-0 text-accent" />
                  <span className="min-w-0 truncate">{t(f.labelKey)}</span>
                  <span className="ml-auto shrink-0 rounded bg-neutral-100 dark:bg-neutral-800 px-1.5 py-0.5 text-[10px] font-medium text-neutral-500 dark:text-neutral-400">{f.wcag}</span>
                </div>
              ))}
            </div>

            <div className="mt-4 flex items-start gap-2 rounded-lg border border-blue-100 dark:border-blue-900/40 bg-blue-50 dark:bg-blue-950/30 p-3 text-xs text-blue-700 dark:text-blue-300">
              <Info className="h-3.5 w-3.5 shrink-0 mt-0.5" />
              <span>
                Add <code className="font-mono">?key=YOUR_API_KEY</code> to the script URL to attribute applied-fix counts to your workspace (create a key in Settings → API). The script fixes structure and attributes; meaningful alt text and complex ARIA still need human review.
              </span>
            </div>

            {!scriptSnippet ? (
              <Button variant="outline" size="sm" className="mt-3" onClick={loadScript}>
                {t("remediation.viewFullScript")}
              </Button>
            ) : (
              <pre className="mt-3 max-h-48 overflow-auto rounded-lg bg-neutral-900 dark:bg-neutral-800 p-4 text-xs text-neutral-100">
                {scriptSnippet}
              </pre>
            )}
          </CardContent>
        </Card>
      </div>
    </AppShell>
  );
}

// ── Results view ─────────────────────────────────────────────────────────────
function ResultsView({ result, onDownload, downloading }: { result: RemediationResult; onDownload: () => void; downloading: boolean }) {
  const { t } = useI18n();
  const categoryKeys = Object.keys(result.categories);
  const reviewCount = result.fixes.filter((f) => catalogFor(f.category)?.needsReview).length;

  return (
    <Card>
      <CardContent className="pt-6">
        {/* Impact header */}
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div className="min-w-0">
            <div className="flex items-baseline gap-2">
              <span className="text-3xl font-bold text-neutral-900 dark:text-white">{result.totalFixes}</span>
              <span className="text-sm text-neutral-500 dark:text-neutral-400">
                {result.totalFixes === 1 ? t("remediation.fixAppliedSingular") : t("remediation.fixesAppliedPlural")} · {categoryKeys.length} {categoryKeys.length === 1 ? t("remediation.categorySingular") : t("remediation.categoryPlural")}
              </span>
            </div>
            <p className="mt-1 text-xs text-neutral-400 dark:text-neutral-500 wrap-break-word">{result.url}</p>
          </div>
          {result.totalFixes > 0 && (
            <Button onClick={onDownload} disabled={downloading} size="sm" variant="outline" className="w-full sm:w-auto shrink-0">
              {downloading ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Download className="h-4 w-4 mr-2" />}
              {t("remediation.downloadFixedHtml")}
            </Button>
          )}
        </div>

        {result.totalFixes === 0 ? (
          <div className="mt-4 flex items-center gap-2 rounded-lg border border-neutral-200 dark:border-neutral-700 p-4 text-sm text-neutral-500 dark:text-neutral-400">
            <ShieldCheck className="h-4 w-4 text-green-500 shrink-0" />
            {t("remediation.noAutoFixable")}
          </div>
        ) : (
          <>
            {/* Category breakdown */}
            <div className="mt-4 flex flex-wrap gap-2">
              {categoryKeys.map((cat) => {
                const meta = catalogFor(cat);
                const Icon = meta?.Icon ?? Wand2;
                return (
                  <span key={cat} className="flex items-center gap-1.5 rounded-full border border-neutral-200 dark:border-neutral-700 bg-neutral-50 dark:bg-neutral-900 px-2.5 py-1 text-xs">
                    <Icon className="h-3.5 w-3.5 text-accent" />
                    <span className="font-medium text-neutral-700 dark:text-neutral-200">{meta ? t(meta.labelKey) : cat}</span>
                    <span className="rounded-full bg-accent/10 px-1.5 text-[11px] font-semibold text-accent">{result.categories[cat]}</span>
                  </span>
                );
              })}
            </div>

            {/* Per-fix before→after */}
            <div className="mt-4 space-y-2">
              {result.fixes.map((fix, i) => (
                <FixItem key={i} fix={fix} />
              ))}
            </div>

            {/* Honest framing */}
            {reviewCount > 0 && (
              <div className="mt-4 flex items-start gap-2 rounded-lg border border-amber-100 dark:border-amber-900/40 bg-amber-50 dark:bg-amber-950/30 p-3 text-xs text-amber-700 dark:text-amber-300">
                <AlertTriangle className="h-3.5 w-3.5 shrink-0 mt-0.5" />
                <span>
                  {reviewCount} {t("remediation.reviewNoteSuffix")}
                </span>
              </div>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}

// ── Single fix: selector + WCAG + before→after diff ──────────────────────────
function FixItem({ fix }: { fix: FixRecord }) {
  const { t } = useI18n();
  const meta = catalogFor(fix.category);
  const Icon = meta?.Icon ?? Wand2;
  return (
    <div className="rounded-lg border border-neutral-200 dark:border-neutral-700 p-3">
      <div className="flex flex-wrap items-center gap-2">
        <Icon className="h-4 w-4 shrink-0 text-accent" />
        <span className="text-sm font-medium text-neutral-900 dark:text-white">{fix.description}</span>
        {fix.wcagCriteria && (
          <span className="rounded bg-neutral-100 dark:bg-neutral-800 px-1.5 py-0.5 text-[10px] font-medium text-neutral-500 dark:text-neutral-400">{fix.wcagCriteria}</span>
        )}
        {meta?.needsReview && (
          <span className="rounded bg-amber-100 dark:bg-amber-900/30 px-1.5 py-0.5 text-[10px] font-medium text-amber-700 dark:text-amber-300">{t("remediation.reviewBadge")}</span>
        )}
      </div>
      {fix.selector && (
        <code className="mt-1.5 block break-all text-[11px] text-neutral-400 dark:text-neutral-500">{fix.selector}</code>
      )}
      {(fix.before || fix.after) && (
        <div className="mt-2 space-y-1 font-mono text-[11px]">
          {fix.before && (
            <div className="overflow-x-auto rounded bg-red-50 dark:bg-red-950/30 px-2 py-1 text-red-700 dark:text-red-300">
              <span className="select-none opacity-60">- </span>
              <span className="break-all">{truncate(fix.before)}</span>
            </div>
          )}
          {fix.after && (
            <div className="overflow-x-auto rounded bg-green-50 dark:bg-green-950/30 px-2 py-1 text-green-700 dark:text-green-300">
              <span className="select-none opacity-60">+ </span>
              <span className="break-all">{truncate(fix.after)}</span>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ── Fixability breakdown for a selected scan ─────────────────────────────────
function FixabilityView({
  fixability,
  onRemediate,
  canRemediate,
}: {
  fixability: FixabilitySummary;
  onRemediate: () => void;
  canRemediate: boolean;
}) {
  const { t } = useI18n();
  const { total, autoFixable, needsReview, needsDeveloper, byCategory, needsDeveloperRules } = fixability;
  const pct = total > 0 ? Math.round((autoFixable / total) * 100) : 0;

  if (total === 0) {
    return (
      <div className="mt-4 flex items-center gap-2 rounded-lg border border-neutral-200 dark:border-neutral-700 p-4 text-sm text-neutral-500 dark:text-neutral-400">
        <ShieldCheck className="h-4 w-4 shrink-0 text-green-500" />
        {t("remediation.noViolations")}
      </div>
    );
  }

  return (
    <div className="mt-4 space-y-4">
      {/* Headline + coverage bar */}
      <div>
        <div className="flex items-baseline justify-between gap-2">
          <p className="text-sm text-neutral-500 dark:text-neutral-400">
            <span className="text-2xl font-bold text-neutral-900 dark:text-white">{autoFixable}</span> {t("remediation.ofWord")} {total} {total === 1 ? t("remediation.issueSingular") : t("remediation.issuePlural")} {t("remediation.autoFixableSuffix")}
          </p>
          <span className="text-sm font-semibold text-accent">{pct}%</span>
        </div>
        <div className="mt-2 h-2 w-full overflow-hidden rounded-full bg-neutral-200 dark:bg-neutral-700">
          <div className="h-full rounded-full bg-accent transition-all" style={{ width: `${pct}%` }} />
        </div>
      </div>

      {/* Auto-fixable vs needs-developer tiles */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div className="rounded-lg border border-green-200 dark:border-green-800/40 bg-green-50 dark:bg-green-950/30 p-3">
          <div className="flex items-center gap-1.5 text-xs font-semibold text-green-700 dark:text-green-300">
            <Wand2 className="h-3.5 w-3.5" /> {t("remediation.autoFixableTile")}
          </div>
          <p className="mt-1 text-2xl font-bold text-neutral-900 dark:text-white">{autoFixable}</p>
          {needsReview > 0 && (
            <p className="mt-0.5 text-[11px] text-neutral-500 dark:text-neutral-400">{needsReview} {t("remediation.needsReviewNote")}</p>
          )}
        </div>
        <div className="rounded-lg border border-neutral-200 dark:border-neutral-700 p-3">
          <div className="flex items-center gap-1.5 text-xs font-semibold text-neutral-600 dark:text-neutral-300">
            <UserCog className="h-3.5 w-3.5" /> {t("remediation.needsDeveloperTile")}
          </div>
          <p className="mt-1 text-2xl font-bold text-neutral-900 dark:text-white">{needsDeveloper}</p>
          <p className="mt-0.5 text-[11px] text-neutral-500 dark:text-neutral-400">{t("remediation.needsDeveloperNote")}</p>
        </div>
      </div>

      {/* Auto-fixable category breakdown */}
      {byCategory.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {byCategory.map(({ category, count, risky }) => {
            const meta = catalogFor(category);
            const Icon = meta?.Icon ?? Wand2;
            return (
              <span key={category} className="flex items-center gap-1.5 rounded-full border border-neutral-200 dark:border-neutral-700 bg-neutral-50 dark:bg-neutral-900 px-2.5 py-1 text-xs">
                <Icon className="h-3.5 w-3.5 text-accent" />
                <span className="font-medium text-neutral-700 dark:text-neutral-200">{meta ? t(meta.labelKey) : category}</span>
                <span className="rounded-full bg-accent/10 px-1.5 text-[11px] font-semibold text-accent">{count}</span>
                {risky && <AlertTriangle className="h-3 w-3 text-amber-500" aria-label={t("remediation.altersDesignBadge")} />}
              </span>
            );
          })}
        </div>
      )}

      {/* Top rules that need a developer (honest) */}
      {needsDeveloperRules.length > 0 && (
        <div>
          <p className="mb-1.5 text-xs font-semibold uppercase tracking-wider text-neutral-400 dark:text-neutral-500">{t("remediation.needsDeveloperTile")}</p>
          <div className="flex flex-wrap gap-1.5">
            {needsDeveloperRules.slice(0, 10).map((r) => (
              <span key={r.ruleId} className="flex items-center gap-1.5 rounded-md border border-neutral-200 dark:border-neutral-700 px-2 py-1 text-[11px] text-neutral-600 dark:text-neutral-300">
                <UserCog className="h-3 w-3 text-neutral-400" />
                <span className="font-mono">{r.ruleId}</span>
                {r.count > 1 && <span className="text-neutral-400">×{r.count}</span>}
              </span>
            ))}
            {needsDeveloperRules.length > 10 && (
              <span className="px-2 py-1 text-[11px] text-neutral-400">+{needsDeveloperRules.length - 10} {t("remediation.moreSuffix")}</span>
            )}
          </div>
        </div>
      )}

      {autoFixable > 0 && (
        <Button onClick={onRemediate} disabled={!canRemediate} size="sm" className="w-full sm:w-auto">
          <Wand2 className="h-4 w-4 mr-2" /> {t("remediation.autoFixNow")}
        </Button>
      )}
    </div>
  );
}
