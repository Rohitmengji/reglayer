"use client";

/**
 * RegLayer — Revenue Impact Page
 *
 * WHY: Business stakeholders need ROI justification for accessibility investment.
 * WHAT: Calculates estimated revenue loss from inaccessibility (lost users, legal risk, market size).
 * HOW: Fetches /api/revenue-impact with site traffic data, renders financial impact breakdown.
 */

import { useState } from "react";
import { ModernSelect } from "@/components/ui/modern-select";
import { AppShell } from "@/components/layout/app-shell";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { DollarSign, TrendingDown, AlertTriangle, Shield, Users, BarChart3 } from "lucide-react";
import { useI18n } from "@/components/i18n-provider";

interface RevenueResult {
  estimatedMonthlyLoss: number;
  estimatedAnnualLoss: number;
  affectedPopulationPercent: number;
  unreachableVisitorsMonthly: number;
  breakdown: Record<string, { visitors: number; revenue: number; description: string }>;
  costPerViolation: number;
  industryComparison: { avgScore: number; yourScore: number; competitorEstimate: string };
  legalRisk: { level: string; estimatedLitigationCost: number; lawsuitProbability: string; relevantLaws: string[] };
  recommendations: Array<{ action: string; potentialRecovery: number; effort: string; priority: number }>;
  accessibility: { score: number; totalViolations: number; critical: number; serious: number; moderate: number; minor: number };
}

export default function RevenueImpactPage() {
  const { t } = useI18n();
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<RevenueResult | null>(null);
  const [visitors, setVisitors] = useState("500000");
  const [aov, setAov] = useState("75");
  const [convRate, setConvRate] = useState("3");
  const [region, setRegion] = useState("US");

  async function calculate() {
    setLoading(true);
    try {
      const res = await fetch("/api/revenue-impact", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          traffic: {
            monthlyVisitors: parseInt(visitors),
            averageOrderValue: parseFloat(aov),
            conversionRate: parseFloat(convRate) / 100,
          },
          region,
        }),
      });
      if (res.ok) {
        setResult(await res.json());
      }
    } finally {
      setLoading(false);
    }
  }

  return (
    <AppShell>
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold">{t("revenue.title")}</h1>
          <p className="text-muted-foreground">
            Estimate how much revenue you&apos;re losing due to accessibility barriers.
          </p>
          <p className="text-xs text-amber-600 dark:text-amber-400 mt-1">
            Illustrative model only — based on published disability statistics and your inputs, not measured user behavior. Treat as directional, not exact.
          </p>
        </div>

        {/* Input Form */}
        <Card>
          <CardContent className="pt-6">
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
              <div>
                <label className="text-sm font-medium block mb-1">Monthly Visitors</label>
                <input
                  type="number"
                  value={visitors}
                  onChange={(e) => setVisitors(e.target.value)}
                  className="w-full rounded-md border px-3 py-2 text-sm bg-background"
                />
              </div>
              <div>
                <label className="text-sm font-medium block mb-1">Avg Order Value ($)</label>
                <input
                  type="number"
                  value={aov}
                  onChange={(e) => setAov(e.target.value)}
                  className="w-full rounded-md border px-3 py-2 text-sm bg-background"
                />
              </div>
              <div>
                <label className="text-sm font-medium block mb-1">Conversion Rate (%)</label>
                <input
                  type="number"
                  value={convRate}
                  onChange={(e) => setConvRate(e.target.value)}
                  className="w-full rounded-md border px-3 py-2 text-sm bg-background"
                />
              </div>
              <div>
                <label className="text-sm font-medium block mb-1">Region</label>
                <ModernSelect
              options={[{ value: "US", label: "United States" }, { value: "UK", label: "United Kingdom" }, { value: "EU", label: "European Union" }, { value: "AU", label: "Australia" }, { value: "CA", label: "Canada" }, { value: "GLOBAL", label: "Global" }]}
              value={region}
              onChange={setRegion}
            />
              </div>
            </div>
            <Button onClick={calculate} disabled={loading} className="mt-4">
              {loading ? "Calculating..." : "Calculate Revenue Impact"}
            </Button>
          </CardContent>
        </Card>

        {/* Results */}
        {result && (
          <>
            {/* Key Metrics */}
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
              <Card className="border-red-200 dark:border-red-900">
                <CardContent className="pt-6">
                  <div className="flex items-center gap-2 mb-2">
                    <DollarSign className="h-5 w-5 text-red-500" />
                    <span className="text-sm text-muted-foreground">Est. Monthly Loss</span>
                  </div>
                  <p className="text-3xl font-bold text-red-600">
                    ${result.estimatedMonthlyLoss.toLocaleString()}
                  </p>
                </CardContent>
              </Card>
              <Card className="border-red-200 dark:border-red-900">
                <CardContent className="pt-6">
                  <div className="flex items-center gap-2 mb-2">
                    <TrendingDown className="h-5 w-5 text-red-500" />
                    <span className="text-sm text-muted-foreground">Est. Annual Loss</span>
                  </div>
                  <p className="text-3xl font-bold text-red-600">
                    ${result.estimatedAnnualLoss.toLocaleString()}
                  </p>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="pt-6">
                  <div className="flex items-center gap-2 mb-2">
                    <Users className="h-5 w-5 text-orange-500" />
                    <span className="text-sm text-muted-foreground">Unreachable Users/mo</span>
                  </div>
                  <p className="text-3xl font-bold">
                    {result.unreachableVisitorsMonthly.toLocaleString()}
                  </p>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="pt-6">
                  <div className="flex items-center gap-2 mb-2">
                    <BarChart3 className="h-5 w-5 text-blue-500" />
                    <span className="text-sm text-muted-foreground">Score vs. Baseline</span>
                  </div>
                  <p className="text-3xl font-bold">
                    {result.industryComparison.yourScore}
                    <span className="text-base font-normal text-muted-foreground"> / {result.industryComparison.avgScore} avg</span>
                  </p>
                  <p className="text-xs text-muted-foreground mt-1">{result.industryComparison.competitorEstimate}</p>
                </CardContent>
              </Card>
            </div>

            {/* Breakdown */}
            <Card>
              <CardContent className="pt-6">
                <h3 className="font-semibold mb-4">Loss Breakdown by Severity</h3>
                <div className="space-y-3">
                  {Object.entries(result.breakdown).map(([severity, data]) => (
                    <div key={severity} className="flex items-center justify-between p-3 rounded-lg bg-muted/50">
                      <div>
                        <span className="font-medium capitalize">{severity}</span>
                        <p className="text-xs text-muted-foreground">{data.description}</p>
                      </div>
                      <div className="text-right">
                        <p className="font-bold">${data.revenue.toLocaleString()}</p>
                        <p className="text-xs text-muted-foreground">{data.visitors.toLocaleString()} users affected</p>
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>

            {/* Legal Risk + Recommendations */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <Card>
                <CardContent className="pt-6">
                  <div className="flex items-center gap-2 mb-4">
                    <Shield className="h-5 w-5" />
                    <h3 className="font-semibold">Legal Risk Assessment</h3>
                  </div>
                  <p className="text-[11px] text-amber-600 dark:text-amber-400 mb-3">Directional estimate from published ADA filing data — not legal advice.</p>
                  <div className="space-y-2">
                    <div className="flex justify-between">
                      <span>Risk Level</span>
                      <span className={`font-bold capitalize ${result.legalRisk.level === "high" ? "text-red-500" : result.legalRisk.level === "medium" ? "text-yellow-500" : "text-green-500"}`}>
                        {result.legalRisk.level}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span>Lawsuit Probability</span>
                      <span>{result.legalRisk.lawsuitProbability}</span>
                    </div>
                    <div className="flex justify-between">
                      <span>Relevant Laws</span>
                      <span>{result.legalRisk.relevantLaws.join(", ")}</span>
                    </div>
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardContent className="pt-6">
                  <div className="flex items-center gap-2 mb-4">
                    <AlertTriangle className="h-5 w-5" />
                    <h3 className="font-semibold">Recommendations</h3>
                  </div>
                  <div className="space-y-3">
                    {result.recommendations.map((rec, i) => (
                      <div key={i} className="p-3 rounded-lg bg-muted/50">
                        <p className="text-sm font-medium">{rec.action}</p>
                        <div className="flex gap-4 mt-1 text-xs text-muted-foreground">
                          <span>Recovery: ${rec.potentialRecovery.toLocaleString()}</span>
                          <span>Effort: {rec.effort}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            </div>
          </>
        )}
      </div>
    </AppShell>
  );
}
