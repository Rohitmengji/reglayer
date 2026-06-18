"use client";

/**
 * RegLayer — Real User Monitoring Page
 *
 * WHY: Automated scans miss issues that only appear in real user interactions.
 * WHAT: Shows RUM data: keyboard navigation failures, focus traps, ARIA errors from real sessions.
 * HOW: Fetches /api/rum/events for aggregated data, renders timeline and heatmap visualizations.
 */

import { useState, useEffect } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Activity,
  Eye,
  AlertTriangle,
  Smartphone,
  Monitor,
  Tablet,
  Copy,
  Check,
  Radio,
} from "lucide-react";
import { useI18n } from "@/components/i18n-provider";

interface RumAggregation {
  siteId: string;
  period: string;
  totalSessions: number;
  totalEvents: number;
  barriersByType: Record<string, number>;
  topPages: { page: string; eventCount: number }[];
  topSelectors: { selector: string; type: string; count: number }[];
  impactScore: number;
  deviceBreakdown: { desktop: number; mobile: number; tablet: number };
  assistiveTechUsers: number;
}

interface RumEvent {
  type: string;
  selector: string;
  page: string;
  timestamp: number;
  sessionId: string;
  details?: Record<string, unknown>;
}

const BARRIER_LABELS: Record<string, string> = {
  "focus-trap": "Focus Traps",
  "keyboard-nav-failure": "Keyboard Failures",
  "missing-label": "Missing Labels",
  "low-contrast-interaction": "Low Contrast",
  "missing-alt-interaction": "Missing Alt Text",
  "aria-error": "ARIA Errors",
  "screen-reader-issue": "Screen Reader Issues",
  "touch-target-small": "Small Touch Targets",
  "animation-no-reduce": "Motion Violations",
};

const BARRIER_COLORS: Record<string, string> = {
  "focus-trap": "bg-red-500",
  "keyboard-nav-failure": "bg-orange-500",
  "missing-label": "bg-yellow-500",
  "low-contrast-interaction": "bg-purple-500",
  "missing-alt-interaction": "bg-blue-500",
  "aria-error": "bg-pink-500",
  "screen-reader-issue": "bg-red-600",
  "touch-target-small": "bg-amber-500",
  "animation-no-reduce": "bg-teal-500",
};

export default function RumPage() {
  const { t } = useI18n();
  const [data, setData] = useState<{
    aggregation: RumAggregation;
    recentEvents: RumEvent[];
    snippet: string;
  } | null>(null);
  const [period, setPeriod] = useState<"hour" | "day" | "week">("day");
  const [loading, setLoading] = useState(true);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    fetch(`/api/rum/events?period=${period}`)
      .then((res) => res.ok ? res.json() : Promise.reject())
      .then((d) => setData(d))
      .catch(() => { /* ignore */ })
      .finally(() => setLoading(false));
  }, [period]);

  function copySnippet() {
    const snippet = `<script src="${data?.snippet || `${window.location.origin}/api/rum/snippet?key=YOUR_SITE_KEY`}" async></script>`;
    navigator.clipboard.writeText(snippet);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  const agg = data?.aggregation;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">{t("rum.title")}</h1>
        <p className="text-muted-foreground">
          Detect accessibility barriers as real users encounter them in production.
        </p>
        <p className="text-xs text-neutral-500 dark:text-neutral-400 mt-1">
          Requires embedding a ~3 KB JavaScript snippet on your site. No data appears until the snippet is installed and visitors interact with your pages.
        </p>
      </div>

      {/* Snippet embed section */}
      <Card className="p-4 border-dashed border-2">
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-2">
            <Radio className="h-4 w-4 text-green-500" />
            <span className="font-medium text-sm">Embed Snippet</span>
          </div>
          <Button variant="outline" size="sm" onClick={copySnippet}>
            {copied ? <Check className="h-3 w-3 mr-1" /> : <Copy className="h-3 w-3 mr-1" />}
            {copied ? "Copied!" : "Copy"}
          </Button>
        </div>
        <code className="text-xs bg-muted p-2 rounded block overflow-x-auto">
          {`<script src="${data?.snippet || "/api/rum/snippet?key=YOUR_SITE_KEY"}" async></script>`}
        </code>
        <p className="text-xs text-muted-foreground mt-2">
          Add this to your site&apos;s &lt;head&gt;. The ~3KB script detects focus traps, keyboard failures, missing labels, and more.
        </p>
      </Card>

      {/* Period selector */}
      <div className="flex gap-2">
        {(["hour", "day", "week"] as const).map((p) => (
          <Button
            key={p}
            variant={period === p ? "default" : "outline"}
            size="sm"
            onClick={() => setPeriod(p)}
          >
            Last {p === "hour" ? "Hour" : p === "day" ? "24h" : "7 Days"}
          </Button>
        ))}
      </div>

      {loading ? (
        <div className="text-center py-12 text-muted-foreground">Loading RUM data...</div>
      ) : !agg || agg.totalEvents === 0 ? (
        <Card className="p-8 text-center">
          <Activity className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
          <h3 className="font-medium text-lg">No events yet</h3>
          <p className="text-muted-foreground text-sm mt-1">
            Embed the snippet above on your site to start collecting accessibility barrier data.
          </p>
        </Card>
      ) : (
        <>
          {/* Summary cards */}
          <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
            <Card className="p-4 text-center">
              <AlertTriangle className="h-5 w-5 mx-auto text-red-500 mb-1" />
              <p className="text-2xl font-bold">{agg.impactScore}</p>
              <p className="text-xs text-muted-foreground">Impact Score</p>
            </Card>
            <Card className="p-4 text-center">
              <Activity className="h-5 w-5 mx-auto text-blue-500 mb-1" />
              <p className="text-2xl font-bold">{agg.totalEvents}</p>
              <p className="text-xs text-muted-foreground">Barriers Detected</p>
            </Card>
            <Card className="p-4 text-center">
              <Eye className="h-5 w-5 mx-auto text-green-500 mb-1" />
              <p className="text-2xl font-bold">{agg.totalSessions}</p>
              <p className="text-xs text-muted-foreground">Sessions</p>
            </Card>
            <Card className="p-4 text-center">
              <div className="flex justify-center gap-1 mb-1">
                <Monitor className="h-4 w-4" />
                <Smartphone className="h-4 w-4" />
                <Tablet className="h-4 w-4" />
              </div>
              <p className="text-2xl font-bold">
                {agg.deviceBreakdown.desktop + agg.deviceBreakdown.mobile + agg.deviceBreakdown.tablet}
              </p>
              <p className="text-xs text-muted-foreground">Device Events</p>
            </Card>
            <Card className="p-4 text-center">
              <Eye className="h-5 w-5 mx-auto text-purple-500 mb-1" />
              <p className="text-2xl font-bold">{agg.assistiveTechUsers}</p>
              <p className="text-xs text-muted-foreground">AT Users</p>
            </Card>
          </div>

          {/* Barriers by type */}
          <Card className="p-4">
            <h3 className="font-medium mb-3">Barriers by Type</h3>
            <div className="space-y-2">
              {Object.entries(agg.barriersByType)
                .sort(([, a], [, b]) => b - a)
                .map(([type, count]) => {
                  const max = Math.max(...Object.values(agg.barriersByType));
                  return (
                    <div key={type} className="flex items-center gap-3">
                      <span className="text-xs w-40 truncate">
                        {BARRIER_LABELS[type] || type}
                      </span>
                      <div className="flex-1 h-4 bg-muted rounded overflow-hidden">
                        <div
                          className={`h-full ${BARRIER_COLORS[type] || "bg-gray-500"} rounded`}
                          style={{ width: `${(count / max) * 100}%` }}
                        />
                      </div>
                      <span className="text-xs font-mono w-8 text-right">{count}</span>
                    </div>
                  );
                })}
            </div>
          </Card>

          {/* Top affected pages */}
          {agg.topPages.length > 0 && (
            <Card className="p-4">
              <h3 className="font-medium mb-3">Top Affected Pages</h3>
              <div className="space-y-2">
                {agg.topPages.slice(0, 8).map((p, i) => (
                  <div key={i} className="flex items-center justify-between text-sm">
                    <span className="truncate max-w-[70%] text-muted-foreground">{p.page}</span>
                    <Badge variant="secondary">{p.eventCount} events</Badge>
                  </div>
                ))}
              </div>
            </Card>
          )}

          {/* Top selectors */}
          {agg.topSelectors.length > 0 && (
            <Card className="p-4">
              <h3 className="font-medium mb-3">Most Problematic Elements</h3>
              <div className="space-y-2">
                {agg.topSelectors.slice(0, 10).map((s, i) => (
                  <div key={i} className="flex items-center justify-between text-sm">
                    <div className="flex items-center gap-2">
                      <code className="text-xs bg-muted px-1 rounded truncate max-w-50">
                        {s.selector}
                      </code>
                      <Badge variant="outline" className="text-[10px]">
                        {BARRIER_LABELS[s.type] || s.type}
                      </Badge>
                    </div>
                    <span className="text-xs text-muted-foreground">{s.count}×</span>
                  </div>
                ))}
              </div>
            </Card>
          )}

          {/* Recent events */}
          {data?.recentEvents && data.recentEvents.length > 0 && (
            <Card className="p-4">
              <h3 className="font-medium mb-3">Recent Events</h3>
              <div className="space-y-1 max-h-64 overflow-y-auto">
                {data.recentEvents.slice(0, 20).map((ev, i) => (
                  <div
                    key={i}
                    className="flex items-center gap-2 text-xs py-1 border-b last:border-0"
                  >
                    <span
                      className={`w-2 h-2 rounded-full ${BARRIER_COLORS[ev.type] || "bg-gray-400"}`}
                    />
                    <span className="font-mono truncate max-w-30">{ev.selector}</span>
                    <Badge variant="outline" className="text-[10px]">
                      {BARRIER_LABELS[ev.type] || ev.type}
                    </Badge>
                    <span className="text-muted-foreground ml-auto">
                      {new Date(ev.timestamp).toLocaleTimeString()}
                    </span>
                  </div>
                ))}
              </div>
            </Card>
          )}
        </>
      )}
    </div>
  );
}
