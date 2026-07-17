"use client";

/**
 * RegLayer — Workflows Page
 *
 * WHY: Automate multi-step compliance processes without writing code.
 * WHAT: Browse available workflows, trigger execution, view results.
 * HOW: Uses the workflow engine (runner + builder + registry) via /api/workflows.
 */

import { useState } from "react";
import { AppShell } from "@/components/layout/app-shell";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import {
  Workflow, Play, Loader2, CheckCircle2, XCircle,
  Shield, FileText, BarChart3, Zap, Clock, PenTool,
} from "lucide-react";
import { toast } from "sonner";
import { FeatureGate } from "@/components/ui/feature-gate";
import Link from "next/link";

interface WorkflowDef {
  id: string;
  name: string;
  description: string;
  steps: number;
}

interface WorkflowResult {
  workflowId: string;
  runId: string;
  status: string;
  completedSteps: string[];
  data: Record<string, unknown>;
}

// Pre-defined workflow catalog (matches the registry)
const WORKFLOW_CATALOG: WorkflowDef[] = [
  {
    id: "compliance-audit",
    name: "Compliance Audit",
    description: "Scan a site, evaluate against WCAG/ADA/EAA standards, and generate a structured compliance report with findings and recommendations.",
    steps: 4,
  },
  {
    id: "remediation-plan",
    name: "Remediation Plan",
    description: "Analyze scan violations, prioritize by impact, and generate a step-by-step remediation plan with code fixes and effort estimates.",
    steps: 3,
  },
  {
    id: "scan-and-report",
    name: "Scan & Report",
    description: "Run a quick scan, summarize the results, and send a notification with the key findings.",
    steps: 3,
  },
];

const WORKFLOW_ICONS: Record<string, typeof Shield> = {
  "compliance-audit": Shield,
  "remediation-plan": Zap,
  "scan-and-report": FileText,
};

function WorkflowsPageInner() {
  const [running, setRunning] = useState<string | null>(null);
  const [result, setResult] = useState<WorkflowResult | null>(null);
  const [urlInput, setUrlInput] = useState("");

  const handleRun = async (workflowId: string) => {
    setRunning(workflowId);
    setResult(null);
    try {
      const res = await fetch("/api/workflows", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          workflowId,
          input: urlInput.trim() ? { url: urlInput.trim() } : {},
        }),
      });
      if (res.ok) {
        const data = await res.json();
        setResult(data);
        toast.success(`${workflowId} completed`);
      } else {
        const data = await res.json().catch(() => ({}));
        toast.error(data.error || "Workflow failed");
      }
    } catch { toast.error("Network error"); }
    finally { setRunning(null); }
  };

  return (
    <AppShell>
      <div className="space-y-6 max-w-4xl mx-auto">
        {/* Header */}
        <div>
          <div className="flex items-center gap-2">
            <div className="p-2 rounded-lg bg-blue-100 dark:bg-blue-900/30">
              <Workflow className="h-5 w-5 text-blue-600 dark:text-blue-400" />
            </div>
            <h1 className="text-2xl font-bold tracking-tight">Workflows</h1>
          </div>
          <p className="text-sm text-muted-foreground mt-1 ml-11">
            Automated multi-step compliance processes. Select a workflow, provide a target URL, and let the AI handle the rest.
          </p>
        </div>
        <Link href="/workflows/builder">
          <Button variant="outline" size="sm">
            <PenTool className="h-3.5 w-3.5 mr-1" /> Visual Builder
          </Button>
        </Link>

        {/* URL Input */}
        <Card>
          <CardContent className="p-4">
            <div className="flex gap-3 items-center">
              <Input
                value={urlInput}
                onChange={(e) => setUrlInput(e.target.value)}
                placeholder="Target URL (optional) — e.g., https://example.com"
                className="flex-1"
              />
              <span className="text-xs text-muted-foreground shrink-0">Select a workflow below</span>
            </div>
          </CardContent>
        </Card>

        {/* Workflow Cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {WORKFLOW_CATALOG.map((wf) => {
            const Icon = WORKFLOW_ICONS[wf.id] ?? BarChart3;
            const isRunning = running === wf.id;

            return (
              <Card key={wf.id} className="flex flex-col">
                <CardHeader className="pb-2">
                  <div className="flex items-center gap-2">
                    <div className="p-1.5 rounded-md bg-blue-50 dark:bg-blue-950/30 text-blue-600 dark:text-blue-400">
                      <Icon className="h-4 w-4" />
                    </div>
                    <CardTitle className="text-sm">{wf.name}</CardTitle>
                  </div>
                  <CardDescription className="text-xs mt-1">{wf.description}</CardDescription>
                </CardHeader>
                <CardContent className="flex-1 flex flex-col justify-end pt-0">
                  <div className="flex items-center justify-between mt-3">
                    <Badge variant="secondary" className="text-[10px]">
                      {wf.steps} steps
                    </Badge>
                    <Button
                      size="sm"
                      onClick={() => handleRun(wf.id)}
                      disabled={isRunning || running !== null}
                    >
                      {isRunning ? (
                        <><Loader2 className="h-3.5 w-3.5 animate-spin mr-1" /> Running...</>
                      ) : (
                        <><Play className="h-3.5 w-3.5 mr-1" /> Run</>
                      )}
                    </Button>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>

        {/* Result */}
        {result && (
          <Card className={result.status === "completed" ? "border-green-200 dark:border-green-800" : "border-red-200 dark:border-red-800"}>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm flex items-center gap-2">
                {result.status === "completed" ? (
                  <CheckCircle2 className="h-4 w-4 text-green-500" />
                ) : (
                  <XCircle className="h-4 w-4 text-red-500" />
                )}
                Workflow Result
              </CardTitle>
              <CardDescription className="text-xs">
                {result.workflowId} · {result.completedSteps.length} steps completed · Run ID: {result.runId.slice(0, 12)}
              </CardDescription>
            </CardHeader>
            <CardContent>
              <pre className="text-xs bg-neutral-50 dark:bg-neutral-900 p-3 rounded-lg overflow-x-auto max-h-80">
                {JSON.stringify(result.data, null, 2)}
              </pre>
            </CardContent>
          </Card>
        )}
      </div>
    </AppShell>
  );
}

export default function WorkflowsPage() {
  return (
    <FeatureGate feature="workflows">
      <WorkflowsPageInner />
    </FeatureGate>
  );
}
