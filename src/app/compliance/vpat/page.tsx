"use client";

/**
 * RegLayer — VPAT Page
 *
 * WHY: Enterprise customers need VPAT documents for procurement evaluation.
 * WHAT: VPAT (Voluntary Product Accessibility Template) generator with Section 508 format.
 * HOW: Fetches /api/compliance/vpat, renders structured VPAT document with export options.
 */

import { useState } from "react";
import { AppShell } from "@/components/layout/app-shell";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { FileText, Download, CheckCircle, XCircle, AlertCircle } from "lucide-react";

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
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<VPATResult | null>(null);
  const [productName, setProductName] = useState("");
  const [vendorName, setVendorName] = useState("");
  const [standard, setStandard] = useState("WCAG21-AA");
  const [scanId, setScanId] = useState("");
  const [scans, setScans] = useState<Array<{ id: string; url: string; score: number }>>([]);
  const [scansLoaded, setScansLoaded] = useState(false);

  async function loadScans() {
    if (scansLoaded) return;
    const res = await fetch("/api/scans");
    if (res.ok) {
      const data = await res.json();
      setScans(data.scans || []);
      if (data.scans?.length > 0) setScanId(data.scans[0].id);
    }
    setScansLoaded(true);
  }

  async function generate() {
    setLoading(true);
    try {
      // If no scanId selected, load scans and use the first one
      let id = scanId;
      if (!id) {
        const scansRes = await fetch("/api/scans");
        if (scansRes.ok) {
          const data = await scansRes.json();
          if (data.scans?.length > 0) {
            id = data.scans[0].id;
            setScanId(id);
          }
        }
      }
      if (!id) {
        alert("No scans available. Run a scan first.");
        setLoading(false);
        return;
      }
      const res = await fetch("/api/compliance/vpat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          scanId: id,
          productName: productName || "My Application",
          vendorName: vendorName || "My Company",
          standard,
          format: "json",
        }),
      });
      if (res.ok) {
        setResult(await res.json());
      }
    } finally {
      setLoading(false);
    }
  }

  async function downloadHTML() {
    const res = await fetch("/api/compliance/vpat", {
      method: "POST",
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
    }
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
          <h1 className="text-2xl font-bold">Legal Shield — VPAT/ACR Generator</h1>
          <p className="text-muted-foreground">
            Generate legally defensible VPAT/ACR documents for procurement RFPs. Companies pay $10K-$50K for these.
          </p>
        </div>

        {/* Input Form */}
        <Card>
          <CardContent className="pt-6">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="text-sm font-medium block mb-1">Product Name</label>
                <input
                  type="text"
                  value={productName}
                  onChange={(e) => setProductName(e.target.value)}
                  placeholder="My Application"
                  className="w-full rounded-md border px-3 py-2 text-sm bg-background"
                />
              </div>
              <div>
                <label className="text-sm font-medium block mb-1">Vendor Name</label>
                <input
                  type="text"
                  value={vendorName}
                  onChange={(e) => setVendorName(e.target.value)}
                  placeholder="My Company"
                  className="w-full rounded-md border px-3 py-2 text-sm bg-background"
                />
              </div>
              <div>
                <label className="text-sm font-medium block mb-1">Standard</label>
                <select
                  value={standard}
                  onChange={(e) => setStandard(e.target.value)}
                  className="w-full rounded-md border px-3 py-2 text-sm bg-background"
                >
                  <option value="WCAG21-AA">WCAG 2.1 Level AA</option>
                  <option value="WCAG21-A">WCAG 2.1 Level A</option>
                  <option value="WCAG21-AAA">WCAG 2.1 Level AAA</option>
                  <option value="Section508">Section 508</option>
                  <option value="EN301549">EN 301 549</option>
                </select>
              </div>
              <div>
                <label className="text-sm font-medium block mb-1">Scan (optional)</label>
                <select
                  value={scanId}
                  onChange={(e) => setScanId(e.target.value)}
                  onFocus={loadScans}
                  className="w-full rounded-md border px-3 py-2 text-sm bg-background"
                >
                  <option value="">Use latest scan</option>
                  {scans.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.url} (Score: {s.score})
                    </option>
                  ))}
                </select>
              </div>
            </div>
            <div className="flex gap-3 mt-4">
              <Button onClick={generate} disabled={loading}>
                <FileText className="h-4 w-4 mr-2" />
                {loading ? "Generating..." : "Generate VPAT"}
              </Button>
              {result && (
                <Button variant="outline" onClick={downloadHTML}>
                  <Download className="h-4 w-4 mr-2" />
                  Download HTML
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
                  <p className="text-3xl font-bold text-green-600">{result.summary.supportedCriteria}</p>
                </CardContent>
              </Card>
              <Card className="border-yellow-200 dark:border-yellow-900">
                <CardContent className="pt-6 text-center">
                  <p className="text-sm text-muted-foreground">Partial</p>
                  <p className="text-3xl font-bold text-yellow-600">{result.summary.partiallySupportedCriteria}</p>
                </CardContent>
              </Card>
              <Card className="border-red-200 dark:border-red-900">
                <CardContent className="pt-6 text-center">
                  <p className="text-sm text-muted-foreground">Not Supported</p>
                  <p className="text-3xl font-bold text-red-600">{result.summary.notSupportedCriteria}</p>
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
