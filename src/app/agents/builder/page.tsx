"use client";

/**
 * RegLayer — Agent Builder
 *
 * Visual interface for creating custom AI agents (like GPT Builder / Coze).
 * Users configure: name, system prompt, model, tools, permissions, schedule.
 *
 * INSPIRED BY: OpenAI GPT Builder, Google Vertex AI Agent Builder, Coze
 */

import { useState } from "react";
import { AppShell } from "@/components/layout/app-shell";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { FeatureGate } from "@/components/ui/feature-gate";
import {
  Bot, Save, Play, Loader2, ArrowLeft, Sparkles, Shield,
  Wrench, Brain, Clock, Zap, MessageSquare, Code,
} from "lucide-react";
import { toast } from "sonner";
import Link from "next/link";

// ── Types ─────────────────────────────────────────────────────────────────────

interface AgentConfig {
  name: string;
  slug: string;
  description: string;
  systemPrompt: string;
  model: string;
  category: string;
  tools: string[];
  permissions: string[];
  temperature: number;
  maxTokens: number;
  triggerType: "manual" | "schedule" | "event";
  schedule?: string;
}

// ── Constants ─────────────────────────────────────────────────────────────────

const AVAILABLE_TOOLS = [
  { id: "getRecentScans", name: "Get Recent Scans", icon: Zap, description: "Fetch user's scan history" },
  { id: "getViolationsForScan", name: "Get Violations", icon: Shield, description: "Look up violations by scan ID" },
  { id: "explainWcag", name: "Explain WCAG", icon: Brain, description: "Explain WCAG success criteria" },
  { id: "searchViolations", name: "Search Violations", icon: MessageSquare, description: "Semantic search across violations" },
  { id: "generateCode", name: "Generate Code Fix", icon: Code, description: "Generate accessibility code fixes" },
];

const MODELS = [
  { id: "gpt-4o", name: "GPT-4o", tier: "Advanced", cost: "$$$" },
  { id: "gpt-4o-mini", name: "GPT-4o Mini", tier: "Standard", cost: "$$" },
  { id: "claude-sonnet", name: "Claude Sonnet", tier: "Advanced", cost: "$$$" },
  { id: "claude-haiku", name: "Claude Haiku", tier: "Fast", cost: "$" },
];

const CATEGORIES = ["compliance", "legal", "development", "research", "monitoring", "reporting"];

const PROMPT_TEMPLATES = [
  { label: "Compliance Auditor", prompt: "You are a web accessibility compliance auditor. Analyze websites against WCAG 2.2 AA standards. For each violation found, explain the impact on users with disabilities and provide specific code fixes. Always cite the exact WCAG success criterion." },
  { label: "Legal Risk Analyzer", prompt: "You are a legal risk analyst specializing in ADA Title III and EAA compliance. Evaluate the litigation risk of accessibility violations. Prioritize by legal exposure, provide case law references, and recommend remediation timelines." },
  { label: "Code Fix Generator", prompt: "You are an accessibility remediation developer. Given violations, generate production-ready code fixes with clear before/after examples. Support React, Vue, Angular, and vanilla HTML. Always include ARIA attributes and keyboard navigation." },
  { label: "Blank", prompt: "" },
];

// ── Component ─────────────────────────────────────────────────────────────────

function AgentBuilderInner() {
  const [config, setConfig] = useState<AgentConfig>({
    name: "",
    slug: "",
    description: "",
    systemPrompt: "",
    model: "gpt-4o-mini",
    category: "compliance",
    tools: [],
    permissions: ["read"],
    temperature: 0.4,
    maxTokens: 2048,
    triggerType: "manual",
  });
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [testInput, setTestInput] = useState("");
  const [testOutput, setTestOutput] = useState("");

  const updateConfig = (updates: Partial<AgentConfig>) => {
    setConfig((prev) => {
      const next = { ...prev, ...updates };
      // Auto-generate slug from name
      if (updates.name !== undefined) {
        next.slug = updates.name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
      }
      return next;
    });
  };

  const toggleTool = (toolId: string) => {
    setConfig((prev) => ({
      ...prev,
      tools: prev.tools.includes(toolId)
        ? prev.tools.filter((t) => t !== toolId)
        : [...prev.tools, toolId],
    }));
  };

  const handleSave = async () => {
    if (!config.name.trim() || !config.systemPrompt.trim()) {
      toast.error("Name and system prompt are required");
      return;
    }
    setSaving(true);
    try {
      const res = await fetch("/api/agents", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(config),
      });
      if (res.ok) {
        toast.success("Agent created successfully");
      } else {
        const data = await res.json().catch(() => ({}));
        toast.error(data.error || "Save failed");
      }
    } catch { toast.error("Network error"); }
    finally { setSaving(false); }
  };

  const handleTest = async () => {
    if (!testInput.trim() || !config.systemPrompt.trim()) {
      toast.error("Enter a test message and system prompt");
      return;
    }
    setTesting(true);
    setTestOutput("");
    try {
      const res = await fetch("/api/agents/run", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          agentSlug: config.slug || "test-agent",
          task: testInput.trim(),
          systemPromptOverride: config.systemPrompt,
          modelOverride: config.model,
        }),
      });
      if (res.ok) {
        const data = await res.json();
        setTestOutput(data.result ?? data.output ?? JSON.stringify(data, null, 2));
      } else {
        const data = await res.json().catch(() => ({}));
        setTestOutput(`Error: ${data.error || "Test failed"}`);
      }
    } catch { setTestOutput("Error: Network failure"); }
    finally { setTesting(false); }
  };

  return (
    <AppShell>
      <div className="max-w-5xl mx-auto space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Link href="/agents">
              <Button variant="ghost" size="sm">
                <ArrowLeft className="h-4 w-4 mr-1" /> Agents
              </Button>
            </Link>
            <div className="flex items-center gap-2">
              <div className="p-2 rounded-lg bg-violet-100 dark:bg-violet-900/30">
                <Bot className="h-5 w-5 text-violet-600 dark:text-violet-400" />
              </div>
              <div>
                <h1 className="text-xl font-bold tracking-tight">Agent Builder</h1>
                <p className="text-xs text-muted-foreground">Create a custom AI agent for your workspace</p>
              </div>
            </div>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={handleTest} disabled={testing}>
              {testing ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1" /> : <Play className="h-3.5 w-3.5 mr-1" />}
              Test
            </Button>
            <Button size="sm" onClick={handleSave} disabled={saving}>
              {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1" /> : <Save className="h-3.5 w-3.5 mr-1" />}
              Save Agent
            </Button>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Left Column: Configuration */}
          <div className="lg:col-span-2 space-y-4">
            {/* Identity */}
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-sm flex items-center gap-1.5">
                  <Sparkles className="h-3.5 w-3.5 text-violet-500" /> Identity
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-xs text-muted-foreground mb-1 block">Agent Name</label>
                    <Input
                      value={config.name}
                      onChange={(e) => updateConfig({ name: e.target.value })}
                      placeholder="e.g., Compliance Auditor"
                    />
                  </div>
                  <div>
                    <label className="text-xs text-muted-foreground mb-1 block">Category</label>
                    <select
                      value={config.category}
                      onChange={(e) => updateConfig({ category: e.target.value })}
                      className="w-full h-9 rounded-lg border border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-800 px-3 text-sm"
                    >
                      {CATEGORIES.map((cat) => (
                        <option key={cat} value={cat}>{cat.charAt(0).toUpperCase() + cat.slice(1)}</option>
                      ))}
                    </select>
                  </div>
                </div>
                <div>
                  <label className="text-xs text-muted-foreground mb-1 block">Description</label>
                  <Input
                    value={config.description}
                    onChange={(e) => updateConfig({ description: e.target.value })}
                    placeholder="Brief description of what this agent does"
                  />
                </div>
                {config.slug && (
                  <p className="text-[10px] text-muted-foreground font-mono">slug: {config.slug}</p>
                )}
              </CardContent>
            </Card>

            {/* System Prompt */}
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-sm flex items-center gap-1.5">
                  <Brain className="h-3.5 w-3.5 text-blue-500" /> System Prompt
                </CardTitle>
                <CardDescription className="text-xs">
                  Define how the agent behaves. Use templates or write your own.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                {/* Template buttons */}
                <div className="flex flex-wrap gap-1.5">
                  {PROMPT_TEMPLATES.map((tmpl) => (
                    <button
                      key={tmpl.label}
                      onClick={() => updateConfig({ systemPrompt: tmpl.prompt })}
                      className="px-2.5 py-1 text-[11px] rounded-md bg-neutral-100 dark:bg-neutral-800 hover:bg-neutral-200 dark:hover:bg-neutral-700 transition-colors"
                    >
                      {tmpl.label}
                    </button>
                  ))}
                </div>
                <textarea
                  value={config.systemPrompt}
                  onChange={(e) => updateConfig({ systemPrompt: e.target.value })}
                  placeholder="You are a specialized AI agent that..."
                  className="w-full rounded-lg border border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-800 px-3.5 py-2.5 text-sm min-h-[180px] resize-y focus:outline-none focus:ring-2 focus:ring-accent/40 font-mono text-xs"
                />
                <p className="text-[10px] text-muted-foreground">
                  {config.systemPrompt.length} chars · ~{Math.ceil(config.systemPrompt.length / 4)} tokens
                </p>
              </CardContent>
            </Card>

            {/* Tools */}
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-sm flex items-center gap-1.5">
                  <Wrench className="h-3.5 w-3.5 text-amber-500" /> Tools
                </CardTitle>
                <CardDescription className="text-xs">
                  Select which tools this agent can use to take actions.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  {AVAILABLE_TOOLS.map((tool) => {
                    const Icon = tool.icon;
                    const selected = config.tools.includes(tool.id);
                    return (
                      <button
                        key={tool.id}
                        onClick={() => toggleTool(tool.id)}
                        className={`flex items-center gap-2 p-2.5 rounded-lg border text-left transition-all ${
                          selected
                            ? "border-accent bg-accent/5 ring-1 ring-accent/30"
                            : "border-neutral-200 dark:border-neutral-700 hover:border-neutral-300 dark:hover:border-neutral-600"
                        }`}
                      >
                        <Icon className={`h-4 w-4 shrink-0 ${selected ? "text-accent" : "text-muted-foreground"}`} />
                        <div className="flex-1 min-w-0">
                          <p className="text-xs font-medium">{tool.name}</p>
                          <p className="text-[10px] text-muted-foreground truncate">{tool.description}</p>
                        </div>
                      </button>
                    );
                  })}
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Right Column: Model + Test */}
          <div className="space-y-4">
            {/* Model Selection */}
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-sm flex items-center gap-1.5">
                  <Zap className="h-3.5 w-3.5 text-emerald-500" /> Model
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                {MODELS.map((model) => (
                  <button
                    key={model.id}
                    onClick={() => updateConfig({ model: model.id })}
                    className={`w-full flex items-center justify-between p-2.5 rounded-lg border text-left transition-all ${
                      config.model === model.id
                        ? "border-accent bg-accent/5 ring-1 ring-accent/30"
                        : "border-neutral-200 dark:border-neutral-700 hover:border-neutral-300"
                    }`}
                  >
                    <div>
                      <p className="text-xs font-medium">{model.name}</p>
                      <p className="text-[10px] text-muted-foreground">{model.tier}</p>
                    </div>
                    <Badge variant="outline" className="text-[9px]">{model.cost}</Badge>
                  </button>
                ))}

                {/* Temperature & Max Tokens */}
                <div className="pt-3 space-y-3 border-t border-neutral-200 dark:border-neutral-700 mt-3">
                  <div>
                    <div className="flex justify-between mb-1">
                      <label className="text-[10px] text-muted-foreground">Temperature</label>
                      <span className="text-[10px] font-mono">{config.temperature}</span>
                    </div>
                    <input
                      type="range"
                      min="0"
                      max="1"
                      step="0.1"
                      value={config.temperature}
                      onChange={(e) => updateConfig({ temperature: parseFloat(e.target.value) })}
                      className="w-full h-1.5 accent-accent"
                    />
                    <div className="flex justify-between text-[9px] text-muted-foreground">
                      <span>Precise</span>
                      <span>Creative</span>
                    </div>
                  </div>
                  <div>
                    <label className="text-[10px] text-muted-foreground mb-1 block">Max Tokens</label>
                    <Input
                      type="number"
                      value={config.maxTokens}
                      onChange={(e) => updateConfig({ maxTokens: parseInt(e.target.value) || 2048 })}
                      className="text-xs"
                    />
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Trigger */}
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-sm flex items-center gap-1.5">
                  <Clock className="h-3.5 w-3.5 text-orange-500" /> Trigger
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                {(["manual", "schedule", "event"] as const).map((type) => (
                  <button
                    key={type}
                    onClick={() => updateConfig({ triggerType: type })}
                    className={`w-full px-3 py-2 rounded-lg border text-left text-xs transition-all ${
                      config.triggerType === type
                        ? "border-accent bg-accent/5"
                        : "border-neutral-200 dark:border-neutral-700"
                    }`}
                  >
                    {type === "manual" && "Manual — Run on demand"}
                    {type === "schedule" && "Scheduled — Run on a CRON schedule"}
                    {type === "event" && "Event — Triggered by webhooks/scans"}
                  </button>
                ))}
                {config.triggerType === "schedule" && (
                  <Input
                    value={config.schedule ?? ""}
                    onChange={(e) => updateConfig({ schedule: e.target.value })}
                    placeholder="0 9 * * 1  (Every Monday at 9am)"
                    className="text-xs font-mono mt-2"
                  />
                )}
              </CardContent>
            </Card>

            {/* Test Panel */}
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-sm flex items-center gap-1.5">
                  <Play className="h-3.5 w-3.5 text-green-500" /> Test
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                <textarea
                  value={testInput}
                  onChange={(e) => setTestInput(e.target.value)}
                  placeholder="Type a test message..."
                  className="w-full rounded-lg border border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-800 px-3 py-2 text-xs min-h-[80px] resize-y focus:outline-none focus:ring-2 focus:ring-accent/40"
                />
                <Button size="sm" className="w-full" onClick={handleTest} disabled={testing}>
                  {testing ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1" /> : <Play className="h-3.5 w-3.5 mr-1" />}
                  Run Test
                </Button>
                {testOutput && (
                  <div className="mt-2 p-2.5 rounded-lg bg-neutral-50 dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-700">
                    <pre className="text-[11px] whitespace-pre-wrap max-h-60 overflow-y-auto">
                      {testOutput}
                    </pre>
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </AppShell>
  );
}

export default function AgentBuilderPage() {
  return (
    <FeatureGate feature="agents">
      <AgentBuilderInner />
    </FeatureGate>
  );
}
