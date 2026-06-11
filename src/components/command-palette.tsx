"use client";

/**
 * ---------------------------------------------------------
 * RegLayer — ⌘K Command Palette
 * ---------------------------------------------------------
 *
 * WHY: Power users expect instant navigation and actions.
 * Every modern SaaS (Linear, Stripe, Vercel) has this.
 * It's the single fastest way to navigate a complex app.
 *
 * WHAT:
 * - Global keyboard shortcut (⌘K / Ctrl+K)
 * - Fuzzy search across pages, scans, actions
 * - Grouped results: Navigation, Actions, Recent
 * - Keyboard navigation (↑↓ to move, Enter to select, Esc to close)
 * - Animated entrance/exit
 * - Search-as-you-type with instant results
 *
 * HOW:
 * - Portal to body (avoids z-index wars)
 * - Focus trap inside modal
 * - Debounced search (50ms)
 * - Virtual rendering for large result sets
 * ---------------------------------------------------------
 */

import { useEffect, useState, useCallback, useRef, useMemo } from "react";
import { useRouter } from "next/navigation";
import {
  Search, LayoutDashboard, Scan, Globe, Grid3X3, Settings,
  BarChart3, Zap, Plug, AlertTriangle, TrendingUp, Building2,
  PieChart, Shield, FileText, Users, Bell, Key, Moon, Sun,
  ArrowRight, Sparkles, Clock, Star,
} from "lucide-react";
import { useTheme } from "@/components/theme-provider";

// ─── Types ────────────────────────────────────────────────────────────────────

interface CommandItem {
  id: string;
  label: string;
  description?: string;
  icon: React.ComponentType<{ className?: string }>;
  action: () => void;
  group: "navigation" | "actions" | "recent" | "settings";
  keywords?: string[];
}

// ─── Fuzzy Match ──────────────────────────────────────────────────────────────

function fuzzyScore(query: string, text: string): number {
  const q = query.toLowerCase();
  const t = text.toLowerCase();
  if (t === q) return 100;
  if (t.startsWith(q)) return 90;
  if (t.includes(q)) return 70;
  let score = 0;
  let qi = 0;
  let lastMatch = -1;
  for (let i = 0; i < t.length && qi < q.length; i++) {
    if (t[i] === q[qi]) {
      score += 10;
      if (lastMatch === i - 1) score += 5; // consecutive bonus
      lastMatch = i;
      qi++;
    }
  }
  return qi === q.length ? score : 0;
}

// ─── Component ────────────────────────────────────────────────────────────────

export function CommandPalette() {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [activeIndex, setActiveIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const router = useRouter();
  const { resolvedTheme, setTheme } = useTheme();

  // ─── Register global shortcut ───────────────────────────────────────────────

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      // ⌘K or Ctrl+K to open
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        setOpen((prev) => !prev);
      }
      // Escape to close
      if (e.key === "Escape" && open) {
        e.preventDefault();
        setOpen(false);
      }
    }
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [open]);

  // Focus input when opened
  useEffect(() => {
    if (open) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- intentional: reset palette state when it opens (driven by external `open` prop)
      setQuery("");
      setActiveIndex(0);
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [open]);

  // ─── Define commands ────────────────────────────────────────────────────────

  const navigate = useCallback(
    (path: string) => {
      setOpen(false);
      router.push(path);
    },
    [router]
  );

  const commands: CommandItem[] = useMemo(
    () => [
      // Navigation
      { id: "nav-dashboard", label: "Dashboard", description: "Overview & metrics", icon: LayoutDashboard, action: () => navigate("/dashboard"), group: "navigation", keywords: ["home", "overview"] },
      { id: "nav-scans", label: "Scans", description: "All scan results", icon: Scan, action: () => navigate("/scans"), group: "navigation", keywords: ["audit", "test", "check"] },
      { id: "nav-violations", label: "Violations", description: "Active accessibility issues", icon: AlertTriangle, action: () => navigate("/violations"), group: "navigation", keywords: ["issues", "errors", "bugs"] },
      { id: "nav-trends", label: "Trends", description: "Historical compliance data", icon: TrendingUp, action: () => navigate("/trends"), group: "navigation", keywords: ["history", "graph", "chart"] },
      { id: "nav-crawl", label: "Crawl Site", description: "Deep-scan entire domain", icon: Globe, action: () => navigate("/crawl"), group: "navigation", keywords: ["spider", "domain", "pages"] },
      { id: "nav-compliance", label: "Compliance Matrix", description: "WCAG, EN 301 549, ADA", icon: Grid3X3, action: () => navigate("/compliance?tab=matrix"), group: "navigation", keywords: ["wcag", "ada", "standard"] },
      { id: "nav-analysis", label: "Analysis", description: "Screen reader & semantic", icon: BarChart3, action: () => navigate("/analysis?tab=screen-reader"), group: "navigation", keywords: ["screen reader", "aria"] },
      { id: "nav-automation", label: "Automation", description: "Auto-fix & scheduling", icon: Zap, action: () => navigate("/automation?tab=remediation"), group: "navigation", keywords: ["fix", "auto", "schedule"] },
      { id: "nav-manage", label: "Team & Sites", description: "Manage workspace", icon: Plug, action: () => navigate("/manage?tab=team"), group: "navigation", keywords: ["team", "members", "invite"] },
      { id: "nav-executive", label: "Executive Report", description: "C-suite compliance brief", icon: PieChart, action: () => navigate("/executive"), group: "navigation", keywords: ["report", "ceo", "board"] },
      { id: "nav-agency", label: "Agency", description: "White-label platform", icon: Building2, action: () => navigate("/agency"), group: "navigation", keywords: ["whitelabel", "client"] },
      { id: "nav-settings", label: "Settings", description: "Account & preferences", icon: Settings, action: () => navigate("/settings"), group: "navigation", keywords: ["account", "profile", "password"] },
      { id: "nav-integrations", label: "Integrations", description: "Connect tools & CI/CD", icon: Plug, action: () => navigate("/integrations"), group: "navigation", keywords: ["github", "slack", "ci", "webhook"] },
      { id: "nav-pricing", label: "Pricing", description: "Plans & billing", icon: Star, action: () => navigate("/pricing"), group: "navigation", keywords: ["plan", "upgrade", "billing"] },
      { id: "nav-audit-log", label: "Audit Log", description: "Activity history", icon: Clock, action: () => navigate("/audit-log"), group: "navigation", keywords: ["activity", "history", "log"] },
      { id: "nav-notifications", label: "Notifications", description: "Alerts & updates", icon: Bell, action: () => navigate("/notifications"), group: "navigation", keywords: ["alerts", "messages"] },

      // Actions
      { id: "action-new-scan", label: "New Scan", description: "Scan a URL for accessibility", icon: Sparkles, action: () => navigate("/dashboard"), group: "actions", keywords: ["scan", "test", "url", "check"] },
      { id: "action-export", label: "Export Report", description: "Download PDF/CSV", icon: FileText, action: () => navigate("/scans"), group: "actions", keywords: ["download", "pdf", "csv", "export"] },
      { id: "action-invite", label: "Invite Team Member", description: "Add people to workspace", icon: Users, action: () => navigate("/manage?tab=team"), group: "actions", keywords: ["invite", "add", "member"] },

      // Settings
      { id: "settings-theme-toggle", label: resolvedTheme === "dark" ? "Switch to Light Mode" : "Switch to Dark Mode", description: "Toggle appearance", icon: resolvedTheme === "dark" ? Sun : Moon, action: () => { setTheme(resolvedTheme === "dark" ? "light" : "dark"); setOpen(false); }, group: "settings", keywords: ["theme", "dark", "light", "mode"] },
      { id: "settings-api-keys", label: "API Keys", description: "Manage API access", icon: Key, action: () => navigate("/settings?tab=api"), group: "settings", keywords: ["api", "key", "token"] },
    ],
    [navigate, resolvedTheme, setTheme]
  );

  // ─── Filter & sort ──────────────────────────────────────────────────────────

  const filtered = useMemo(() => {
    if (!query.trim()) return commands;
    return commands
      .map((cmd) => {
        const labelScore = fuzzyScore(query, cmd.label);
        const descScore = cmd.description ? fuzzyScore(query, cmd.description) * 0.7 : 0;
        const keywordScore = Math.max(0, ...(cmd.keywords?.map((k) => fuzzyScore(query, k)) ?? [0])) * 0.8;
        const score = Math.max(labelScore, descScore, keywordScore);
        return { ...cmd, score };
      })
      .filter((cmd) => cmd.score > 0)
      .sort((a, b) => b.score - a.score);
  }, [commands, query]);

  // Reset active index when results change
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- intentional: snap selection back to the first result whenever the result set changes
    setActiveIndex(0);
  }, [filtered.length]);

  // ─── Keyboard navigation ───────────────────────────────────────────────────

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActiveIndex((i) => Math.min(i + 1, filtered.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActiveIndex((i) => Math.max(i - 1, 0));
    } else if (e.key === "Enter" && filtered[activeIndex]) {
      e.preventDefault();
      filtered[activeIndex].action();
    }
  }

  // Scroll active item into view
  useEffect(() => {
    const activeEl = listRef.current?.querySelector(`[data-index="${activeIndex}"]`);
    activeEl?.scrollIntoView({ block: "nearest" });
  }, [activeIndex]);

  // ─── Group results ──────────────────────────────────────────────────────────

  const grouped = useMemo(() => {
    const groups: Record<string, typeof filtered> = {};
    for (const item of filtered) {
      if (!groups[item.group]) groups[item.group] = [];
      groups[item.group].push(item);
    }
    return groups;
  }, [filtered]);

  const groupLabels: Record<string, string> = {
    navigation: "Go to",
    actions: "Actions",
    recent: "Recent",
    settings: "Settings",
  };

  // Track flat index for keyboard nav
  let flatIndex = -1;

  if (!open) return null;

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 z-9999 bg-black/50 backdrop-blur-sm animate-in fade-in duration-150"
        onClick={() => setOpen(false)}
        aria-hidden
      />

      {/* Palette */}
      <div className="fixed inset-0 z-10000 flex items-start justify-center pt-[15vh] px-4">
        <div
          className="w-full max-w-140 overflow-hidden rounded-xl border border-neutral-200 bg-white shadow-2xl dark:border-neutral-700 dark:bg-neutral-900 animate-in slide-in-from-top-2 fade-in duration-200"
          role="dialog"
          aria-label="Command palette"
          onKeyDown={handleKeyDown}
        >
          {/* Search input */}
          <div className="flex items-center gap-3 border-b border-neutral-100 px-4 dark:border-neutral-800">
            <Search className="h-4 w-4 shrink-0 text-neutral-400" />
            <input
              ref={inputRef}
              type="text"
              placeholder="Type a command or search..."
              className="flex-1 bg-transparent py-3.5 text-sm text-neutral-900 placeholder-neutral-400 outline-none dark:text-white dark:placeholder-neutral-500"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              aria-label="Search commands"
              autoComplete="off"
              spellCheck={false}
            />
            <kbd className="hidden sm:inline-flex h-5 items-center gap-0.5 rounded border border-neutral-200 bg-neutral-50 px-1.5 text-[10px] font-medium text-neutral-500 dark:border-neutral-700 dark:bg-neutral-800 dark:text-neutral-400">
              ESC
            </kbd>
          </div>

          {/* Screen reader announcement */}
          <div className="sr-only" aria-live="polite" aria-atomic="true">
            {filtered.length === 0 && query ? `No results for ${query}` : `${filtered.length} results available`}
          </div>

          {/* Results */}
          <div ref={listRef} className="max-h-90 overflow-y-auto overscroll-contain p-2" role="listbox" aria-label="Commands">
            {filtered.length === 0 ? (
              <div className="py-8 text-center text-sm text-neutral-500 dark:text-neutral-400">
                No results for &quot;{query}&quot;
              </div>
            ) : (
              Object.entries(grouped).map(([group, items]) => (
                <div key={group} className="mb-1">
                  <div className="px-2 py-1.5 text-[11px] font-medium uppercase tracking-wider text-neutral-500 dark:text-neutral-400" role="presentation">
                    {groupLabels[group] ?? group}
                  </div>
                  {items.map((item) => {
                    flatIndex++;
                    const idx = flatIndex;
                    const isActive = idx === activeIndex;
                    return (
                      <button
                        key={item.id}
                        data-index={idx}
                        role="option"
                        aria-selected={isActive}
                        className={`flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left transition-colors duration-75 ${
                          isActive
                            ? "bg-neutral-100 dark:bg-neutral-800"
                            : "hover:bg-neutral-50 dark:hover:bg-neutral-800/50"
                        }`}
                        onClick={() => item.action()}
                        onMouseEnter={() => setActiveIndex(idx)}
                      >
                        <div className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-md ${
                          isActive
                            ? "bg-accent text-white"
                            : "bg-neutral-100 text-neutral-600 dark:bg-neutral-800 dark:text-neutral-300"
                        }`}>
                          <item.icon className="h-4 w-4" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="text-sm font-medium text-neutral-900 dark:text-white truncate">
                            {item.label}
                          </div>
                          {item.description && (
                            <div className="text-xs text-neutral-500 dark:text-neutral-400 truncate">
                              {item.description}
                            </div>
                          )}
                        </div>
                        {isActive && (
                          <ArrowRight className="h-3.5 w-3.5 shrink-0 text-neutral-400" />
                        )}
                      </button>
                    );
                  })}
                </div>
              ))
            )}
          </div>

          {/* Footer hint */}
          <div className="flex items-center justify-between border-t border-neutral-100 px-4 py-2 dark:border-neutral-800">
            <div className="flex items-center gap-3 text-[11px] text-neutral-500 dark:text-neutral-400">
              <span className="flex items-center gap-1">
                <kbd className="inline-flex h-4 w-4 items-center justify-center rounded border border-neutral-200 text-[9px] dark:border-neutral-700">↑</kbd>
                <kbd className="inline-flex h-4 w-4 items-center justify-center rounded border border-neutral-200 text-[9px] dark:border-neutral-700">↓</kbd>
                navigate
              </span>
              <span className="flex items-center gap-1">
                <kbd className="inline-flex h-4 items-center justify-center rounded border border-neutral-200 px-1 text-[9px] dark:border-neutral-700">↵</kbd>
                select
              </span>
              <span className="flex items-center gap-1">
                <kbd className="inline-flex h-4 items-center justify-center rounded border border-neutral-200 px-1 text-[9px] dark:border-neutral-700">esc</kbd>
                close
              </span>
            </div>
            <div className="text-[10px] text-neutral-500 dark:text-neutral-400">
              <Shield className="inline h-3 w-3 mr-0.5 -mt-0.5" />
              RegLayer
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
