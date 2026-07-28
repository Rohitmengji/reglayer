"use client";

/**
 * RegLayer — AI Agents Page
 *
 * WHY: Specialized AI agents do specific compliance work better than generic chat.
 * WHAT: Browse system agents, create custom agents, run agents against workspace data.
 * HOW: Fetches /api/v1/agents for the catalog, renders cards, allows running agents.
 */

import { useState, useEffect, useCallback } from "react";
import { AppShell } from "@/components/layout/app-shell";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import {
  Bot, Shield, Scale, Code, FileText, Search, Play,
  Loader2, Sparkles, ChevronRight, Clock,
} from "lucide-react";
import { toast } from "sonner";
import { FeatureGate } from "@/components/ui/feature-gate";
import Link from "next/link";

interface Agent {
  slug: string;
  name: string;
  description: string;
  category: string;
  model: string;
  isSystem: boolean;
  tools: string[];
}

interface AgentRun {
  running: boolean;
  slug: string;
  result: string | null;
}

const CATEGORY_META: Record<string, { icon: typeof Bot; color: string }> = {
  compliance: { icon: Shield, color: "text-blue-600 bg-blue-50 dark:text-blue-400 dark:bg-blue-950/30" },
  legal: { icon: Scale, color: "text-red-600 bg-red-50 dark:text-red-400 dark:bg-red-950/30" },
  development: { icon: Code, color: "text-emerald-600 bg-emerald-50 dark:text-emerald-400 dark:bg-emerald-950/30" },
  research: { icon: Search, color: "text-violet-600 bg-violet-50 dark:text-violet-400 dark:bg-violet-950/30" },
};

function AgentsPageInner() {
  const [agents, setAgents] = useState<Agent[]>([]);
  const [loading, setLoading] = useState(true);
  const [taskInput, setTaskInput] = useState("");
  const [selectedAgent, setSelectedAgent] = useState<string | null>(null);
  const [run, setRun] = useState<AgentRun>({ running: false, slug: "", result: null });

  const fetchAgents = useCallback(async () => {
    try {
      const res = await fetch("/api/agents");
      if (res.ok) {
        const data = await res.json();
        setAgents(data.agents ?? []);
      }
    } catch { /* silent */ }
    finally { setLoading(false); }
  }, []);

  // eslint-disable-next-line react-hooks/set-state-in-effect -- async fetch, setState after await
  useEffect(() => { fetchAgents(); }, [fetchAgents]);

  const handleRun = async (slug: string) => {
    if (!taskInput.trim()) {
      toast.error("Enter a task for the agent");
      return;
    }
    setRun({ running: true, slug, result: null });
    try {
      const res = await fetch("/api/agents/run", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ agentSlug: slug, task: taskInput.trim() }),
      });
      if (res.ok) {
        const data = await res.json();
        setRun({ running: false, slug, result: data.result ?? data.output ?? "Agent completed." });
        toast.success("Agent completed");
      } else {
        const data = await res.json().catch(() => ({}));
        toast.error(data.error || "Agent failed");
        setRun({ running: false, slug, result: null });
      }
    } catch {
      toast.error("Network error");
      setRun({ running: false, slug, result: null });
    }
  };

  return (
    <AppShell>
      <div className="space-y-6 max-w-5xl mx-auto">
        {/* Header */}
        <div className="flex items-start justify-between">
          <div>
            <div className="flex items-center gap-2">
              <div className="p-2 rounded-lg bg-violet-100 dark:bg-violet-900/30">
                <Bot className="h-5 w-5 text-violet-600 dark:text-violet-400" />
              </div>
              <h1 className="text-2xl font-bold tracking-tight">AI Agents</h1>
            </div>
            <p className="text-sm text-muted-foreground mt-1 ml-11">
              Specialized AI agents that perform specific compliance tasks. Each agent has its own expertise, tools, and knowledge.
            </p>
          </div>
          <Link href="/agents/builder">
            <Button variant="outline" size="sm">
              <Sparkles className="h-3.5 w-3.5 mr-1" /> Build Agent
            </Button>
          </Link>
        </div>

        {/* Task Input */}
        <Card>
          <CardContent className="p-4">
            <div className="flex gap-3">
              <Input
                value={taskInput}
                onChange={(e) => setTaskInput(e.target.value)}
                placeholder="Describe the task — e.g., 'Analyze my latest scan results and generate a compliance report'"
                className="flex-1"
                onKeyDown={(e) => { if (e.key === "Enter" && selectedAgent) handleRun(selectedAgent); }}
              />
              {selectedAgent && (
                <Button
                  onClick={() => handleRun(selectedAgent)}
                  disabled={run.running || !taskInput.trim()}
                >
                  {run.running ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : <Play className="h-4 w-4 mr-1" />}
                  Run
                </Button>
              )}
            </div>
            {!selectedAgent && taskInput && (
              <p className="text-xs text-muted-foreground mt-2">Select an agent below to run this task</p>
            )}
          </CardContent>
        </Card>

        {/* Agent Result */}
        {run.result && (
          <Card className="border-accent/30 bg-accent/5">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm flex items-center gap-2">
                <Sparkles className="h-4 w-4 text-accent" />
                {agents.find((a) => a.slug === run.slug)?.name} — Result
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-sm text-neutral-700 dark:text-neutral-300 whitespace-pre-wrap leading-relaxed">
                {run.result}
              </div>
            </CardContent>
          </Card>
        )}

        {/* Agent Grid */}
        {loading ? (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {Array.from({ length: 4 }).map((_, i) => (
              <Card key={i}>
                <CardContent className="p-5 space-y-3">
                  <div className="h-4 w-32 bg-muted animate-pulse rounded" />
                  <div className="h-3 w-48 bg-muted animate-pulse rounded" />
                  <div className="h-8 w-20 bg-muted animate-pulse rounded" />
                </CardContent>
              </Card>
            ))}
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {agents.map((agent) => {
              const meta = CATEGORY_META[agent.category] ?? { icon: Bot, color: "text-neutral-600 bg-neutral-50" };
              const Icon = meta.icon;
              const isSelected = selectedAgent === agent.slug;
              const isRunning = run.running && run.slug === agent.slug;

              return (
                <Card
                  key={agent.slug}
                  className={`cursor-pointer transition-all hover:shadow-md ${
                    isSelected ? "ring-2 ring-accent border-accent" : ""
                  }`}
                  onClick={() => setSelectedAgent(isSelected ? null : agent.slug)}
                >
                  <CardContent className="p-5">
                    <div className="flex items-start justify-between">
                      <div className="flex items-start gap-3">
                        <div className={`p-2 rounded-lg ${meta.color}`}>
                          <Icon className="h-4 w-4" />
                        </div>
                        <div>
                          <h3 className="text-sm font-semibold text-neutral-900 dark:text-white">
                            {agent.name}
                          </h3>
                          <p className="text-xs text-muted-foreground mt-0.5 leading-relaxed">
                            {agent.description}
                          </p>
                        </div>
                      </div>
                      {isSelected && <ChevronRight className="h-4 w-4 text-accent shrink-0" />}
                    </div>

                    <div className="flex items-center gap-2 mt-3">
                      <Badge variant="secondary" className="text-[10px]">{agent.model}</Badge>
                      <Badge variant="outline" className="text-[10px]">{agent.category}</Badge>
                      {agent.isSystem && <Badge variant="outline" className="text-[10px] text-accent border-accent/30">System</Badge>}
                      {agent.tools.length > 0 && (
                        <span className="text-[10px] text-muted-foreground ml-auto">
                          {agent.tools.length} tool{agent.tools.length !== 1 ? "s" : ""}
                        </span>
                      )}
                    </div>

                    {isSelected && (
                      <div className="mt-3 pt-3 border-t border-neutral-100 dark:border-neutral-800">
                        <Button
                          size="sm"
                          className="w-full"
                          onClick={(e) => { e.stopPropagation(); handleRun(agent.slug); }}
                          disabled={isRunning || !taskInput.trim()}
                        >
                          {isRunning ? (
                            <><Loader2 className="h-3.5 w-3.5 animate-spin mr-1.5" /> Running...</>
                          ) : (
                            <><Play className="h-3.5 w-3.5 mr-1.5" /> Run Agent</>
                          )}
                        </Button>
                      </div>
                    )}
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}

        {/* Empty state */}
        {!loading && agents.length === 0 && (
          <Card className="border-dashed">
            <CardContent className="flex flex-col items-center justify-center py-12 text-center">
              <Bot className="h-10 w-10 text-muted-foreground/30 mb-3" />
              <h3 className="font-medium">No agents available</h3>
              <p className="text-sm text-muted-foreground mt-1 max-w-sm">
                AI agents will appear here once the system agents are seeded.
              </p>
            </CardContent>
          </Card>
        )}
      </div>
    </AppShell>
  );
}

export default function AgentsPage() {
  return (
    <FeatureGate feature="agents">
      <AgentsPageInner />
    </FeatureGate>
  );
}
