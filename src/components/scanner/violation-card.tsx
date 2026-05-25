"use client";

import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { AccessibilityViolation } from "@/lib/types";
import { AlertTriangle, ExternalLink } from "lucide-react";

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

        {/* Help Link */}
        <a
          href={violation.helpUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="mt-3 inline-flex items-center gap-1 text-xs text-blue-600 hover:underline"
        >
          Learn more
          <ExternalLink className="h-3 w-3" />
        </a>
      </CardContent>
    </Card>
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
