"use client";

import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { AccessibilityViolation } from "@/lib/types";
import { AlertTriangle, ExternalLink, CheckCircle2, Clock, XCircle, MinusCircle } from "lucide-react";

interface ViolationCardProps {
  violation: AccessibilityViolation;
}

export function ViolationCard({ violation }: ViolationCardProps) {
  return (
    <Card className="border-l-4 border-l-transparent" style={{
      borderLeftColor: getImpactColor(violation.impact),
    }}>
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between gap-4">
          <div className="flex items-start gap-3">
            <AlertTriangle
              className="mt-0.5 h-4 w-4 shrink-0"
              style={{ color: getImpactColor(violation.impact) }}
            />
            <div>
              <CardTitle className="text-sm font-medium">
                {violation.help}
              </CardTitle>
              <p className="mt-1 text-xs text-neutral-500">
                {violation.description}
              </p>
            </div>
          </div>
          <Badge variant={violation.impact}>
            {violation.impact}
          </Badge>
        </div>
      </CardHeader>
      <CardContent>
        {/* WCAG Tags */}
        <div className="mb-3 flex flex-wrap gap-1">
          {violation.wcagTags.map((tag) => (
            <Badge key={tag} variant="outline" className="text-xs">
              {tag}
            </Badge>
          ))}
        </div>

        {/* Affected Nodes */}
        <div className="space-y-2">
          <p className="text-xs font-medium text-neutral-700">
            Affected Elements ({violation.nodes.length})
          </p>
          {violation.nodes.slice(0, 3).map((node, i) => (
            <div
              key={i}
              className="rounded-md bg-neutral-50 p-2 font-mono text-xs"
            >
              <code className="text-neutral-700">{node.html}</code>
              {node.failureSummary && (
                <p className="mt-1 font-sans text-neutral-500">
                  {node.failureSummary}
                </p>
              )}
            </div>
          ))}
          {violation.nodes.length > 3 && (
            <p className="text-xs text-neutral-500">
              +{violation.nodes.length - 3} more elements
            </p>
          )}
        </div>

        {/* Help Link + Remediation */}
        <div className="mt-3 flex items-center justify-between">
          <a
            href={violation.helpUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 text-xs text-blue-600 hover:underline"
          >
            Learn more
            <ExternalLink className="h-3 w-3" />
          </a>
          <RemediationStatus violationId={violation.id} />
        </div>
      </CardContent>
    </Card>
  );
}

const STATUS_OPTIONS = [
  { value: "open", label: "Open", icon: AlertTriangle, color: "text-neutral-500" },
  { value: "in-progress", label: "In Progress", icon: Clock, color: "text-blue-600" },
  { value: "fixed", label: "Fixed", icon: CheckCircle2, color: "text-green-600" },
  { value: "ignored", label: "Ignored", icon: MinusCircle, color: "text-neutral-400" },
  { value: "wont-fix", label: "Won't Fix", icon: XCircle, color: "text-red-400" },
] as const;

function RemediationStatus({ violationId }: { violationId: string }) {
  const [status, setStatus] = useState("open");
  const [open, setOpen] = useState(false);

  async function handleChange(newStatus: string) {
    setStatus(newStatus);
    setOpen(false);
    await fetch("/api/violations/status", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ violationId, status: newStatus }),
    }).catch(() => {});
  }

  const current = STATUS_OPTIONS.find((s) => s.value === status) || STATUS_OPTIONS[0];
  const Icon = current.icon;

  return (
    <div className="relative">
      <button
        onClick={() => setOpen(!open)}
        className={`inline-flex items-center gap-1.5 rounded-md border border-neutral-200 px-2 py-1 text-xs font-medium transition-colors hover:bg-neutral-50 ${current.color}`}
      >
        <Icon className="h-3 w-3" />
        {current.label}
      </button>
      {open && (
        <div className="absolute right-0 top-full mt-1 z-50 rounded-lg border border-neutral-200 bg-white shadow-lg py-1 min-w-[140px]">
          {STATUS_OPTIONS.map((opt) => {
            const OptIcon = opt.icon;
            return (
              <button
                key={opt.value}
                onClick={() => handleChange(opt.value)}
                className={`flex w-full items-center gap-2 px-3 py-1.5 text-xs hover:bg-neutral-50 ${opt.color}`}
              >
                <OptIcon className="h-3 w-3" />
                {opt.label}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

function getImpactColor(impact: string): string {
  switch (impact) {
    case "critical":
      return "#dc2626";
    case "serious":
      return "#ea580c";
    case "moderate":
      return "#ca8a04";
    case "minor":
      return "#2563eb";
    default:
      return "#6b7280";
  }
}
