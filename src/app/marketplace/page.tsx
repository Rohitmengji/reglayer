"use client";

/**
 * RegLayer — Community Marketplace
 *
 * WHY: Let users discover, share, and install community-built templates,
 *      workflows, compliance rules, and agent blueprints.
 * WHAT: Browse/search marketplace items, install with one click, publish your own.
 * HOW: GET /api/marketplace (browse), POST /api/marketplace (publish), POST /api/marketplace/install (install).
 */

import { useState, useEffect, useCallback } from "react";
import { AppShell } from "@/components/layout/app-shell";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { FeatureGate } from "@/components/ui/feature-gate";
import {
  Store, Search, Download, Workflow,
  Shield, Bot, FileText, Loader2,
  CheckCircle2, Users, Plus, X,
} from "lucide-react";
import { toast } from "sonner";

// ── Types ─────────────────────────────────────────────────────────────────────

interface MarketplaceItem {
  id: string;
  type: "workflow" | "rule" | "agent" | "template";
  title: string;
  description: string;
  category: string;
  author: string;
  downloads: number;
  rating: number;
  ratingCount: number;
  tags: string[];
  isVerified: boolean;
  createdAt: string;
}

// ── Constants ─────────────────────────────────────────────────────────────────

const TYPE_CONFIG = {
  workflow: { icon: Workflow, color: "text-blue-600 dark:text-blue-400", bg: "bg-blue-50 dark:bg-blue-950/30" },
  rule: { icon: Shield, color: "text-emerald-600 dark:text-emerald-400", bg: "bg-emerald-50 dark:bg-emerald-950/30" },
  agent: { icon: Bot, color: "text-purple-600 dark:text-purple-400", bg: "bg-purple-50 dark:bg-purple-950/30" },
  template: { icon: FileText, color: "text-amber-600 dark:text-amber-400", bg: "bg-amber-50 dark:bg-amber-950/30" },
};

const CATEGORIES = ["All", "Accessibility", "Legal", "Reporting", "Monitoring", "Remediation", "Design System"];

// ── Component ──────────────────────────────────────────────────────

interface SavedWorkflowSummary { id: string; name: string; }

// ── Component ─────────────────────────────────────────────────────────────────

const PAGE_SIZE = 24;

function MarketplacePageInner() {
  const [items, setItems] = useState<MarketplaceItem[]>([]);
  const [total, setTotal] = useState(0);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [loadError, setLoadError] = useState(false);
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [activeCategory, setActiveCategory] = useState("All");
  const [activeType, setActiveType] = useState<string | null>(null);
  const [installing, setInstalling] = useState<string | null>(null);

  const [showPublish, setShowPublish] = useState(false);
  const [savedWorkflows, setSavedWorkflows] = useState<SavedWorkflowSummary[]>([]);
  const [publishForm, setPublishForm] = useState({ workflowId: "", title: "", description: "", category: "Accessibility", tags: "" });
  const [publishing, setPublishing] = useState(false);

  // Debounce the search box so we query once the user pauses, not per keystroke.
  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search.trim()), 300);
    return () => clearTimeout(t);
  }, [search]);

  // Close the Publish dialog on Escape for keyboard users.
  useEffect(() => {
    if (!showPublish) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setShowPublish(false); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [showPublish]);

  const fetchPage = useCallback(async (offset: number, replace: boolean) => {
    if (replace) setLoading(true); else setLoadingMore(true);
    try {
      const params = new URLSearchParams();
      if (debouncedSearch) params.set("q", debouncedSearch);
      if (activeCategory !== "All") params.set("category", activeCategory);
      if (activeType) params.set("type", activeType);
      params.set("limit", String(PAGE_SIZE));
      if (offset) params.set("offset", String(offset));

      const res = await fetch(`/api/marketplace?${params.toString()}`);
      if (!res.ok) throw new Error("load failed");
      const data = await res.json();
      const next: MarketplaceItem[] = Array.isArray(data.items) ? data.items : [];
      setItems((prev) => (replace ? next : [...prev, ...next]));
      setTotal(typeof data.total === "number" ? data.total : next.length);
      setHasMore(Boolean(data.hasMore));
      setLoadError(false);
    } catch {
      if (replace) setItems([]);
      setLoadError(true);
    } finally {
      if (replace) setLoading(false); else setLoadingMore(false);
    }
  }, [debouncedSearch, activeCategory, activeType]);

  // eslint-disable-next-line react-hooks/set-state-in-effect -- async fetch, setState after await
  useEffect(() => { fetchPage(0, true); }, [fetchPage]);

  const openPublish = async () => {
    setShowPublish(true);
    try {
      const res = await fetch("/api/workflows/builder");
      if (res.ok) {
        const data = await res.json();
        setSavedWorkflows(Array.isArray(data.workflows) ? data.workflows : []);
      }
    } catch { /* the form explains when there's nothing to publish */ }
  };

  const handlePublish = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!publishForm.workflowId || publishForm.title.trim().length < 3 || publishForm.description.trim().length < 10) {
      toast.error("Pick a workflow and add a title (3+) and description (10+ characters).");
      return;
    }
    setPublishing(true);
    try {
      const res = await fetch("/api/marketplace", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type: "workflow",
          title: publishForm.title.trim(),
          description: publishForm.description.trim(),
          category: publishForm.category,
          tags: publishForm.tags.split(",").map((t) => t.trim()).filter(Boolean).slice(0, 10),
          sourceWorkflowId: publishForm.workflowId,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) { toast.error(data.error || "Publish failed"); return; }
      toast.success("Published to the marketplace");
      setShowPublish(false);
      setPublishForm({ workflowId: "", title: "", description: "", category: "Accessibility", tags: "" });
      fetchPage(0, true);
    } catch { toast.error("Network error"); }
    finally { setPublishing(false); }
  };

  const handleInstall = async (item: MarketplaceItem) => {
    setInstalling(item.id);
    try {
      const res = await fetch("/api/marketplace/install", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ itemId: item.id, type: item.type }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok) {
        toast.success(`"${item.title}" installed`);
        fetchPage(0, true);
      } else {
        toast.error(data.error || "Install failed");
      }
    } catch { toast.error("Network error"); }
    finally { setInstalling(null); }
  };

  const hasActiveFilters = debouncedSearch !== "" || activeCategory !== "All" || activeType !== null;

  return (
    <AppShell>
      <div className="space-y-6 max-w-6xl mx-auto">
        {/* Header */}
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <div className="flex items-center gap-2">
              <div className="p-2 rounded-lg bg-violet-100 dark:bg-violet-900/30">
                <Store className="h-5 w-5 text-violet-600 dark:text-violet-400" />
              </div>
              <h1 className="text-2xl font-bold tracking-tight">Marketplace</h1>
              <Badge variant="secondary" className="text-[10px]">Community</Badge>
            </div>
            <p className="text-sm text-muted-foreground mt-1 ml-11">
              Discover workflows, rules, agents, and templates built by the community. Install with one click.
            </p>
          </div>
          <Button size="sm" className="shrink-0 self-start" onClick={openPublish}>
            <Plus className="h-4 w-4 mr-1" /> Publish
          </Button>
        </div>

        {/* Search & Filters */}
        <div className="flex flex-col sm:flex-row gap-3">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search workflows, rules, agents..."
              className="pl-9"
            />
          </div>
          <div className="flex gap-1.5 flex-wrap">
            {(Object.keys(TYPE_CONFIG) as Array<keyof typeof TYPE_CONFIG>).map((type) => {
              const cfg = TYPE_CONFIG[type];
              const Icon = cfg.icon;
              return (
                <Button
                  key={type}
                  variant={activeType === type ? "default" : "outline"}
                  size="sm"
                  onClick={() => setActiveType(activeType === type ? null : type)}
                  className="text-xs"
                >
                  <Icon className="h-3 w-3 mr-1" />
                  {type.charAt(0).toUpperCase() + type.slice(1)}s
                </Button>
              );
            })}
          </div>
        </div>

        {/* Category Tabs */}
        <div className="flex gap-1.5 overflow-x-auto pb-1">
          {CATEGORIES.map((cat) => (
            <button
              key={cat}
              onClick={() => setActiveCategory(cat)}
              className={`px-3 py-1.5 text-xs font-medium rounded-full whitespace-nowrap transition-colors ${
                activeCategory === cat
                  ? "bg-neutral-900 dark:bg-neutral-100 text-white dark:text-neutral-900"
                  : "bg-neutral-100 dark:bg-neutral-800 text-neutral-600 dark:text-neutral-400 hover:bg-neutral-200 dark:hover:bg-neutral-700"
              }`}
            >
              {cat}
            </button>
          ))}
        </div>

        {/* Stats Bar */}
        <div className="flex items-center gap-4 text-xs text-muted-foreground">
          <span className="flex items-center gap-1"><Users className="h-3.5 w-3.5" /> {total} {total === 1 ? "item" : "items"}</span>
        </div>

        {/* Items Grid */}
        {loading ? (
          <div className="flex items-center justify-center py-16">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        ) : loadError ? (
          <Card className="border-dashed">
            <CardContent className="flex flex-col items-center justify-center py-16 text-center">
              <Store className="h-10 w-10 text-muted-foreground/30 mb-3" />
              <h3 className="font-medium">Couldn’t load the marketplace</h3>
              <p className="text-sm text-muted-foreground mt-1">Please try again.</p>
              <Button size="sm" variant="outline" className="mt-4" onClick={() => fetchPage(0, true)}>Try again</Button>
            </CardContent>
          </Card>
        ) : items.length === 0 && hasActiveFilters ? (
          <Card className="border-dashed">
            <CardContent className="flex flex-col items-center justify-center py-16 text-center">
              <Store className="h-10 w-10 text-muted-foreground/30 mb-3" />
              <h3 className="font-medium">No items match your search</h3>
              <p className="text-sm text-muted-foreground mt-1">Try adjusting your filters or search terms.</p>
            </CardContent>
          </Card>
        ) : items.length === 0 ? (
          <Card className="border-dashed">
            <CardContent className="flex flex-col items-center justify-center py-16 text-center">
              <Store className="h-10 w-10 text-muted-foreground/30 mb-3" />
              <h3 className="font-medium">No items yet</h3>
              <p className="text-sm text-muted-foreground mt-1 max-w-sm">Publish one of your workflows to share it with your team and the community.</p>
              <Button size="sm" className="mt-4" onClick={openPublish}><Plus className="h-4 w-4 mr-1" /> Publish a workflow</Button>
            </CardContent>
          </Card>
        ) : (
          <>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {items.map((item) => {
              const cfg = TYPE_CONFIG[item.type];
              const Icon = cfg.icon;
              const isInstalling = installing === item.id;

              return (
                <Card key={item.id} className="flex flex-col hover:shadow-md transition-shadow">
                  <CardHeader className="pb-2">
                    <div className="flex items-start justify-between">
                      <div className="flex items-center gap-2">
                        <div className={`p-1.5 rounded-md ${cfg.bg} ${cfg.color}`}>
                          <Icon className="h-4 w-4" />
                        </div>
                        <Badge variant="outline" className="text-[9px]">
                          {item.type}
                        </Badge>
                      </div>
                      {item.isVerified && (
                        <Badge variant="secondary" className="text-[9px] gap-0.5">
                          <CheckCircle2 className="h-2.5 w-2.5" /> Verified
                        </Badge>
                      )}
                    </div>
                    <CardTitle className="text-sm mt-2">{item.title}</CardTitle>
                    <CardDescription className="text-xs line-clamp-2">{item.description}</CardDescription>
                  </CardHeader>
                  <CardContent className="flex-1 flex flex-col justify-end pt-0">
                    {/* Tags */}
                    <div className="flex flex-wrap gap-1 mb-3">
                      {item.tags.slice(0, 3).map((tag) => (
                        <span key={tag} className="px-1.5 py-0.5 bg-neutral-100 dark:bg-neutral-800 rounded text-[10px] text-muted-foreground">
                          {tag}
                        </span>
                      ))}
                    </div>
                    {/* Footer */}
                    <div className="flex items-center justify-end border-t border-neutral-100 dark:border-neutral-800 pt-3">
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => handleInstall(item)}
                        disabled={isInstalling}
                        className="text-xs h-7"
                      >
                        {isInstalling ? (
                          <Loader2 className="h-3 w-3 animate-spin" />
                        ) : (
                          <><Download className="h-3 w-3 mr-1" /> Install</>
                        )}
                      </Button>
                    </div>
                    <p className="text-[10px] text-muted-foreground mt-1.5">by {item.author}</p>
                  </CardContent>
                </Card>
              );
            })}
          </div>
          {hasMore && (
            <div className="flex justify-center pt-4">
              <Button variant="outline" size="sm" onClick={() => fetchPage(items.length, false)} disabled={loadingMore}>
                {loadingMore ? <Loader2 className="h-4 w-4 animate-spin" /> : "Load more"}
              </Button>
            </div>
          )}
          </>
        )}

        {showPublish && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" role="dialog" aria-modal="true" aria-label="Publish to marketplace">
            <div className="w-full max-w-md rounded-xl border border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-900 shadow-lg">
              <div className="flex items-center justify-between border-b border-neutral-100 dark:border-neutral-800 px-4 py-3">
                <h2 className="text-sm font-semibold">Publish a workflow</h2>
                <button onClick={() => setShowPublish(false)} className="text-muted-foreground hover:text-foreground" aria-label="Close">
                  <X className="h-4 w-4" />
                </button>
              </div>
              {savedWorkflows.length === 0 ? (
                <div className="px-4 py-8 text-center">
                  <p className="text-sm text-muted-foreground">You don&rsquo;t have any saved workflows to publish yet.</p>
                  <a href="/workflows/builder" className="mt-3 inline-block text-xs font-medium text-violet-600 dark:text-violet-400 hover:underline">Build one in the Workflow Builder →</a>
                </div>
              ) : (
                <form onSubmit={handlePublish} className="px-4 py-4 space-y-3">
                  <div>
                    <label htmlFor="pub-wf" className="text-xs font-medium text-neutral-700 dark:text-neutral-300 mb-1 block">Workflow</label>
                    <select
                      id="pub-wf"
                      value={publishForm.workflowId}
                      onChange={(e) => {
                        const wf = savedWorkflows.find((w) => w.id === e.target.value);
                        setPublishForm((f) => ({ ...f, workflowId: e.target.value, title: f.title || wf?.name || "" }));
                      }}
                      className="w-full rounded-lg border border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-800 px-3 py-2 text-sm"
                    >
                      <option value="">Select a workflow…</option>
                      {savedWorkflows.map((w) => (<option key={w.id} value={w.id}>{w.name}</option>))}
                    </select>
                  </div>
                  <div>
                    <label htmlFor="pub-title" className="text-xs font-medium text-neutral-700 dark:text-neutral-300 mb-1 block">Title</label>
                    <Input id="pub-title" value={publishForm.title} onChange={(e) => setPublishForm((f) => ({ ...f, title: e.target.value }))} placeholder="e.g. Weekly compliance audit" />
                  </div>
                  <div>
                    <label htmlFor="pub-desc" className="text-xs font-medium text-neutral-700 dark:text-neutral-300 mb-1 block">Description</label>
                    <textarea id="pub-desc" value={publishForm.description} onChange={(e) => setPublishForm((f) => ({ ...f, description: e.target.value }))} rows={3} placeholder="What does this workflow do?" className="w-full rounded-lg border border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-800 px-3 py-2 text-sm resize-y" />
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label htmlFor="pub-cat" className="text-xs font-medium text-neutral-700 dark:text-neutral-300 mb-1 block">Category</label>
                      <select id="pub-cat" value={publishForm.category} onChange={(e) => setPublishForm((f) => ({ ...f, category: e.target.value }))} className="w-full rounded-lg border border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-800 px-3 py-2 text-sm">
                        {CATEGORIES.filter((c) => c !== "All").map((c) => (<option key={c} value={c}>{c}</option>))}
                      </select>
                    </div>
                    <div>
                      <label htmlFor="pub-tags" className="text-xs font-medium text-neutral-700 dark:text-neutral-300 mb-1 block">Tags</label>
                      <Input id="pub-tags" value={publishForm.tags} onChange={(e) => setPublishForm((f) => ({ ...f, tags: e.target.value }))} placeholder="comma, separated" />
                    </div>
                  </div>
                  <div className="flex justify-end gap-2 pt-1">
                    <Button type="button" variant="outline" size="sm" onClick={() => setShowPublish(false)}>Cancel</Button>
                    <Button type="submit" size="sm" disabled={publishing}>{publishing ? "Publishing…" : "Publish"}</Button>
                  </div>
                </form>
              )}
            </div>
          </div>
        )}
      </div>
    </AppShell>
  );
}

export default function MarketplacePage() {
  return (
    <FeatureGate feature="marketplace">
      <MarketplacePageInner />
    </FeatureGate>
  );
}
