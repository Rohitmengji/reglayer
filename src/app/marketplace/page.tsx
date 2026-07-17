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
  Store, Search, Download, Star, Filter, Workflow,
  Shield, Bot, FileText, Loader2, TrendingUp,
  CheckCircle2, Users, Sparkles,
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

const FEATURED_ITEMS: MarketplaceItem[] = [
  {
    id: "featured-1",
    type: "workflow",
    title: "WCAG 2.2 Full Audit Pipeline",
    description: "Automated 8-step workflow: crawl → scan → categorize violations → prioritize → generate report → email stakeholders.",
    category: "Accessibility",
    author: "RegLayer Team",
    downloads: 2840,
    rating: 4.9,
    ratingCount: 156,
    tags: ["wcag", "audit", "automated"],
    isVerified: true,
    createdAt: "2026-06-15T00:00:00Z",
  },
  {
    id: "featured-2",
    type: "rule",
    title: "ADA Title III Compliance Gate",
    description: "Guard policy that blocks deploys if critical WCAG A violations exist on key user paths.",
    category: "Legal",
    author: "ComplianceFirst",
    downloads: 1520,
    rating: 4.7,
    ratingCount: 89,
    tags: ["ada", "legal", "ci-cd"],
    isVerified: true,
    createdAt: "2026-05-20T00:00:00Z",
  },
  {
    id: "featured-3",
    type: "agent",
    title: "Remediation Advisor Agent",
    description: "AI agent that analyzes violations and generates step-by-step code fixes with framework-specific examples.",
    category: "Remediation",
    author: "a11y.dev",
    downloads: 3100,
    rating: 4.8,
    ratingCount: 203,
    tags: ["ai", "fixes", "react", "vue"],
    isVerified: true,
    createdAt: "2026-06-01T00:00:00Z",
  },
  {
    id: "featured-4",
    type: "template",
    title: "VPAT 2.4 Report Template",
    description: "Pre-filled VPAT template with all WCAG 2.2 criteria, auto-populated from scan results.",
    category: "Reporting",
    author: "AccessibilityPros",
    downloads: 980,
    rating: 4.6,
    ratingCount: 67,
    tags: ["vpat", "report", "wcag-2.2"],
    isVerified: false,
    createdAt: "2026-07-01T00:00:00Z",
  },
  {
    id: "featured-5",
    type: "workflow",
    title: "Continuous Monitoring + Slack Alerts",
    description: "Scheduled scan every 6 hours → diff against baseline → alert in Slack if score drops below threshold.",
    category: "Monitoring",
    author: "DevOpsA11y",
    downloads: 1890,
    rating: 4.5,
    ratingCount: 112,
    tags: ["monitoring", "slack", "alerts"],
    isVerified: true,
    createdAt: "2026-06-10T00:00:00Z",
  },
  {
    id: "featured-6",
    type: "rule",
    title: "EAA (European Accessibility Act) Checklist",
    description: "Complete rule set mapping EAA requirements to WCAG criteria with auto-assessment scoring.",
    category: "Legal",
    author: "EU-Compliance",
    downloads: 750,
    rating: 4.4,
    ratingCount: 45,
    tags: ["eaa", "european", "compliance"],
    isVerified: false,
    createdAt: "2026-07-05T00:00:00Z",
  },
];

// ── Component ─────────────────────────────────────────────────────────────────

function MarketplacePageInner() {
  const [items, setItems] = useState<MarketplaceItem[]>(FEATURED_ITEMS);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState("");
  const [activeCategory, setActiveCategory] = useState("All");
  const [activeType, setActiveType] = useState<string | null>(null);
  const [installing, setInstalling] = useState<string | null>(null);

  const fetchItems = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (search) params.set("q", search);
      if (activeCategory !== "All") params.set("category", activeCategory);
      if (activeType) params.set("type", activeType);

      const res = await fetch(`/api/marketplace?${params.toString()}`);
      if (res.ok) {
        const data = await res.json();
        if (data.items?.length > 0) {
          setItems(data.items);
        }
      }
    } catch { /* Use local featured items as fallback */ }
    finally { setLoading(false); }
  }, [search, activeCategory, activeType]);

  useEffect(() => { fetchItems(); }, [fetchItems]);

  const handleInstall = async (item: MarketplaceItem) => {
    setInstalling(item.id);
    try {
      const res = await fetch("/api/marketplace/install", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ itemId: item.id, type: item.type }),
      });
      if (res.ok) {
        toast.success(`"${item.title}" installed successfully`);
      } else {
        const data = await res.json().catch(() => ({}));
        toast.error(data.error || "Install failed");
      }
    } catch { toast.error("Network error"); }
    finally { setInstalling(null); }
  };

  const filteredItems = items.filter((item) => {
    if (activeCategory !== "All" && item.category !== activeCategory) return false;
    if (activeType && item.type !== activeType) return false;
    if (search) {
      const q = search.toLowerCase();
      return item.title.toLowerCase().includes(q) || item.description.toLowerCase().includes(q) || item.tags.some((t) => t.includes(q));
    }
    return true;
  });

  return (
    <AppShell>
      <div className="space-y-6 max-w-6xl mx-auto">
        {/* Header */}
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
          <span className="flex items-center gap-1"><Users className="h-3.5 w-3.5" /> {filteredItems.length} items</span>
          <span className="flex items-center gap-1"><TrendingUp className="h-3.5 w-3.5" /> {filteredItems.reduce((s, i) => s + i.downloads, 0).toLocaleString()} total installs</span>
          <span className="flex items-center gap-1"><Sparkles className="h-3.5 w-3.5" /> {filteredItems.filter((i) => i.isVerified).length} verified</span>
        </div>

        {/* Items Grid */}
        {loading ? (
          <div className="flex items-center justify-center py-16">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        ) : filteredItems.length === 0 ? (
          <Card className="border-dashed">
            <CardContent className="flex flex-col items-center justify-center py-16 text-center">
              <Store className="h-10 w-10 text-muted-foreground/30 mb-3" />
              <h3 className="font-medium">No items match your search</h3>
              <p className="text-sm text-muted-foreground mt-1">Try adjusting your filters or search terms.</p>
            </CardContent>
          </Card>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {filteredItems.map((item) => {
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
                    <div className="flex items-center justify-between border-t border-neutral-100 dark:border-neutral-800 pt-3">
                      <div className="flex items-center gap-3 text-[11px] text-muted-foreground">
                        <span className="flex items-center gap-0.5">
                          <Star className="h-3 w-3 fill-amber-400 text-amber-400" /> {item.rating.toFixed(1)}
                        </span>
                        <span className="flex items-center gap-0.5">
                          <Download className="h-3 w-3" /> {item.downloads.toLocaleString()}
                        </span>
                      </div>
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
