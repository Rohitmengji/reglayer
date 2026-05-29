"use client";

/**
 * RegLayer — Accessibility Intelligence Score (AIS) Page
 *
 * WHY: A visual, shareable breakdown of multi-dimensional accessibility health.
 *      Goes far beyond "score: 73" — shows WHO is blocked, WHERE the risk is,
 *      and WHAT to fix for maximum impact.
 *
 * WHAT: Radar chart + dimension cards + population impact + improvement simulator.
 * HOW: Fetches /api/score?scanId=id&history=true, renders purely client-side SVG.
 */

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { AppShell } from "@/components/layout/app-shell";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Shield, Users, TrendingUp, Layers, Scale, Monitor,
  ArrowUp, Zap, AlertTriangle, ChevronRight,
} from "lucide-react";
import type { AISResult, DimensionScore } from "@/lib/intelligence/ais-engine";

interface ScoreData {
  scanId: string;
  url: string;
  scannedAt: string;
  ais: AISResult;
}

export default function AISScorePage() {
  const params = useParams();
  const scanId = params.id as string;
  const [data, setData] = useState<ScoreData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch(`/api/score?scanId=${scanId}&history=true`)
      .then((r) => {
        if (!r.ok) throw new Error(r.status === 404 ? "Scan not found" : "Failed to load score");
        return r.json();
      })
      .then(setData)
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, [scanId]);

  if (loading) {
    return (
      <AppShell>
        <div className="flex items-center justify-center min-h-[60vh]">
          <div className="animate-pulse text-neutral-500">Computing Intelligence Score...</div>
        </div>
      </AppShell>
    );
  }

  if (error || !data) {
    return (
      <AppShell>
        <div className="flex items-center justify-center min-h-[60vh]">
          <p className="text-red-500">{error || "Score unavailable"}</p>
        </div>
      </AppShell>
    );
  }

  const { ais } = data;

  return (
    <AppShell>
      <div className="max-w-6xl mx-auto space-y-8 pb-12">
        {/* Header */}
        <div className="flex flex-col md:flex-row md:items-end md:justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-neutral-900 dark:text-white">
              Accessibility Intelligence Score
            </h1>
            <p className="text-sm text-neutral-500 mt-1 truncate max-w-md">{data.url}</p>
          </div>
          <div className="text-sm text-neutral-400">
            Scanned {new Date(data.scannedAt).toLocaleDateString()}
          </div>
        </div>

        {/* Hero Score */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <Card className="lg:col-span-1 border-2 border-neutral-200 dark:border-neutral-700">
            <CardContent className="flex flex-col items-center justify-center py-10">
              <div className="relative">
                <ScoreRing score={ais.score} maxScore={850} size={180} />
                <div className="absolute inset-0 flex flex-col items-center justify-center">
                  <span className={`text-4xl font-bold ${gradeColor(ais.grade)}`}>
                    {ais.score}
                  </span>
                  <span className="text-xs text-neutral-500 mt-1">/ 850</span>
                </div>
              </div>
              <div className="mt-4 text-center">
                <Badge className={`text-lg px-4 py-1 ${gradeBadgeColor(ais.grade)}`}>
                  {ais.grade}
                </Badge>
                <p className="text-sm text-neutral-500 mt-2">{ais.label}</p>
              </div>
              {ais.projectedScore > ais.score && (
                <div className="mt-4 flex items-center gap-2 text-sm text-green-600">
                  <ArrowUp className="h-4 w-4" />
                  <span>Fix top 3 → {ais.projectedScore} pts</span>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Radar Chart */}
          <Card className="lg:col-span-2">
            <CardHeader>
              <CardTitle className="text-base">Dimension Breakdown</CardTitle>
            </CardHeader>
            <CardContent className="flex items-center justify-center">
              <RadarChart dimensions={ais.dimensions} />
            </CardContent>
          </Card>
        </div>

        {/* Dimension Cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          <DimensionCard
            icon={<Shield className="h-5 w-5" />}
            title="Barrier Severity"
            dimension={ais.dimensions.barrierSeverity}
            weight="25%"
            color="text-red-500"
          />
          <DimensionCard
            icon={<Users className="h-5 w-5" />}
            title="Population Reach"
            dimension={ais.dimensions.populationReach}
            weight="20%"
            color="text-purple-500"
          />
          <DimensionCard
            icon={<TrendingUp className="h-5 w-5" />}
            title="Temporal Velocity"
            dimension={ais.dimensions.temporalVelocity}
            weight="15%"
            color="text-blue-500"
          />
          <DimensionCard
            icon={<Layers className="h-5 w-5" />}
            title="Structural Depth"
            dimension={ais.dimensions.structuralDepth}
            weight="15%"
            color="text-amber-500"
          />
          <DimensionCard
            icon={<Scale className="h-5 w-5" />}
            title="Regulatory Exposure"
            dimension={ais.dimensions.regulatoryExposure}
            weight="15%"
            color="text-orange-500"
          />
          <DimensionCard
            icon={<Monitor className="h-5 w-5" />}
            title="AT Compatibility"
            dimension={ais.dimensions.assistiveTechCompat}
            weight="10%"
            color="text-teal-500"
          />
        </div>

        {/* Population Impact */}
        {ais.populationsAffected.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <AlertTriangle className="h-5 w-5 text-amber-500" />
                Population Impact
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                {ais.populationsAffected.map((pop) => (
                  <div
                    key={pop.population}
                    className="flex items-center justify-between p-3 rounded-lg border border-neutral-200 dark:border-neutral-700"
                  >
                    <div>
                      <p className="text-sm font-medium capitalize">
                        {pop.population.replace("-", " ")}
                      </p>
                      <p className="text-xs text-neutral-500">
                        ~{formatNumber(pop.estimatedBlocked)} affected
                      </p>
                    </div>
                    <Badge
                      className={
                        pop.severity === "full-block"
                          ? "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400"
                          : pop.severity === "partial-block"
                          ? "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400"
                          : "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400"
                      }
                    >
                      {pop.severity.replace("-", " ")}
                    </Badge>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        )}

        {/* Improvement Simulator */}
        {ais.improvements.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <Zap className="h-5 w-5 text-green-500" />
                Improvement Actions (ranked by efficiency)
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                {ais.improvements.slice(0, 5).map((action, i) => (
                  <div
                    key={`${action.ruleId}-${i}`}
                    className="flex items-center gap-3 p-3 rounded-lg border border-neutral-200 dark:border-neutral-700 hover:bg-neutral-50 dark:hover:bg-neutral-800/50 transition-colors"
                  >
                    <div className="flex items-center justify-center w-8 h-8 rounded-full bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400 text-sm font-bold shrink-0">
                      +{action.pointGain}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate">{action.description}</p>
                      <p className="text-xs text-neutral-500">
                        {action.affectedElements} element{action.affectedElements !== 1 ? "s" : ""} · {action.effort} effort
                      </p>
                    </div>
                    <Badge
                      className={
                        action.impact === "critical"
                          ? "bg-red-100 text-red-700"
                          : action.impact === "serious"
                          ? "bg-orange-100 text-orange-700"
                          : "bg-yellow-100 text-yellow-700"
                      }
                    >
                      {action.impact}
                    </Badge>
                    <ChevronRight className="h-4 w-4 text-neutral-400 shrink-0" />
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    </AppShell>
  );
}

// ─────────────── Sub-Components ───────────────

function DimensionCard({
  icon,
  title,
  dimension,
  weight,
  color,
}: {
  icon: React.ReactNode;
  title: string;
  dimension: DimensionScore;
  weight: string;
  color: string;
}) {
  const percent = Math.round((dimension.score / 850) * 100);

  return (
    <Card>
      <CardContent className="pt-5 pb-4">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <span className={color}>{icon}</span>
            <span className="text-sm font-medium">{title}</span>
          </div>
          <span className="text-xs text-neutral-400">{weight}</span>
        </div>
        <div className="flex items-end justify-between mb-2">
          <span className="text-2xl font-bold">{dimension.score}</span>
          <span className="text-xs text-neutral-500">{dimension.label}</span>
        </div>
        <div className="w-full h-2 rounded-full bg-neutral-200 dark:bg-neutral-700 overflow-hidden">
          <div
            className={`h-full rounded-full transition-all duration-500 ${barColor(percent)}`}
            style={{ width: `${percent}%` }}
          />
        </div>
        <p className="text-xs text-neutral-500 mt-2">{dimension.detail}</p>
      </CardContent>
    </Card>
  );
}

function ScoreRing({ score, maxScore, size }: { score: number; maxScore: number; size: number }) {
  const strokeWidth = 12;
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const progress = Math.min(score / maxScore, 1);
  const offset = circumference * (1 - progress);
  const color = score >= 650 ? "#16a34a" : score >= 450 ? "#ca8a04" : "#dc2626";

  return (
    <svg width={size} height={size} className="transform -rotate-90">
      <circle
        cx={size / 2}
        cy={size / 2}
        r={radius}
        fill="none"
        stroke="currentColor"
        strokeWidth={strokeWidth}
        className="text-neutral-200 dark:text-neutral-700"
      />
      <circle
        cx={size / 2}
        cy={size / 2}
        r={radius}
        fill="none"
        stroke={color}
        strokeWidth={strokeWidth}
        strokeDasharray={circumference}
        strokeDashoffset={offset}
        strokeLinecap="round"
        className="transition-all duration-1000"
      />
    </svg>
  );
}

function RadarChart({ dimensions }: { dimensions: AISResult["dimensions"] }) {
  const size = 300;
  const center = size / 2;
  const maxRadius = 120;

  const labels = [
    { key: "barrierSeverity", label: "Barriers", short: "BS" },
    { key: "populationReach", label: "Population", short: "PR" },
    { key: "temporalVelocity", label: "Velocity", short: "TV" },
    { key: "structuralDepth", label: "Structure", short: "SD" },
    { key: "regulatoryExposure", label: "Regulatory", short: "RE" },
    { key: "assistiveTechCompat", label: "AT Compat", short: "AT" },
  ];

  const angleStep = (2 * Math.PI) / labels.length;

  // Calculate polygon points for the score
  const points = labels.map((l, i) => {
    const dim = dimensions[l.key as keyof typeof dimensions];
    const ratio = dim.score / 850;
    const angle = i * angleStep - Math.PI / 2;
    const x = center + ratio * maxRadius * Math.cos(angle);
    const y = center + ratio * maxRadius * Math.sin(angle);
    return { x, y };
  });

  const polygonPoints = points.map((p) => `${p.x},${p.y}`).join(" ");

  // Grid rings
  const rings = [0.25, 0.5, 0.75, 1.0];

  return (
    <svg width={size} height={size} className="overflow-visible">
      {/* Grid rings */}
      {rings.map((r) => (
        <polygon
          key={r}
          points={labels
            .map((_, i) => {
              const angle = i * angleStep - Math.PI / 2;
              return `${center + r * maxRadius * Math.cos(angle)},${center + r * maxRadius * Math.sin(angle)}`;
            })
            .join(" ")}
          fill="none"
          stroke="currentColor"
          strokeWidth={0.5}
          className="text-neutral-300 dark:text-neutral-600"
        />
      ))}

      {/* Axis lines */}
      {labels.map((_, i) => {
        const angle = i * angleStep - Math.PI / 2;
        const x = center + maxRadius * Math.cos(angle);
        const y = center + maxRadius * Math.sin(angle);
        return (
          <line
            key={i}
            x1={center}
            y1={center}
            x2={x}
            y2={y}
            stroke="currentColor"
            strokeWidth={0.5}
            className="text-neutral-300 dark:text-neutral-600"
          />
        );
      })}

      {/* Score polygon */}
      <polygon
        points={polygonPoints}
        fill="rgba(99, 102, 241, 0.15)"
        stroke="rgb(99, 102, 241)"
        strokeWidth={2}
        strokeLinejoin="round"
      />

      {/* Data points */}
      {points.map((p, i) => (
        <circle key={i} cx={p.x} cy={p.y} r={4} fill="rgb(99, 102, 241)" />
      ))}

      {/* Labels */}
      {labels.map((l, i) => {
        const angle = i * angleStep - Math.PI / 2;
        const labelRadius = maxRadius + 20;
        const x = center + labelRadius * Math.cos(angle);
        const y = center + labelRadius * Math.sin(angle);
        return (
          <text
            key={l.key}
            x={x}
            y={y}
            textAnchor="middle"
            dominantBaseline="middle"
            className="text-xs fill-neutral-500 dark:fill-neutral-400"
            fontSize={11}
          >
            {l.label}
          </text>
        );
      })}
    </svg>
  );
}

// ─────────────── Helpers ───────────────

function gradeColor(grade: string): string {
  switch (grade) {
    case "A+": return "text-green-600";
    case "A": return "text-green-500";
    case "B": return "text-yellow-600";
    case "C": return "text-orange-500";
    case "D": return "text-red-500";
    default: return "text-red-700";
  }
}

function gradeBadgeColor(grade: string): string {
  switch (grade) {
    case "A+": return "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400";
    case "A": return "bg-green-100 text-green-600 dark:bg-green-900/30 dark:text-green-400";
    case "B": return "bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400";
    case "C": return "bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400";
    case "D": return "bg-red-100 text-red-600 dark:bg-red-900/30 dark:text-red-400";
    default: return "bg-red-200 text-red-800 dark:bg-red-900/40 dark:text-red-400";
  }
}

function barColor(percent: number): string {
  if (percent >= 75) return "bg-green-500";
  if (percent >= 50) return "bg-yellow-500";
  if (percent >= 25) return "bg-orange-500";
  return "bg-red-500";
}

function formatNumber(n: number): string {
  if (n >= 1_000_000_000) return `${(n / 1_000_000_000).toFixed(1)}B`;
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return n.toString();
}
