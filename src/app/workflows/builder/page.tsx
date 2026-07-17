"use client";

/**
 * RegLayer — Visual Workflow Builder
 *
 * WHY: Let users visually design multi-step compliance automation flows
 *      without writing code — drag nodes, connect edges, configure steps.
 * WHAT: Canvas-based workflow editor powered by @xyflow/react.
 * HOW: Nodes = steps (scan, analyze, notify, etc.), Edges = execution order.
 */

import { useCallback, useState, useRef } from "react";
import {
  ReactFlow,
  Controls,
  Background,
  MiniMap,
  addEdge,
  useNodesState,
  useEdgesState,
  Panel,
  BackgroundVariant,
  type Connection,
  type Node,
  type Edge,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";

import { AppShell } from "@/components/layout/app-shell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { FeatureGate } from "@/components/ui/feature-gate";
import {
  Save, Play, Loader2, ArrowLeft, Plus, Trash2,
  Scan, FileText, Bell, Shield, Zap, Brain,
  Filter, GitBranch, Clock, Send,
} from "lucide-react";
import { toast } from "sonner";
import Link from "next/link";

import { TriggerNode } from "@/components/workflows/trigger-node";
import { ActionNode } from "@/components/workflows/action-node";
import { ConditionNode } from "@/components/workflows/condition-node";

// ── Node Types ────────────────────────────────────────────────────────────────

const nodeTypes = {
  trigger: TriggerNode,
  action: ActionNode,
  condition: ConditionNode,
};

// ── Node Templates (drag to canvas) ──────────────────────────────────────────

const NODE_PALETTE = [
  { type: "trigger", subtype: "schedule", label: "Schedule", icon: Clock, color: "emerald" },
  { type: "trigger", subtype: "webhook", label: "Webhook", icon: Send, color: "emerald" },
  { type: "action", subtype: "scan", label: "Scan URL", icon: Scan, color: "blue" },
  { type: "action", subtype: "analyze", label: "AI Analysis", icon: Brain, color: "purple" },
  { type: "action", subtype: "report", label: "Generate Report", icon: FileText, color: "amber" },
  { type: "action", subtype: "notify", label: "Send Notification", icon: Bell, color: "orange" },
  { type: "action", subtype: "guard", label: "Compliance Guard", icon: Shield, color: "indigo" },
  { type: "condition", subtype: "score-check", label: "Score Threshold", icon: Filter, color: "rose" },
  { type: "condition", subtype: "branch", label: "Conditional", icon: GitBranch, color: "rose" },
];

// ── Default nodes for a new workflow ─────────────────────────────────────────

const DEFAULT_NODES: Node[] = [
  {
    id: "trigger-1",
    type: "trigger",
    position: { x: 300, y: 50 },
    data: { label: "Schedule", subtype: "schedule", config: { cron: "0 9 * * 1" } },
  },
  {
    id: "action-1",
    type: "action",
    position: { x: 300, y: 200 },
    data: { label: "Scan URL", subtype: "scan", config: { url: "" } },
  },
  {
    id: "condition-1",
    type: "condition",
    position: { x: 300, y: 380 },
    data: { label: "Score Threshold", subtype: "score-check", config: { threshold: 80 } },
  },
  {
    id: "action-2",
    type: "action",
    position: { x: 100, y: 540 },
    data: { label: "Generate Report", subtype: "report", config: {} },
  },
  {
    id: "action-3",
    type: "action",
    position: { x: 500, y: 540 },
    data: { label: "Send Notification", subtype: "notify", config: { channel: "email" } },
  },
];

const DEFAULT_EDGES: Edge[] = [
  { id: "e-trigger-action1", source: "trigger-1", target: "action-1", animated: true },
  { id: "e-action1-condition", source: "action-1", target: "condition-1" },
  { id: "e-condition-pass", source: "condition-1", target: "action-2", sourceHandle: "yes", label: "Pass" },
  { id: "e-condition-fail", source: "condition-1", target: "action-3", sourceHandle: "no", label: "Fail" },
];

// ── Component ─────────────────────────────────────────────────────────────────

function WorkflowBuilderInner() {
  const [nodes, setNodes, onNodesChange] = useNodesState(DEFAULT_NODES);
  const [edges, setEdges, onEdgesChange] = useEdgesState(DEFAULT_EDGES);
  const [workflowName, setWorkflowName] = useState("Untitled Workflow");
  const [saving, setSaving] = useState(false);
  const [running, setRunning] = useState(false);
  const nodeIdCounter = useRef(10);

  const onConnect = useCallback(
    (connection: Connection) => setEdges((eds) => addEdge(connection, eds)),
    [setEdges],
  );

  const addNode = useCallback(
    (template: (typeof NODE_PALETTE)[0]) => {
      const id = `${template.type}-${++nodeIdCounter.current}`;
      const newNode: Node = {
        id,
        type: template.type,
        position: { x: 300 + Math.random() * 100, y: 150 + Math.random() * 200 },
        data: { label: template.label, subtype: template.subtype, config: {} },
      };
      setNodes((nds) => [...nds, newNode]);
    },
    [setNodes],
  );

  const handleSave = async () => {
    setSaving(true);
    try {
      const res = await fetch("/api/workflows/builder", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: workflowName, nodes, edges }),
      });
      if (res.ok) {
        toast.success("Workflow saved");
      } else {
        const data = await res.json().catch(() => ({}));
        toast.error(data.error || "Save failed");
      }
    } catch {
      toast.error("Network error");
    } finally {
      setSaving(false);
    }
  };

  const handleRun = async () => {
    setRunning(true);
    try {
      const res = await fetch("/api/workflows/builder/run", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: workflowName, nodes, edges }),
      });
      if (res.ok) {
        toast.success("Workflow execution started");
      } else {
        const data = await res.json().catch(() => ({}));
        toast.error(data.error || "Execution failed");
      }
    } catch {
      toast.error("Network error");
    } finally {
      setRunning(false);
    }
  };

  const deleteSelected = useCallback(() => {
    setNodes((nds) => nds.filter((n) => !n.selected));
    setEdges((eds) => eds.filter((e) => !e.selected));
  }, [setNodes, setEdges]);

  return (
    <AppShell>
      <div className="flex flex-col h-[calc(100vh-4rem)]">
        {/* Toolbar */}
        <div className="flex items-center justify-between px-4 py-2 border-b border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-900">
          <div className="flex items-center gap-3">
            <Link href="/workflows">
              <Button variant="ghost" size="sm">
                <ArrowLeft className="h-4 w-4 mr-1" /> Back
              </Button>
            </Link>
            <Input
              value={workflowName}
              onChange={(e) => setWorkflowName(e.target.value)}
              className="w-64 text-sm font-medium"
            />
            <Badge variant="secondary" className="text-[10px]">
              {nodes.length} nodes · {edges.length} edges
            </Badge>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={deleteSelected}>
              <Trash2 className="h-3.5 w-3.5 mr-1" /> Delete
            </Button>
            <Button variant="outline" size="sm" onClick={handleSave} disabled={saving}>
              {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1" /> : <Save className="h-3.5 w-3.5 mr-1" />}
              Save
            </Button>
            <Button size="sm" onClick={handleRun} disabled={running}>
              {running ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1" /> : <Play className="h-3.5 w-3.5 mr-1" />}
              Run
            </Button>
          </div>
        </div>

        {/* Canvas */}
        <div className="flex-1 relative">
          <ReactFlow
            nodes={nodes}
            edges={edges}
            onNodesChange={onNodesChange}
            onEdgesChange={onEdgesChange}
            onConnect={onConnect}
            nodeTypes={nodeTypes}
            fitView
            className="bg-neutral-50 dark:bg-neutral-950"
            deleteKeyCode="Backspace"
          >
            <Controls />
            <MiniMap
              className="!bg-white dark:!bg-neutral-800 !border-neutral-200 dark:!border-neutral-700"
              nodeColor={(node) => {
                if (node.type === "trigger") return "#10b981";
                if (node.type === "condition") return "#f43f5e";
                return "#3b82f6";
              }}
            />
            <Background variant={BackgroundVariant.Dots} gap={16} size={1} />

            {/* Node Palette Panel */}
            <Panel position="top-left">
              <Card className="w-56 shadow-lg">
                <CardHeader className="py-2 px-3">
                  <CardTitle className="text-xs font-medium flex items-center gap-1.5">
                    <Plus className="h-3.5 w-3.5" /> Add Step
                  </CardTitle>
                </CardHeader>
                <CardContent className="p-2 space-y-1 max-h-80 overflow-y-auto">
                  {NODE_PALETTE.map((item) => {
                    const Icon = item.icon;
                    return (
                      <button
                        key={`${item.type}-${item.subtype}`}
                        onClick={() => addNode(item)}
                        className="w-full flex items-center gap-2 px-2 py-1.5 rounded-md text-xs hover:bg-neutral-100 dark:hover:bg-neutral-800 transition-colors text-left"
                      >
                        <Icon className="h-3.5 w-3.5 shrink-0" />
                        <span>{item.label}</span>
                        <Badge variant="outline" className="ml-auto text-[9px]">
                          {item.type}
                        </Badge>
                      </button>
                    );
                  })}
                </CardContent>
              </Card>
            </Panel>
          </ReactFlow>
        </div>
      </div>
    </AppShell>
  );
}

export default function WorkflowBuilderPage() {
  return (
    <FeatureGate feature="workflows">
      <WorkflowBuilderInner />
    </FeatureGate>
  );
}
