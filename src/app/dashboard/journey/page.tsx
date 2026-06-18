"use client";

/**
 * RegLayer — User Journey Page
 *
 * WHY: Multi-step user flows (checkout, registration) may have accessibility barriers between steps.
 * WHAT: Define a flow of URLs/interactions, scan each step, show step-by-step accessibility report.
 * HOW: POSTs flow definition to /api/journey, receives per-step scan results.
 */

import { useState } from "react";
import { toast } from "sonner";
import { ModernSelect } from "@/components/ui/modern-select";
import { AppShell } from "@/components/layout/app-shell";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Play, CheckCircle, XCircle, Gauge, Eye, Keyboard, Volume2 } from "lucide-react";
import { useI18n } from "@/components/i18n-provider";

interface StepResult {
  stepName: string;
  stepIndex: number;
  passed: boolean;
  duration: number;
  url: string;
  accessibility: {
    focusedElement: string | null;
    focusVisible: boolean;
    missingFocusManagement: boolean;
    keyboardTraps: string[];
    headingStructure: Array<{ level: number; text: string; inOrder: boolean }>;
    landmarks: string[];
    violations: Array<{ type: string; severity: string; description: string; wcagCriteria: string }>;
    liveRegions: Array<{ text: string; politeness: string }>;
  };
  assertions: Array<{ type: string; passed: boolean; expected?: string; actual?: string; message: string }>;
}

interface JourneyResult {
  success: boolean;
  result: {
    name: string;
    totalSteps: number;
    passedSteps: number;
    failedSteps: number;
    totalDuration: number;
    overallScore: number;
    steps: StepResult[];
    summary: {
      focusIssues: number;
      liveRegionIssues: number;
      keyboardTraps: number;
      flowViolations: number;
      missingAnnouncements: number;
    };
  };
  recommendations: string[];
}

interface Preset {
  id: string;
  name: string;
  description: string;
  stepCount: number;
}

export default function JourneyPage() {
  const { t } = useI18n();
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<JourneyResult | null>(null);
  const [presets, setPresets] = useState<Preset[]>([]);
  const [presetsLoaded, setPresetsLoaded] = useState(false);
  const [selectedPreset, setSelectedPreset] = useState("ecommerce-checkout");
  const [baseUrl, setBaseUrl] = useState("https://");
  const [expandedStep, setExpandedStep] = useState<number | null>(null);

  async function loadPresets() {
    if (presetsLoaded) return;
    const res = await fetch("/api/journey");
    if (res.ok) {
      const data = await res.json();
      setPresets(data.journeys);
    }
    setPresetsLoaded(true);
  }

  async function runJourney() {
    setLoading(true);
    setResult(null);
    try {
      const res = await fetch("/api/journey", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          presetId: selectedPreset,
          baseUrl,
        }),
      });
      if (res.ok) {
        setResult(await res.json());
      } else {
        const err = await res.json();
        toast.error(err.error || "Journey failed");
      }
    } finally {
      setLoading(false);
    }
  }

  return (
    <AppShell>
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold">{t("journey.title")}</h1>
          <p className="text-muted-foreground">
            Scan multi-step user flows. Catches accessibility bugs that only appear during navigation.
          </p>
          <p className="text-xs text-amber-600 dark:text-amber-400 mt-1">
            Requires Pro or Enterprise plan.
          </p>
        </div>

        {/* Input */}
        <Card>
          <CardContent className="pt-6">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div>
                <label className="text-sm font-medium block mb-1">Journey Preset</label>
                <ModernSelect
              options={[{ value: "ecommerce-checkout", label: "E-Commerce Checkout" }, { value: "login-flow", label: "Authentication Flow" }, { value: "form-wizard", label: "Multi-Step Form" }, ...presets.map((p) => ({ value: p.id, label: p.name }))]}
              value={selectedPreset}
              onChange={setSelectedPreset}
            />
              </div>
              <div className="md:col-span-2">
                <label className="text-sm font-medium block mb-1">Base URL</label>
                <input
                  type="url"
                  value={baseUrl}
                  onChange={(e) => setBaseUrl(e.target.value)}
                  placeholder="https://your-app.com"
                  className="w-full rounded-md border px-3 py-2 text-sm bg-background"
                />
              </div>
            </div>
            <Button onClick={runJourney} disabled={loading || !baseUrl.startsWith("http")} className="mt-4">
              <Play className="h-4 w-4 mr-2" />
              {loading ? "Running Journey..." : "Run Journey Scan"}
            </Button>
            {loading && (
              <p className="text-sm text-muted-foreground mt-2 animate-pulse">
                Executing steps with Playwright... This may take 30-60 seconds.
              </p>
            )}
          </CardContent>
        </Card>

        {/* Results */}
        {result && (
          <>
            {/* Score */}
            <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
              <Card className={result.result.overallScore >= 70 ? "border-green-200 dark:border-green-900" : "border-red-200 dark:border-red-900"}>
                <CardContent className="pt-6 text-center">
                  <Gauge className="h-6 w-6 mx-auto mb-1" />
                  <p className="text-3xl font-bold">{result.result.overallScore}</p>
                  <p className="text-xs text-muted-foreground">Score</p>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="pt-6 text-center">
                  <Eye className="h-6 w-6 mx-auto mb-1 text-orange-500" />
                  <p className="text-3xl font-bold">{result.result.summary.focusIssues}</p>
                  <p className="text-xs text-muted-foreground">Focus Issues</p>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="pt-6 text-center">
                  <Keyboard className="h-6 w-6 mx-auto mb-1 text-red-500" />
                  <p className="text-3xl font-bold">{result.result.summary.keyboardTraps}</p>
                  <p className="text-xs text-muted-foreground">Keyboard Traps</p>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="pt-6 text-center">
                  <Volume2 className="h-6 w-6 mx-auto mb-1 text-blue-500" />
                  <p className="text-3xl font-bold">{result.result.summary.missingAnnouncements}</p>
                  <p className="text-xs text-muted-foreground">Missing Announcements</p>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="pt-6 text-center">
                  <p className="text-3xl font-bold">{result.result.passedSteps}/{result.result.totalSteps}</p>
                  <p className="text-xs text-muted-foreground">Steps Passed</p>
                </CardContent>
              </Card>
            </div>

            {/* Steps */}
            <Card>
              <CardContent className="pt-6">
                <h3 className="font-semibold mb-4">Journey Steps</h3>
                <div className="space-y-2">
                  {result.result.steps.map((step, i) => (
                    <div key={i} className="border rounded-lg overflow-hidden">
                      <button
                        onClick={() => setExpandedStep(expandedStep === i ? null : i)}
                        className="w-full flex items-center justify-between p-3 hover:bg-muted/50 text-left"
                      >
                        <div className="flex items-center gap-3">
                          {step.passed ? (
                            <CheckCircle className="h-5 w-5 text-green-500 shrink-0" />
                          ) : (
                            <XCircle className="h-5 w-5 text-red-500 shrink-0" />
                          )}
                          <div>
                            <span className="font-medium">{step.stepName}</span>
                            <span className="text-xs text-muted-foreground ml-2">{step.duration}ms</span>
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          {step.accessibility.violations.length > 0 && (
                            <Badge variant="destructive">{step.accessibility.violations.length} issues</Badge>
                          )}
                        </div>
                      </button>
                      {expandedStep === i && (
                        <div className="p-3 pt-0 border-t bg-muted/30">
                          <div className="grid grid-cols-2 gap-4 text-sm mt-3">
                            <div>
                              <p className="font-medium mb-1">Focus</p>
                              <p className="text-muted-foreground">
                                {step.accessibility.focusedElement || "No focused element"} 
                                {step.accessibility.focusVisible ? " (visible)" : " (not visible)"}
                              </p>
                            </div>
                            <div>
                              <p className="font-medium mb-1">Landmarks</p>
                              <p className="text-muted-foreground">
                                {step.accessibility.landmarks.length > 0 
                                  ? step.accessibility.landmarks.join(", ")
                                  : "None detected"}
                              </p>
                            </div>
                          </div>
                          {step.accessibility.violations.length > 0 && (
                            <div className="mt-3">
                              <p className="font-medium text-sm mb-2">Violations</p>
                              {step.accessibility.violations.map((v, vi) => (
                                <div key={vi} className="flex items-start gap-2 text-sm mb-1">
                                  <Badge variant={v.severity === "critical" ? "destructive" : "secondary"} className="text-xs shrink-0">
                                    {v.severity}
                                  </Badge>
                                  <span className="text-muted-foreground">{v.description.substring(0, 120)}</span>
                                </div>
                              ))}
                            </div>
                          )}
                          {step.assertions.length > 0 && (
                            <div className="mt-3">
                              <p className="font-medium text-sm mb-2">Assertions</p>
                              {step.assertions.map((a, ai) => (
                                <div key={ai} className="flex items-center gap-2 text-sm mb-1">
                                  {a.passed ? <CheckCircle className="h-3 w-3 text-green-500" /> : <XCircle className="h-3 w-3 text-red-500" />}
                                  <span>{a.message}</span>
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>

            {/* Recommendations */}
            {result.recommendations?.length > 0 && (
              <Card>
                <CardContent className="pt-6">
                  <h3 className="font-semibold mb-4">Recommendations</h3>
                  <div className="space-y-3">
                    {result.recommendations.map((rec, i) => (
                      <p key={i} className="text-sm p-3 bg-muted/50 rounded-lg">{rec}</p>
                    ))}
                  </div>
                </CardContent>
              </Card>
            )}
          </>
        )}
      </div>
    </AppShell>
  );
}
