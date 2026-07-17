"use client";

/**
 * RegLayer — Workspace Decision Engine UI
 *
 * WHY: RegLayer's moat. Teams set decisions (WCAG 2.2 AA, TypeScript only,
 *      Next.js App Router) and the AI enforces them on every response.
 * WHAT: CRUD for workspace decisions, organized by category.
 * HOW: Fetches /api/ai/decisions, renders editable cards, syncs to server.
 */

import { useState, useEffect, useCallback } from "react";
import { toast } from "sonner";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Plus, Trash2, Shield, Code, Palette, Zap, TestTube,
  GitBranch, Settings, Lock, BarChart3, Loader2, Pencil, Check, X,
} from "lucide-react";

interface Decision {
  id: string;
  category: string;
  decision: string;
  rationale: string | null;
}

const CATEGORIES = [
  { id: "COMPLIANCE", label: "Compliance", icon: Shield, color: "text-blue-600 bg-blue-50 dark:text-blue-400 dark:bg-blue-950/30" },
  { id: "CODING", label: "Coding Standards", icon: Code, color: "text-violet-600 bg-violet-50 dark:text-violet-400 dark:bg-violet-950/30" },
  { id: "ARCHITECTURE", label: "Architecture", icon: Settings, color: "text-emerald-600 bg-emerald-50 dark:text-emerald-400 dark:bg-emerald-950/30" },
  { id: "SECURITY", label: "Security", icon: Lock, color: "text-red-600 bg-red-50 dark:text-red-400 dark:bg-red-950/30" },
  { id: "UX", label: "UX / Design", icon: Palette, color: "text-pink-600 bg-pink-50 dark:text-pink-400 dark:bg-pink-950/30" },
  { id: "PERFORMANCE", label: "Performance", icon: Zap, color: "text-amber-600 bg-amber-50 dark:text-amber-400 dark:bg-amber-950/30" },
  { id: "TESTING", label: "Testing", icon: TestTube, color: "text-cyan-600 bg-cyan-50 dark:text-cyan-400 dark:bg-cyan-950/30" },
  { id: "INTEGRATION", label: "Integrations", icon: GitBranch, color: "text-orange-600 bg-orange-50 dark:text-orange-400 dark:bg-orange-950/30" },
  { id: "CUSTOM", label: "Custom", icon: BarChart3, color: "text-neutral-600 bg-neutral-50 dark:text-neutral-400 dark:bg-neutral-800" },
] as const;

const QUICK_DECISIONS = [
  { category: "COMPLIANCE", decision: "WCAG 2.2 Level AA compliance required", rationale: "Legal requirement for public-facing sites" },
  { category: "COMPLIANCE", decision: "European Accessibility Act (EAA) compliance required", rationale: "EU regulation effective June 2025" },
  { category: "CODING", decision: "TypeScript required for all code", rationale: "Type safety reduces bugs" },
  { category: "CODING", decision: "Use Next.js App Router (not Pages Router)", rationale: "Modern architecture, server components" },
  { category: "SECURITY", decision: "No inline scripts allowed (CSP enforcement)", rationale: "XSS prevention" },
  { category: "PERFORMANCE", decision: "Largest Contentful Paint (LCP) must be under 2.5 seconds", rationale: "Core Web Vitals target" },
];

export function DecisionEngineTab() {
  const [decisions, setDecisions] = useState<Decision[]>([]);
  const [loading, setLoading] = useState(true);
  const [adding, setAdding] = useState(false);
  const [newCategory, setNewCategory] = useState("COMPLIANCE");
  const [newDecision, setNewDecision] = useState("");
  const [newRationale, setNewRationale] = useState("");
  const [saving, setSaving] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editText, setEditText] = useState("");

  const fetchDecisions = useCallback(async () => {
    try {
      const res = await fetch("/api/ai/decisions");
      if (res.ok) {
        const data = await res.json();
        setDecisions(data.decisions ?? []);
      }
    } catch { /* silent */ }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { fetchDecisions(); }, [fetchDecisions]);

  const handleAdd = async () => {
    if (!newDecision.trim()) return;
    setSaving(true);
    try {
      const res = await fetch("/api/ai/decisions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          category: newCategory,
          decision: newDecision.trim(),
          rationale: newRationale.trim() || undefined,
        }),
      });
      if (res.ok) {
        toast.success("Decision added — AI will enforce it on all future responses");
        setNewDecision("");
        setNewRationale("");
        setAdding(false);
        fetchDecisions();
      } else {
        const data = await res.json();
        toast.error(data.error || "Failed to add decision");
      }
    } catch { toast.error("Network error"); }
    finally { setSaving(false); }
  };

  const handleQuickAdd = async (qd: typeof QUICK_DECISIONS[0]) => {
    setSaving(true);
    try {
      const res = await fetch("/api/ai/decisions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(qd),
      });
      if (res.ok) {
        toast.success("Decision added");
        fetchDecisions();
      }
    } catch { /* silent */ }
    finally { setSaving(false); }
  };

  const handleDelete = async (id: string) => {
    try {
      await fetch(`/api/ai/decisions?id=${encodeURIComponent(id)}`, { method: "DELETE" });
      setDecisions((prev) => prev.filter((d) => d.id !== id));
      toast.success("Decision removed");
    } catch { toast.error("Failed to delete"); }
  };

  const handleEdit = async (id: string) => {
    if (!editText.trim()) return;
    try {
      await fetch("/api/ai/decisions", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, decision: editText.trim() }),
      });
      setEditingId(null);
      fetchDecisions();
      toast.success("Decision updated");
    } catch { toast.error("Failed to update"); }
  };

  const grouped = CATEGORIES.map((cat) => ({
    ...cat,
    decisions: decisions.filter((d) => d.category === cat.id),
  })).filter((cat) => cat.decisions.length > 0);

  const unusedQuickDecisions = QUICK_DECISIONS.filter(
    (qd) => !decisions.some((d) => d.decision === qd.decision),
  );

  if (loading) {
    return (
      <Card>
        <CardContent className="flex items-center justify-center py-12">
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="flex items-center gap-2">
                <Shield className="h-5 w-5 text-accent" />
                Workspace Decisions
              </CardTitle>
              <CardDescription className="mt-1">
                Set rules the AI must follow in every response. Decisions are enforced automatically — the AI checks its output against your standards.
              </CardDescription>
            </div>
            <Button size="sm" onClick={() => setAdding(!adding)}>
              <Plus className="h-4 w-4 mr-1" />
              Add Decision
            </Button>
          </div>
        </CardHeader>

        {/* Add form */}
        {adding && (
          <CardContent className="border-t pt-4">
            <div className="space-y-3">
              <div className="flex gap-2">
                <select
                  value={newCategory}
                  onChange={(e) => setNewCategory(e.target.value)}
                  className="rounded-lg border border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-800 px-3 py-2 text-sm"
                >
                  {CATEGORIES.map((cat) => (
                    <option key={cat.id} value={cat.id}>{cat.label}</option>
                  ))}
                </select>
                <Input
                  value={newDecision}
                  onChange={(e) => setNewDecision(e.target.value)}
                  placeholder="e.g., WCAG 2.2 Level AA compliance required"
                  className="flex-1"
                  onKeyDown={(e) => { if (e.key === "Enter") handleAdd(); }}
                />
              </div>
              <Input
                value={newRationale}
                onChange={(e) => setNewRationale(e.target.value)}
                placeholder="Rationale (optional) — why this decision was made"
              />
              <div className="flex justify-end gap-2">
                <Button variant="outline" size="sm" onClick={() => setAdding(false)}>Cancel</Button>
                <Button size="sm" onClick={handleAdd} disabled={saving || !newDecision.trim()}>
                  {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1" /> : null}
                  Save Decision
                </Button>
              </div>
            </div>
          </CardContent>
        )}
      </Card>

      {/* Quick-add suggestions (if no decisions yet or missing common ones) */}
      {unusedQuickDecisions.length > 0 && decisions.length < 5 && (
        <Card className="border-dashed">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">Quick Start</CardTitle>
            <CardDescription>Common decisions to get started</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {unusedQuickDecisions.map((qd, i) => {
                const cat = CATEGORIES.find((c) => c.id === qd.category);
                return (
                  <button
                    key={i}
                    onClick={() => handleQuickAdd(qd)}
                    disabled={saving}
                    className="flex items-start gap-2 rounded-lg border border-neutral-200 dark:border-neutral-700 p-3 text-left hover:border-accent/50 hover:bg-accent/5 transition-colors text-sm"
                  >
                    <Plus className="h-3.5 w-3.5 mt-0.5 text-accent shrink-0" />
                    <div>
                      <span className="font-medium text-neutral-800 dark:text-neutral-200">{qd.decision}</span>
                      {qd.rationale && (
                        <span className="block text-[11px] text-neutral-400 mt-0.5">{qd.rationale}</span>
                      )}
                    </div>
                  </button>
                );
              })}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Decision list by category */}
      {grouped.length > 0 ? (
        <div className="space-y-4">
          {grouped.map((cat) => {
            const Icon = cat.icon;
            return (
              <Card key={cat.id}>
                <CardHeader className="pb-2">
                  <div className="flex items-center gap-2">
                    <div className={`p-1.5 rounded-md ${cat.color}`}>
                      <Icon className="h-3.5 w-3.5" />
                    </div>
                    <CardTitle className="text-sm">{cat.label}</CardTitle>
                    <Badge variant="secondary" className="text-[10px] ml-auto">
                      {cat.decisions.length}
                    </Badge>
                  </div>
                </CardHeader>
                <CardContent className="pt-0">
                  <div className="divide-y divide-neutral-100 dark:divide-neutral-800">
                    {cat.decisions.map((d) => (
                      <div key={d.id} className="py-2.5 first:pt-0 last:pb-0 group">
                        {editingId === d.id ? (
                          <div className="flex items-center gap-2">
                            <Input
                              value={editText}
                              onChange={(e) => setEditText(e.target.value)}
                              className="flex-1 text-sm"
                              autoFocus
                              onKeyDown={(e) => {
                                if (e.key === "Enter") handleEdit(d.id);
                                if (e.key === "Escape") setEditingId(null);
                              }}
                            />
                            <Button size="sm" variant="ghost" onClick={() => handleEdit(d.id)}>
                              <Check className="h-3.5 w-3.5" />
                            </Button>
                            <Button size="sm" variant="ghost" onClick={() => setEditingId(null)}>
                              <X className="h-3.5 w-3.5" />
                            </Button>
                          </div>
                        ) : (
                          <div className="flex items-start justify-between gap-3">
                            <div className="flex-1 min-w-0">
                              <p className="text-[13px] font-medium text-neutral-800 dark:text-neutral-200">
                                {d.decision}
                              </p>
                              {d.rationale && (
                                <p className="text-[11px] text-neutral-400 mt-0.5">{d.rationale}</p>
                              )}
                            </div>
                            <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
                              <Button
                                size="sm"
                                variant="ghost"
                                className="h-7 w-7 p-0"
                                onClick={() => { setEditingId(d.id); setEditText(d.decision); }}
                              >
                                <Pencil className="h-3 w-3" />
                              </Button>
                              <Button
                                size="sm"
                                variant="ghost"
                                className="h-7 w-7 p-0 hover:text-red-500"
                                onClick={() => handleDelete(d.id)}
                              >
                                <Trash2 className="h-3 w-3" />
                              </Button>
                            </div>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      ) : !adding ? (
        <Card className="border-dashed">
          <CardContent className="flex flex-col items-center justify-center py-12 text-center">
            <Shield className="h-10 w-10 text-muted-foreground/30 mb-3" />
            <h3 className="font-medium text-neutral-700 dark:text-neutral-300">No decisions set</h3>
            <p className="text-sm text-muted-foreground mt-1 max-w-sm">
              Add workspace decisions and the AI will enforce them in every response — compliance standards, coding conventions, architecture rules.
            </p>
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}
