"use client";

/**
 * RegLayer — Design System Audit Page
 *
 * WHY: Component libraries need accessibility auditing at the component level.
 * WHAT: Scan individual UI components (buttons, forms, modals) for accessibility issues.
 * HOW: POSTs component URLs to /api/design-system/scan, renders per-component results.
 */

import { useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Component,
  Search,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  Layers,
  Zap,
} from "lucide-react";
import { useI18n } from "@/components/i18n-provider";

interface ComponentResult {
  name: string;
  story: string;
  url: string;
  score: number;
  violations: {
    ruleId: string;
    impact: string;
    description: string;
    wcag: string[];
    selector: string;
    fix?: string;
  }[];
  passedRules: number;
  totalRules: number;
  usageCount?: number;
}

interface Hotspot {
  ruleId: string;
  description: string;
  affectedComponents: number;
  totalViolations: number;
  impact: string;
}

interface Report {
  storybookUrl: string;
  scannedAt: string;
  totalComponents: number;
  passedComponents: number;
  failedComponents: number;
  overallScore: number;
  components: ComponentResult[];
  hotspots: Hotspot[];
  recommendations: string[];
}

export default function DesignSystemPage() {
  const { t } = useI18n();
  const [storybookUrl, setStorybookUrl] = useState("");
  const [report, setReport] = useState<Report | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [expandedComponent, setExpandedComponent] = useState<string | null>(null);

  async function runScan() {
    if (!storybookUrl) return;
    setLoading(true);
    setError("");
    setReport(null);

    try {
      const res = await fetch("/api/design-system/scan", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ storybookUrl }),
      });

      if (!res.ok) {
        const data = await res.json();
        setError(data.error || "Scan failed");
        return;
      }

      setReport(await res.json());
    } catch {
      setError("Network error");
    } finally {
      setLoading(false);
    }
  }

  async function runDemoScan() {
    setLoading(true);
    setError("");
    setReport(null);

    // Demo with sample component HTML
    const demoComponents = [
      {
        name: "Button",
        story: "Primary",
        html: `<button class="btn btn-primary">Submit</button>`,
        usageCount: 142,
      },
      {
        name: "IconButton",
        story: "Default",
        html: `<button class="btn-icon"><svg></svg></button>`,
        usageCount: 87,
      },
      {
        name: "Input",
        story: "Text Input",
        html: `<div class="form-field"><label for="email">Email</label><input id="email" type="email" /></div>`,
        usageCount: 63,
      },
      {
        name: "SearchInput",
        story: "No Label",
        html: `<div class="search"><input type="search" placeholder="Search..." /><button><svg class="icon-search"></svg></button></div>`,
        usageCount: 24,
      },
      {
        name: "Modal",
        story: "Confirm Dialog",
        html: `<div role="dialog" aria-modal="true" aria-labelledby="modal-title"><h2 id="modal-title">Confirm</h2><p>Are you sure?</p><button>Cancel</button><button>Confirm</button></div>`,
        usageCount: 31,
      },
      {
        name: "Card",
        story: "With Image",
        html: `<div class="card"><img src="/photo.jpg" /><h3>Title</h3><p>Description</p></div>`,
        usageCount: 56,
      },
      {
        name: "Dropdown",
        story: "Menu",
        html: `<div class="dropdown"><button aria-expanded="false" aria-haspopup="true">Options</button><ul role="menu"><li role="menuitem">Edit</li><li role="menuitem">Delete</li></ul></div>`,
        usageCount: 38,
      },
      {
        name: "Tabs",
        story: "Default",
        html: `<div role="tablist"><button role="tab" aria-selected="true">Tab 1</button><button role="tab" aria-selected="false">Tab 2</button></div><div role="tabpanel">Content 1</div>`,
        usageCount: 19,
      },
      {
        name: "Alert",
        story: "Error",
        html: `<div role="alert" class="alert alert-error"><span>Something went wrong</span></div>`,
        usageCount: 44,
      },
      {
        name: "ClickableDiv",
        story: "Custom Button",
        html: `<div class="custom-btn" onclick="doSomething()" style="color: #ccc;">Click me</div>`,
        usageCount: 12,
      },
    ];

    try {
      const res = await fetch("/api/design-system/scan", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          storybookUrl: "https://storybook.example.com",
          components: demoComponents,
        }),
      });

      if (res.ok) {
        setReport(await res.json());
      } else {
        const data = await res.json();
        setError(data.error || "Demo scan failed");
      }
    } catch {
      setError("Network error");
    } finally {
      setLoading(false);
    }
  }

  function scoreColor(score: number) {
    if (score >= 90) return "text-green-500";
    if (score >= 70) return "text-yellow-500";
    if (score >= 50) return "text-orange-500";
    return "text-red-500";
  }

  function impactColor(impact: string) {
    if (impact === "critical") return "bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-300";
    if (impact === "serious") return "bg-orange-100 text-orange-700 dark:bg-orange-950 dark:text-orange-300";
    if (impact === "moderate") return "bg-yellow-100 text-yellow-700 dark:bg-yellow-950 dark:text-yellow-300";
    return "bg-blue-100 text-blue-700 dark:bg-blue-950 dark:text-blue-300";
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">{t("designSystem.title")}</h1>
        <p className="text-muted-foreground">
          Scan Storybook to find accessibility issues at the component level. Fix once, fix everywhere.
        </p>
        <p className="text-xs text-amber-600 dark:text-amber-400 mt-1">
          Requires Pro or Enterprise plan. Free tier shows a demo report only.
        </p>
      </div>

      {/* Scan form */}
      <Card className="p-4">
        <div className="flex flex-col sm:flex-row gap-3">
          <input
            type="url"
            placeholder="https://your-storybook.chromatic.com"
            value={storybookUrl}
            onChange={(e) => setStorybookUrl(e.target.value)}
            className="flex-1 min-w-0 px-3 py-2 border rounded-md bg-background text-sm"
          />
          <div className="flex gap-2 shrink-0">
            <Button onClick={runScan} disabled={loading || !storybookUrl} size="sm">
              <Search className="h-4 w-4 mr-1.5" />
              {loading ? "Scanning..." : "Scan Storybook"}
            </Button>
            <Button variant="outline" onClick={runDemoScan} disabled={loading} size="sm">
              <Zap className="h-4 w-4 mr-1.5" />
              Demo
            </Button>
          </div>
        </div>
        {error && <p className="text-sm text-red-500 mt-2">{error}</p>}
      </Card>

      {report && (
        <>
          {/* Overview cards */}
          <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
            <Card className="p-4 text-center">
              <p className={`text-3xl font-bold ${scoreColor(report.overallScore)}`}>
                {report.overallScore}
              </p>
              <p className="text-xs text-muted-foreground">Overall Score</p>
            </Card>
            <Card className="p-4 text-center">
              <Layers className="h-5 w-5 mx-auto text-blue-500 mb-1" />
              <p className="text-2xl font-bold">{report.totalComponents}</p>
              <p className="text-xs text-muted-foreground">Components</p>
            </Card>
            <Card className="p-4 text-center">
              <CheckCircle2 className="h-5 w-5 mx-auto text-green-500 mb-1" />
              <p className="text-2xl font-bold">{report.passedComponents}</p>
              <p className="text-xs text-muted-foreground">Passed</p>
            </Card>
            <Card className="p-4 text-center">
              <XCircle className="h-5 w-5 mx-auto text-red-500 mb-1" />
              <p className="text-2xl font-bold">{report.failedComponents}</p>
              <p className="text-xs text-muted-foreground">Failed</p>
            </Card>
            <Card className="p-4 text-center">
              <AlertTriangle className="h-5 w-5 mx-auto text-orange-500 mb-1" />
              <p className="text-2xl font-bold">{report.hotspots.length}</p>
              <p className="text-xs text-muted-foreground">Hotspots</p>
            </Card>
          </div>

          {/* Hotspots */}
          {report.hotspots.length > 0 && (
            <Card className="p-4">
              <h3 className="font-medium mb-3 flex items-center gap-2">
                <Zap className="h-4 w-4 text-orange-500" />
                Hotspots — Fix Once, Fix Everywhere
              </h3>
              <div className="space-y-2">
                {report.hotspots.map((h, i) => (
                  <div
                    key={i}
                    className="flex items-center justify-between p-2 bg-muted/50 rounded"
                  >
                    <div className="flex items-center gap-2">
                      <Badge className={impactColor(h.impact)}>{h.impact}</Badge>
                      <span className="text-sm">{h.description}</span>
                    </div>
                    <Badge variant="secondary">
                      {h.affectedComponents} component{h.affectedComponents > 1 ? "s" : ""}
                    </Badge>
                  </div>
                ))}
              </div>
            </Card>
          )}

          {/* Component list */}
          <Card className="p-4">
            <h3 className="font-medium mb-3 flex items-center gap-2">
              <Component className="h-4 w-4" />
              Component Results
            </h3>
            <div className="space-y-2">
              {report.components
                .sort((a, b) => a.score - b.score)
                .map((comp) => (
                  <div key={`${comp.name}-${comp.story}`} className="border rounded">
                    <button
                      onClick={() =>
                        setExpandedComponent(
                          expandedComponent === comp.name ? null : comp.name
                        )
                      }
                      className="w-full flex items-center justify-between p-3 hover:bg-muted/50 transition-colors text-left"
                    >
                      <div className="flex items-center gap-3">
                        {comp.violations.length === 0 ? (
                          <CheckCircle2 className="h-4 w-4 text-green-500" />
                        ) : (
                          <XCircle className="h-4 w-4 text-red-500" />
                        )}
                        <div>
                          <span className="font-medium text-sm">{comp.name}</span>
                          <span className="text-xs text-muted-foreground ml-2">
                            ({comp.story})
                          </span>
                        </div>
                        {comp.usageCount && (
                          <Badge variant="outline" className="text-[10px]">
                            {comp.usageCount} uses
                          </Badge>
                        )}
                      </div>
                      <div className="flex items-center gap-3">
                        {comp.violations.length > 0 && (
                          <Badge variant="secondary">
                            {comp.violations.length} issue{comp.violations.length > 1 ? "s" : ""}
                          </Badge>
                        )}
                        <span className={`text-sm font-bold ${scoreColor(comp.score)}`}>
                          {comp.score}%
                        </span>
                      </div>
                    </button>

                    {expandedComponent === comp.name && comp.violations.length > 0 && (
                      <div className="border-t px-4 py-3 space-y-2 bg-muted/30">
                        {comp.violations.map((v, i) => (
                          <div key={i} className="text-sm space-y-1">
                            <div className="flex items-center gap-2">
                              <Badge className={`${impactColor(v.impact)} text-[10px]`}>
                                {v.impact}
                              </Badge>
                              <span>{v.description}</span>
                              <code className="text-[10px] bg-muted px-1 rounded">
                                {v.wcag.join(", ")}
                              </code>
                            </div>
                            {v.fix && (
                              <p className="text-xs text-muted-foreground pl-5">
                                Fix: {v.fix}
                              </p>
                            )}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                ))}
            </div>
          </Card>

          {/* Recommendations */}
          {report.recommendations.length > 0 && (
            <Card className="p-4">
              <h3 className="font-medium mb-3">Recommendations</h3>
              <ul className="space-y-2">
                {report.recommendations.map((r, i) => (
                  <li key={i} className="text-sm text-muted-foreground flex gap-2">
                    <span className="text-blue-500">→</span>
                    {r}
                  </li>
                ))}
              </ul>
            </Card>
          )}
        </>
      )}
    </div>
  );
}
