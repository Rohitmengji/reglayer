"use client";

/**
 * RegLayer — VPAT Page
 *
 * WHY: Enterprise customers need VPAT documents for procurement evaluation.
 * WHAT: VPAT (Voluntary Product Accessibility Template) generator with Section 508 format.
 * HOW: Fetches /api/compliance/vpat, renders structured VPAT document with export options.
 */

import { useEffect, useState } from "react";
import Link from "next/link";
import { ModernSelect } from "@/components/ui/modern-select";
import { AppShell } from "@/components/layout/app-shell";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { FileText, Download, CheckCircle, XCircle, AlertCircle } from "lucide-react";
import { useI18n } from "@/components/i18n-provider";

interface VPATResult {
  metadata: {
    reportType: string;
    standard: string;
    productName: string;
    vendorName: string;
    reportDate: string;
  };
  summary: {
    overallConformance: string;
    score: number;
    supportedCriteria: number;
    partiallySupportedCriteria: number;
    notSupportedCriteria: number;
    totalCriteria: number;
  };
  criteria: Array<{
    id: string;
    name: string;
    level: string;
    conformance: string;
    remarks: string;
  }>;
}

export default function VPATPage() {
  const { t } = useI18n();
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<VPATResult | null>(null);
  const [productName, setProductName] = useState("");
  const [vendorName, setVendorName] = useState("");
  const [standard, setStandard] = useState("WCAG21-AA");
  const [scanId, setScanId] = useState("");
  const [scans, setScans] = useState<Array<{ id: string; url: string; score: number }>>([]);
  const [scansLoading, setScansLoading] = useState(true);
  const [scansError, setScansError] = useState(false);
  const [retry, setRetry] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [downloading, setDownloading] = useState(false);

  useEffect(() => {
    let disposed = false;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 15_000);
    async function load() {
      setScansLoading(true);
      setScansError(false);
      try {
        const response = await fetch("/api/scans", { cache: "no-store", signal: controller.signal });
        if (!response.ok) throw new Error("Scan history unavailable");
        const data = await response.json();
        if (!Array.isArray(data.scans)) throw new Error("Invalid scan history");
        const completed = data.scans.filter((scan: { status: string }) => scan.status === "COMPLETED");
        if (!disposed) {
          setScans(completed);
          setScanId(completed[0]?.id ?? "");
        }
      } catch {
        if (!disposed) setScansError(true);
      } finally {
        clearTimeout(timeout);
        if (!disposed) setScansLoading(false);
      }
    }
    void load();
    return () => { disposed = true; clearTimeout(timeout); controller.abort(); };
  }, [retry]);

  async function generate() {
    if (loading || !scanId) return;
    setLoading(true);
    setError(null);
    setResult(null);
    try {
      const res = await fetch("/api/compliance/vpat", {
        method: "POST",
        signal: AbortSignal.timeout(30_000),
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          scanId,
          productName: productName || "My Application",
          vendorName: vendorName || "My Company",
          standard,
          format: "json",
        }),
      });
      if (!res.ok) throw new Error("Generation failed");
      const data = await res.json();
      if (!data.summary || !Array.isArray(data.criteria)) throw new Error("Invalid draft");
      setResult(data);
    } catch {
      setError("Could not generate the draft. Your inputs are unchanged; please try again.");
    } finally {
      setLoading(false);
    }
  }

  async function downloadHTML() {
    if (downloading || !result) return;
    setDownloading(true);
    setError(null);
    try {
    const res = await fetch("/api/compliance/vpat", {
      method: "POST",
      signal: AbortSignal.timeout(30_000),
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        scanId: scanId,
        productName: productName || "My Application",
        vendorName: vendorName || "My Company",
        standard,
        format: "html",
      }),
    });
    if (res.ok) {
      const html = await res.text();
      const blob = new Blob([html], { type: "text/html" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `VPAT-${productName || "report"}.html`;
      a.click();
      URL.revokeObjectURL(url);
    } else {
      throw new Error("Download failed");
    }
    } catch {
      setError("Could not download the draft. Please try again.");
    } finally { setDownloading(false); }
  }

  function conformanceIcon(c: string) {
    if (c === "Supports") return <CheckCircle className="h-4 w-4 text-green-500" />;
    if (c === "Partially Supports") return <AlertCircle className="h-4 w-4 text-yellow-500" />;
    if (c === "Does Not Support") return <XCircle className="h-4 w-4 text-red-500" />;
    return <span className="h-4 w-4 text-gray-500 dark:text-gray-400">—</span>;
  }

  return (
    <AppShell>
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold">VPAT / ACR Draft</h1>
          <p className="text-muted-foreground">
            Prepare a draft from scan evidence for qualified review. Complete manual testing and verify every conformance claim before sharing it; this is not a legal assurance or certification.
          </p>
        </div>

        {/* Input Form */}
        <Card>
          <CardContent className="pt-6">
            <fieldset disabled={loading || downloading || scansLoading} className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label htmlFor="vpat-product" className="text-sm font-medium block mb-1">Product Name</label>
                <input
                  id="vpat-product"
                  type="text"
                  disabled={loading || downloading}
                  value={productName}
                  onChange={(e) => { setProductName(e.target.value); setResult(null); }}
                  placeholder="My Application"
                  className="w-full rounded-md border px-3 py-2 text-sm bg-background"
                />
              </div>
              <div>
                <label htmlFor="vpat-vendor" className="text-sm font-medium block mb-1">Vendor Name</label>
                <input
                  id="vpat-vendor"
                  type="text"
                  disabled={loading || downloading}
                  value={vendorName}
                  onChange={(e) => { setVendorName(e.target.value); setResult(null); }}
                  placeholder="My Company"
                  className="w-full rounded-md border px-3 py-2 text-sm bg-background"
                />
              </div>
              <div>
                <ModernSelect
              label="Standard"
              options={[{ value: "WCAG21-AA", label: "WCAG 2.1 Level AA" }, { value: "WCAG21-A", label: "WCAG 2.1 Level A" }, { value: "WCAG21-AAA", label: "WCAG 2.1 Level AAA" }, { value: "Section508", label: "Section 508" }, { value: "EN301549", label: "EN 301 549" }]}
              value={standard}
              onChange={(value) => { setStandard(value); setResult(null); }}
            />
              </div>
              <div>
                <ModernSelect
              label="Completed scan"
              options={scans.map((scan) => ({ value: scan.id, label: `${scan.url} (Score: ${scan.score})` }))}
              value={scanId}
              onChange={(value) => { setScanId(value); setResult(null); }}
            />
              </div>
            </fieldset>
            {scansLoading && <p role="status" className="mt-3 text-sm">Loading completed scans...</p>}
            {scansError && <div className="mt-3"><p role="alert" className="text-sm">Could not load completed scans. Please try again.</p><Button variant="outline" onClick={() => setRetry(value => value + 1)} className="mt-2">{t("common.retry")}</Button></div>}
            {!scansLoading && !scansError && scans.length === 0 && <p className="mt-3 text-sm">No completed scans available. <Link href="/dashboard" className="underline">Run a scan</Link> first.</p>}
            {error && <p role="alert" className="mt-3 text-sm text-red-700 dark:text-red-300">{error}</p>}
            <div className="flex flex-wrap gap-3 mt-4">
              <Button onClick={generate} disabled={loading || downloading || scansLoading || scansError || !scanId}>
                <FileText className="h-4 w-4 mr-2" />
                {loading ? "Generating..." : "Generate draft"}
              </Button>
              {result && (
                <Button variant="outline" onClick={downloadHTML} disabled={downloading || loading}>
                  <Download className="h-4 w-4 mr-2" />
                  {downloading ? "Downloading..." : "Download HTML"}
                </Button>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Results */}
        {result && (
          <>
            {/* Summary */}
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
              <Card>
                <CardContent className="pt-6 text-center">
                  <p className="text-sm text-muted-foreground">Overall</p>
                  <p className="text-lg font-bold mt-1">{result.summary.overallConformance}</p>
                </CardContent>
              </Card>
              <Card className="border-green-200 dark:border-green-900">
                <CardContent className="pt-6 text-center">
                  <p className="text-sm text-muted-foreground">Supported</p>
                  <p className="text-3xl font-bold tabular-nums text-green-600">{result.summary.supportedCriteria}</p>
                </CardContent>
              </Card>
              <Card className="border-yellow-200 dark:border-yellow-900">
                <CardContent className="pt-6 text-center">
                  <p className="text-sm text-muted-foreground">Partial</p>
                  <p className="text-3xl font-bold tabular-nums text-yellow-600">{result.summary.partiallySupportedCriteria}</p>
                </CardContent>
              </Card>
              <Card className="border-red-200 dark:border-red-900">
                <CardContent className="pt-6 text-center">
                  <p className="text-sm text-muted-foreground">Not Supported</p>
                  <p className="text-3xl font-bold tabular-nums text-red-600">{result.summary.notSupportedCriteria}</p>
                </CardContent>
              </Card>
            </div>

            {/* Criteria Table */}
            <Card>
              <CardContent className="pt-6">
                <h3 className="font-semibold mb-4">WCAG 2.1 Criteria ({result.criteria.length})</h3>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b">
                        <th className="text-left py-2 px-2">Criterion</th>
                        <th className="text-left py-2 px-2">Name</th>
                        <th className="text-left py-2 px-2">Level</th>
                        <th className="text-left py-2 px-2">Conformance</th>
                        <th className="text-left py-2 px-2">Remarks</th>
                      </tr>
                    </thead>
                    <tbody>
                      {result.criteria.map((c) => (
                        <tr key={c.id} className="border-b hover:bg-muted/50">
                          <td className="py-2 px-2 font-mono">{c.id}</td>
                          <td className="py-2 px-2">{c.name}</td>
                          <td className="py-2 px-2">{c.level}</td>
                          <td className="py-2 px-2">
                            <div className="flex items-center gap-1.5">
                              {conformanceIcon(c.conformance)}
                              <span>{c.conformance}</span>
                            </div>
                          </td>
                          <td className="py-2 px-2 text-muted-foreground max-w-75 truncate">{c.remarks}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </CardContent>
            </Card>
          </>
        )}
      </div>
    </AppShell>
  );
}
