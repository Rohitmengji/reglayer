"use client";

import { useEffect, useState } from "react";
import { AppShell } from "@/components/layout/app-shell";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { TrendingUp, Users, Scan, ArrowRight, Loader2 } from "lucide-react";

interface FunnelData {
  period: string;
  funnel: {
    demoScans: number;
    signupStarted: number;
    signupCompleted: number;
    firstScans: number;
  };
  conversion: {
    demoToSignup: string;
    uniqueDemoVisitors: number;
    converted: number;
  };
  breakdown: { event: string; count: number }[];
}

export default function ConversionsPage() {
  const [data, setData] = useState<FunnelData | null>(null);
  const [loading, setLoading] = useState(true);
  const [period, setPeriod] = useState(30);

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/conversion?days=${period}`)
      .then((r) => r.json())
      .then((d) => { if (!cancelled) setData(d); })
      .catch(() => {})
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [period]);

  return (
    <AppShell>
      <div className="p-6 max-w-5xl mx-auto space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-neutral-900 dark:text-white">Conversion Funnel</h1>
            <p className="text-sm text-neutral-500 mt-1">Demo scan → Signup → First scan pipeline</p>
          </div>
          <div className="flex gap-1 rounded-lg border border-neutral-200 dark:border-neutral-700 p-1">
            {[7, 30, 90].map((d) => (
              <button
                key={d}
                onClick={() => setPeriod(d)}
                className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${
                  period === d
                    ? "bg-neutral-900 text-white dark:bg-white dark:text-neutral-900"
                    : "text-neutral-600 dark:text-neutral-400 hover:bg-neutral-100 dark:hover:bg-neutral-800"
                }`}
              >
                {d}d
              </button>
            ))}
          </div>
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-20">
            <Loader2 className="h-6 w-6 animate-spin text-neutral-500 dark:text-neutral-400" />
          </div>
        ) : data ? (
          <>
            {/* Conversion Rate Hero */}
            <Card className="border-2 border-green-200 dark:border-green-800 bg-green-50/50 dark:bg-green-950/20">
              <CardContent className="pt-6">
                <div className="flex items-center gap-4">
                  <div className="flex h-14 w-14 items-center justify-center rounded-full bg-green-100 dark:bg-green-900">
                    <TrendingUp className="h-7 w-7 text-green-600 dark:text-green-400" />
                  </div>
                  <div>
                    <p className="text-3xl font-bold text-green-700 dark:text-green-400">{data.conversion.demoToSignup}</p>
                    <p className="text-sm text-green-600 dark:text-green-500">Demo → Signup Conversion Rate</p>
                  </div>
                  <div className="ml-auto text-right">
                    <p className="text-sm text-neutral-500">{data.conversion.uniqueDemoVisitors} unique demo visitors</p>
                    <p className="text-sm text-neutral-500">{data.conversion.converted} converted to signup</p>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Funnel Steps */}
            <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
              {[
                { label: "Demo Scans", value: data.funnel.demoScans, icon: Scan, color: "text-blue-500" },
                { label: "Signup Started", value: data.funnel.signupStarted, icon: Users, color: "text-yellow-500" },
                { label: "Signup Completed", value: data.funnel.signupCompleted, icon: Users, color: "text-green-500" },
                { label: "First Full Scan", value: data.funnel.firstScans, icon: ArrowRight, color: "text-purple-500" },
              ].map((step, i) => (
                <Card key={step.label}>
                  <CardContent className="pt-5 pb-4">
                    <div className="flex items-center gap-3">
                      <step.icon className={`h-5 w-5 ${step.color}`} />
                      <div>
                        <p className="text-2xl font-bold text-neutral-900 dark:text-white">{step.value}</p>
                        <p className="text-xs text-neutral-500">{step.label}</p>
                      </div>
                    </div>
                    {i < 3 && data.funnel.demoScans > 0 && (
                      <div className="mt-3 h-1.5 rounded-full bg-neutral-100 dark:bg-neutral-800 overflow-hidden">
                        <div
                          className={`h-full rounded-full ${
                            i === 0 ? "bg-blue-500" : i === 1 ? "bg-yellow-500" : "bg-green-500"
                          }`}
                          style={{ width: `${Math.min(100, (step.value / data.funnel.demoScans) * 100)}%` }}
                        />
                      </div>
                    )}
                  </CardContent>
                </Card>
              ))}
            </div>

            {/* Event Breakdown */}
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Event Breakdown</CardTitle>
              </CardHeader>
              <CardContent>
                {data.breakdown.length === 0 ? (
                  <p className="text-sm text-neutral-500">No events recorded yet. Events will appear after users interact with the demo scan and signup flow.</p>
                ) : (
                  <div className="space-y-3">
                    {data.breakdown.map((item) => (
                      <div key={item.event} className="flex items-center justify-between">
                        <span className="text-sm font-mono text-neutral-700 dark:text-neutral-300">{item.event}</span>
                        <span className="text-sm font-bold text-neutral-900 dark:text-white">{item.count}</span>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </>
        ) : (
          <p className="text-center text-neutral-500 py-12">Failed to load data</p>
        )}
      </div>
    </AppShell>
  );
}
