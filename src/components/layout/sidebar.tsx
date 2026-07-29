"use client";

/**
 * ---------------------------------------------------------
 * RegLayer — Sidebar Navigation
 * ---------------------------------------------------------
 *
 * WHY: Primary navigation for authenticated users.
 * Always visible on desktop, drawer on mobile.
 *
 * WHAT:
 * - Workspace switcher at top
 * - Nav consolidated into hubs + grouped into modern sections
 *   (see the navSections doc comment below for the live structure)
 * - Master Admin section (only for isMasterAdmin users)
 * - Footer: ⌘K search + a user menu (Notifications, Help & docs,
 *   theme toggle, language selector, Sign out)
 *
 * HOW:
 * - Uses usePathname() for active highlighting (path-boundary match,
 *   so /test never lights up on the unrelated /testing route)
 * - i18n: nav labels use t() with compile-checked TranslationKey keys
 * - Theme/language/help/notifications live in the user menu to keep
 *   the nav uncluttered
 * - onNavigate callback closes mobile drawer after navigation
 * ---------------------------------------------------------
 */

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useSession } from "next-auth/react";
import { signOutAndClear } from "@/lib/auth/sign-out";
import { cn } from "@/lib/utils/cn";
import { useTheme } from "@/components/theme-provider";
import { Shield, LayoutDashboard, Scan, Grid3X3, Moon, Sun, Crown, ChevronDown, Settings, BarChart3, Zap, Plug, LogOut, AlertTriangle, TrendingUp, Building2, ChevronsUpDown, Check, BookOpen, Search, HelpCircle, Trophy, Radar, Flame, Sparkles, Bot, Workflow, Store, Activity } from "lucide-react";
import { useI18n } from "@/components/i18n-provider";
import { SUPPORTED_LOCALES, type TranslationKey } from "@/lib/i18n/translations";
import { useState, useEffect, useRef, useCallback } from "react";
import { useFeatures, invalidateFeatureCache } from "@/hooks/use-features";
import { SIDEBAR_FEATURE_MAP } from "@/lib/features/feature-catalog";
import { NotificationBell } from "@/components/notifications/notification-bell";

type NavLeaf = {
  name: string;
  key: TranslationKey; // i18n key for the visible label (compile-checked)
  href: string;
  icon: React.ComponentType<{ className?: string }>;
  // Hub items fold several routes into one tabbed page: visible if ANY listed
  // feature is enabled, and shown active on any of their constituent routes.
  anyFeatures?: string[];
  activePaths?: string[];
};
type NavSection = { labelKey?: TranslationKey; items: NavLeaf[] };

/**
 * Sidebar IA — related routes are consolidated into tabbed hubs (the same pattern
 * as Manage/Compliance) so the list stays short, and the rest is grouped by who
 * uses it:
 *  - Primary (unlabeled): the daily operator tools.
 *      • Testing hub (/test)    → Scans · Crawl · Manual Testing
 *      • Reports hub (/reports) → Trends · Executive
 *  - "Compliance & Reports" → the business/buyer view (posture + reporting).
 *  - "Workspace"            → client/agency + configuration.
 * Blog lives in the footer — it's content, not a daily tool. NOTE: the Testing
 * hub route is /test, distinct from the legacy /testing (Human Testing Network).
 */
const navSections: NavSection[] = [
  {
    items: [
      { name: "Dashboard", key: "nav.dashboard", href: "/dashboard", icon: LayoutDashboard },
      {
        name: "Testing",
        key: "testHub.title",
        href: "/test?tab=scans",
        icon: Scan,
        anyFeatures: ["scans", "crawl", "manualTesting"],
        activePaths: ["/test", "/scans", "/crawl", "/manual-testing"],
      },
      { name: "Violations", key: "nav.violations", href: "/violations", icon: AlertTriangle },
      { name: "Red Team", key: "nav.redteam", href: "/chaos?tab=red-team", icon: Shield },
      { name: "Chaos", key: "nav.chaos", href: "/chaos", icon: Flame },
      { name: "Analysis", key: "nav.analysis", href: "/analysis?tab=screen-reader", icon: BarChart3 },
      { name: "Automation", key: "nav.automation", href: "/automation?tab=remediation", icon: Zap },
      { name: "Agents", key: "nav.agents", href: "/agents", icon: Bot },
      { name: "Workflows", key: "nav.workflows", href: "/workflows", icon: Workflow },
      { name: "Marketplace", key: "nav.marketplace", href: "/marketplace", icon: Store },
      { name: "Blog", key: "nav.blog", href: "/blog", icon: BookOpen },
    ],
  },
  {
    labelKey: "nav.group.reports",
    items: [
      { name: "Compliance", key: "nav.compliance", href: "/compliance?tab=matrix", icon: Grid3X3 },
      {
        name: "Reports",
        key: "reports.title",
        href: "/reports?tab=trends",
        icon: TrendingUp,
        anyFeatures: ["trends", "executive"],
        activePaths: ["/reports", "/trends", "/executive"],
      },
      { name: "Warranty", key: "nav.warranty", href: "/warranty", icon: Shield },
      { name: "Competitive", key: "nav.competitive", href: "/competitive", icon: Trophy },
      { name: "Radar", key: "nav.radar", href: "/radar", icon: Radar },
    ],
  },
  {
    labelKey: "nav.group.workspace",
    items: [
      { name: "Manage", key: "nav.manage", href: "/manage?tab=team", icon: Plug },
      { name: "Knowledge", key: "nav.knowledge", href: "/knowledge", icon: BookOpen },
      { name: "AI Costs", key: "nav.aiCosts", href: "/dashboard/ai-costs", icon: Sparkles },
      { name: "Timeline", key: "nav.timeline", href: "/dashboard/timeline", icon: Activity },
      { name: "Agency", key: "nav.agency", href: "/agency", icon: Building2 },
      { name: "Settings", key: "nav.settings", href: "/settings", icon: Settings },
    ],
  },
];

interface SidebarProps {
  onNavigate?: () => void;
}

// ── Extracted: prevents re-creation on every render (fix reconciliation) ──
function NavItem({ item, pathname, onNavigate, t }: {
  item: NavLeaf;
  pathname: string;
  onNavigate?: () => void;
  t: (key: TranslationKey) => string;
}) {
  const paths = item.activePaths ?? [item.href.split("?")[0]];
  const isActive = paths.some((p) => pathname === p || pathname.startsWith(p + "/"));
  return (
    <Link
      href={item.href}
      onClick={onNavigate}
      aria-current={isActive ? "page" : undefined}
      className={cn(
        "group flex items-center gap-3 rounded-lg px-3 py-2 text-[13px] font-medium transition-all duration-150",
        isActive
          ? "bg-neutral-900 text-white dark:bg-white dark:text-neutral-900"
          : "text-neutral-600 hover:bg-neutral-100 hover:text-neutral-900 dark:text-neutral-400 dark:hover:bg-neutral-800 dark:hover:text-white"
      )}
    >
      <item.icon className={cn("h-4 w-4 shrink-0", isActive ? "text-white dark:text-neutral-900" : "text-neutral-400 group-hover:text-neutral-600 dark:group-hover:text-neutral-300")} />
      {t(item.key)}
    </Link>
  );
}

// ── useClickOutside: consolidates 3 identical click-outside effects ──
function useClickOutside(ref: React.RefObject<HTMLElement | null>, handler: () => void, enabled = true) {
  useEffect(() => {
    if (!enabled) return;
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) handler();
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") handler();
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [ref, handler, enabled]);
}

export function Sidebar({ onNavigate }: SidebarProps) {
  const pathname = usePathname();
  const { data: session } = useSession();
  const { resolvedTheme, setTheme, mounted } = useTheme();
  const { locale, setLocale, t } = useI18n();
  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const [langOpen, setLangOpen] = useState(false);
  const langRef = useRef<HTMLDivElement>(null);
  const userMenuRef = useRef<HTMLDivElement>(null);
  const { hasFeature, loading: featuresLoading } = useFeatures();
  const [wsOpen, setWsOpen] = useState(false);
  const [workspaces, setWorkspaces] = useState<{ id: string; name: string; slug: string; plan: string; role: string; memberCount: number }[]>([]);
  const [activeWs, setActiveWs] = useState<string>("");
  const wsRef = useRef<HTMLDivElement>(null);

  // Consolidated click-outside handlers (replaces 3 duplicated useEffects)
  const closeLang = useCallback(() => setLangOpen(false), []);
  const closeUserMenu = useCallback(() => setUserMenuOpen(false), []);
  const closeWs = useCallback(() => setWsOpen(false), []);
  useClickOutside(langRef, closeLang, langOpen);
  useClickOutside(userMenuRef, closeUserMenu, userMenuOpen);
  useClickOutside(wsRef, closeWs, wsOpen);

  // Fetch workspaces
  useEffect(() => {
    if (!session?.user) return;
    fetch("/api/workspaces")
      .then((r) => r.ok ? r.json() : Promise.reject())
      .then((data) => {
        setWorkspaces(data.workspaces ?? []);
        // Set active from cookie or first workspace
        const cookieWs = document.cookie.match(/reglayer-workspace=([^;]+)/)?.[1];
        const active = data.workspaces?.find((w: { id: string }) => w.id === cookieWs) || data.workspaces?.[0];
        if (active) setActiveWs(active.id);
      })
      .catch(() => {});
  }, [session]);

  const switchWorkspace = (wsId: string) => {
    setActiveWs(wsId);
    setWsOpen(false);
    fetch("/api/workspaces", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ workspaceId: wsId }),
    }).then(() => {
      invalidateFeatureCache();
      window.location.reload();
    });
  };

  const currentWs = workspaces.find((w) => w.id === activeWs);

  // A nav item is visible unless gated. Hub items expose several routes, so they
  // show if ANY of their features is enabled; simple items use the route's gate.
  const isItemVisible = (item: NavLeaf) => {
    if (featuresLoading) return true; // Show all during initial load (AppShell handles the spinner)
    if (item.anyFeatures) return item.anyFeatures.some((f) => hasFeature(f));
    const featureId = SIDEBAR_FEATURE_MAP[item.href.split("?")[0]];
    if (!featureId) return true; // No gate = always show
    return hasFeature(featureId);
  };

  return (
    <aside className="flex h-full w-64 flex-col bg-neutral-50 dark:bg-neutral-900 border-r border-neutral-200/60 dark:border-neutral-800">
      {/* Workspace Switcher */}
      <div className="px-3 pt-3 pb-3 border-b border-neutral-200/60 dark:border-neutral-800" ref={wsRef}>
        <button
          onClick={() => workspaces.length > 1 ? setWsOpen(!wsOpen) : undefined}
          className={cn(
            "flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2.5 transition-colors",
            workspaces.length > 1
              ? "hover:bg-neutral-200/60 dark:hover:bg-neutral-800 cursor-pointer"
              : "cursor-default"
          )}
        >
          <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-neutral-900 dark:bg-white">
            <svg className="h-4 w-4" viewBox="0 0 26 26" fill="none" stroke="currentColor" strokeWidth="2.1" strokeLinejoin="round" strokeLinecap="round">
              <path d="M13 1.5 24.5 7.5 13 13.5 1.5 7.5 13 1.5Z" fill="currentColor" className="text-white dark:text-neutral-900" />
              <path d="M1.5 13 13 19 24.5 13" className="text-white dark:text-neutral-900" />
              <path d="M1.5 18.5 13 24.5 24.5 18.5" className="text-white dark:text-neutral-900" />
            </svg>
          </div>
          <div className="min-w-0 flex-1 text-left">
            <p className="truncate text-[13px] font-semibold text-neutral-900 dark:text-white">
              {currentWs?.name || "RegLayer"}
            </p>
            {currentWs && (
              <p className="text-[10px] text-neutral-500 dark:text-neutral-400 uppercase tracking-wider">{currentWs.plan}</p>
            )}
          </div>
          {workspaces.length > 1 && (
            <ChevronsUpDown className="h-3.5 w-3.5 text-neutral-500 dark:text-neutral-400 shrink-0" />
          )}
        </button>

        {wsOpen && workspaces.length > 1 && (
          <div className="mt-1 rounded-lg border border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-900 shadow-lg py-1 z-50 relative">
            <p className="px-3 py-1 text-[10px] font-semibold uppercase tracking-wider text-neutral-500 dark:text-neutral-400">Workspaces</p>
            {workspaces.map((ws) => (
              <button
                key={ws.id}
                onClick={() => switchWorkspace(ws.id)}
                className={cn(
                  "flex w-full items-center gap-2.5 px-3 py-2 text-[13px] transition-colors",
                  ws.id === activeWs
                    ? "bg-neutral-100 dark:bg-neutral-800 font-medium"
                    : "hover:bg-neutral-50 dark:hover:bg-neutral-800/50"
                )}
              >
                <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded bg-neutral-200 dark:bg-neutral-700 text-[10px] font-bold text-neutral-600 dark:text-neutral-300">
                  {ws.name.charAt(0).toUpperCase()}
                </div>
                <div className="min-w-0 flex-1 text-left">
                  <p className="truncate text-neutral-800 dark:text-neutral-200">{ws.name}</p>
                  <p className="text-[10px] text-neutral-500 dark:text-neutral-400">{ws.plan} · {ws.role}</p>
                </div>
                {ws.id === activeWs && <Check className="h-3.5 w-3.5 text-green-500 shrink-0" />}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Navigation */}
      <nav aria-label="Main" className="flex-1 overflow-y-auto px-3 pt-3 pb-3 space-y-5">
        {/* Sections: the first (primary) is unlabeled; the rest carry a quiet
            uppercase label. Sections emptied by feature gates are hidden. */}
        {navSections.map((section, i) => {
          const items = section.items.filter(isItemVisible);
          if (items.length === 0) return null;
          return (
            <div key={section.labelKey ?? `primary-${i}`} className="space-y-0.5">
              {section.labelKey && (
                <p className="px-3 pb-1 text-[11px] font-semibold uppercase tracking-wider text-neutral-600 dark:text-neutral-400">
                  {t(section.labelKey)}
                </p>
              )}
              {items.map((item) => (
                <NavItem key={item.name} item={item} pathname={pathname} onNavigate={onNavigate} t={t} />
              ))}
            </div>
          );
        })}

        {/* Master Admin */}
        {session?.user?.isMasterAdmin && (
          <div className="space-y-0.5">
            <p className="px-3 pb-1 text-[11px] font-semibold uppercase tracking-wider text-red-400">Admin</p>
            <Link
              href="/admin"
              onClick={onNavigate}
              className={cn(
                "flex items-center gap-3 rounded-lg px-3 py-2 text-[13px] font-medium transition-all duration-150",
                pathname === "/admin"
                  ? "bg-red-600 text-white"
                  : "text-red-600 hover:bg-red-50 dark:text-red-400 dark:hover:bg-red-900/20"
              )}
            >
              <Crown className="h-4 w-4" />
              Admin Panel
            </Link>
            <Link
              href="/admin/features"
              onClick={onNavigate}
              className={cn(
                "flex items-center gap-3 rounded-lg px-3 py-2 text-[13px] font-medium transition-all duration-150",
                pathname === "/admin/features"
                  ? "bg-red-600 text-white"
                  : "text-red-600 hover:bg-red-50 dark:text-red-400 dark:hover:bg-red-900/20"
              )}
            >
              <Shield className="h-4 w-4" />
              Feature Gates
            </Link>
          </div>
        )}
      </nav>

      {/* Bottom Area */}
      <div className="border-t border-neutral-200/60 dark:border-neutral-800 p-3 space-y-1">
        {/* Search (command palette) — make the ⌘K shortcut discoverable */}
        <button
          onClick={() => window.dispatchEvent(new Event("reglayer:open-command-palette"))}
          className="flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-[13px] font-medium text-neutral-600 dark:text-neutral-400 hover:bg-neutral-200/60 dark:hover:bg-neutral-800 hover:text-neutral-900 dark:hover:text-white transition-colors"
        >
          <Search className="h-4 w-4 shrink-0" />
          <span className="flex-1 text-left">{t("nav.search")}</span>
          <kbd className="rounded border border-neutral-300 dark:border-neutral-600 px-1.5 py-0.5 text-[10px] font-medium text-neutral-400 dark:text-neutral-500">⌘K</kbd>
        </button>

        {/* User */}
        {session?.user && (
          <div className="relative" ref={userMenuRef}>
            <button
              onClick={() => setUserMenuOpen(!userMenuOpen)}
              aria-haspopup="true"
              aria-expanded={userMenuOpen}
              aria-controls="user-menu-popup"
              className="flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 hover:bg-neutral-200/60 dark:hover:bg-neutral-800 transition-colors"
            >
              <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-linear-to-br from-blue-500 to-purple-600 text-[11px] font-bold text-white">
                {(session.user.name || session.user.email || "U").charAt(0).toUpperCase()}
              </div>
              <div className="min-w-0 flex-1 text-left">
                <p className="truncate text-[13px] font-medium text-neutral-800 dark:text-neutral-200">
                  {session.user.name || session.user.email?.split("@")[0]}
                </p>
              </div>
              <ChevronDown className={cn("h-3.5 w-3.5 text-neutral-500 dark:text-neutral-400 transition-transform", userMenuOpen && "rotate-180")} />
            </button>

            {userMenuOpen && (
              <div id="user-menu-popup" className="absolute bottom-full left-0 right-0 mb-1 rounded-lg border border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-900 shadow-lg py-1 z-50">
                <div className="px-3 py-2 border-b border-neutral-100 dark:border-neutral-800">
                  <p className="text-[12px] font-medium text-neutral-700 dark:text-neutral-300 truncate">{session.user.email}</p>
                </div>

                {/* Notifications + Help — utility actions, above the theme/language row */}
                <div className="border-b border-neutral-100 dark:border-neutral-800 py-0.5">
                  <NotificationBell />
                  <Link
                    href="/docs"
                    onClick={onNavigate}
                    className="flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-[13px] font-medium text-neutral-700 dark:text-neutral-300 hover:bg-neutral-100 dark:hover:bg-neutral-800 transition-colors"
                  >
                    <HelpCircle className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                    <span className="flex-1 text-left">{t("nav.help")}</span>
                  </Link>
                </div>

                {/* Theme + Language inside menu */}
                <div className="flex items-center justify-between px-3 py-2 border-b border-neutral-100 dark:border-neutral-800">
                  {mounted && (
                    <button
                      onClick={() => setTheme(resolvedTheme === "dark" ? "light" : "dark")}
                      className="flex items-center gap-2 text-[13px] font-medium text-neutral-600 dark:text-neutral-300 hover:text-neutral-900 dark:hover:text-white transition-colors"
                      title={resolvedTheme === "dark" ? "Light mode" : "Dark mode"}
                    >
                      {resolvedTheme === "dark" ? <Sun className="h-3.5 w-3.5" /> : <Moon className="h-3.5 w-3.5" />}
                      {resolvedTheme === "dark" ? "Light" : "Dark"}
                    </button>
                  )}
                  <div className="relative" ref={langRef}>
                    <button
                      onClick={() => setLangOpen(!langOpen)}
                      className="inline-flex items-center gap-1.5 rounded-lg border border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-800 px-2 py-1 text-[11px] font-medium text-neutral-600 dark:text-neutral-300 hover:bg-neutral-50 dark:hover:bg-neutral-700 transition-all"
                      aria-label="Select language"
                      aria-expanded={langOpen}
                    >
                      <span className="text-sm leading-none">{SUPPORTED_LOCALES.find((l) => l.code === locale)?.flag}</span>
                      <span>{SUPPORTED_LOCALES.find((l) => l.code === locale)?.name}</span>
                      <ChevronDown className={`h-3 w-3 text-neutral-400 transition-transform duration-200 ${langOpen ? "rotate-180" : ""}`} />
                    </button>
                    {langOpen && (
                      <div className="absolute left-0 bottom-full mb-2 w-40 rounded-xl border border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-900 shadow-lg shadow-neutral-200/50 dark:shadow-neutral-900/50 py-1.5 z-50">
                        {SUPPORTED_LOCALES.map((l) => (
                          <button
                            key={l.code}
                            onClick={() => { setLocale(l.code as typeof locale); setLangOpen(false); }}
                            className={`flex w-full items-center gap-2.5 px-3 py-2 text-xs transition-colors ${
                              locale === l.code
                                ? "bg-neutral-100 dark:bg-neutral-800 text-neutral-900 dark:text-white font-medium"
                                : "text-neutral-600 dark:text-neutral-400 hover:bg-neutral-50 dark:hover:bg-neutral-800 hover:text-neutral-900 dark:hover:text-white"
                            }`}
                          >
                            <span className="text-sm leading-none">{l.flag}</span>
                            <span>{l.name}</span>
                            {locale === l.code && (
                              <Check className="ml-auto h-3.5 w-3.5 text-green-600" />
                            )}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                </div>

                <button
                  onClick={() => signOutAndClear({ callbackUrl: "/auth/login" })}
                  className="flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-[13px] font-medium text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors"
                >
                  <LogOut className="h-3.5 w-3.5" />
                  Sign out
                </button>
              </div>
            )}
          </div>
        )}
      </div>
    </aside>
  );
}
