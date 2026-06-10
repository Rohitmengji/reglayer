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
 * - Brand logo at top
 * - Grouped nav items: Main (Dashboard, Scans, Crawl, Compliance,
 *   Analysis, Automation, Manage, Settings)
 * - Master Admin section (only for isMasterAdmin users)
 * - User menu popup at bottom with:
 *   - Email display
 *   - Theme toggle (dark/light)
 *   - Language selector (7 EU languages)
 *   - Sign out button
 *
 * HOW:
 * - Uses usePathname() for active link highlighting
 * - NavItem component determines active state by matching path prefix
 * - i18n: nav labels use t() translation function with keys
 * - Theme/language controls in popup prevent sidebar clutter
 * - onNavigate callback closes mobile drawer after navigation
 * ---------------------------------------------------------
 */

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useSession, signOut } from "next-auth/react";
import { cn } from "@/lib/utils/cn";
import { useTheme } from "@/components/theme-provider";
import { Shield, LayoutDashboard, Scan, Globe, Grid3X3, Moon, Sun, Languages, Crown, ChevronDown, Settings, BarChart3, Zap, Plug, LogOut, AlertTriangle, TrendingUp, Building2, PieChart, ChevronsUpDown, Check, BookOpen } from "lucide-react";
import { useI18n } from "@/components/i18n-provider";
import { SUPPORTED_LOCALES } from "@/lib/i18n/translations";
import { useState, useEffect, useRef } from "react";
import { useFeatures, invalidateFeatureCache } from "@/hooks/use-features";
import { SIDEBAR_FEATURE_MAP } from "@/lib/features/feature-catalog";

const mainNav = [
  { name: "Dashboard", key: "nav.dashboard", href: "/dashboard", icon: LayoutDashboard },
  { name: "Scans", key: "nav.scans", href: "/scans", icon: Scan },
  { name: "Violations", key: "", href: "/violations", icon: AlertTriangle },
  { name: "Trends", key: "", href: "/trends", icon: TrendingUp },
  { name: "Crawl Site", key: "nav.crawl", href: "/crawl", icon: Globe },
  { name: "Compliance", key: "nav.compliance", href: "/compliance?tab=matrix", icon: Grid3X3 },
  { name: "Analysis", key: "", href: "/analysis?tab=screen-reader", icon: BarChart3 },
  { name: "Blog", key: "", href: "/blog", icon: BookOpen },
  { name: "Automation", key: "", href: "/automation?tab=remediation", icon: Zap },
  { name: "Manage", key: "", href: "/manage?tab=team", icon: Plug },
  { name: "Executive", key: "", href: "/executive", icon: PieChart },
  { name: "Agency", key: "", href: "/agency", icon: Building2 },
  { name: "Settings", key: "nav.settings", href: "/settings", icon: Settings },
];

interface SidebarProps {
  onNavigate?: () => void;
}

export function Sidebar({ onNavigate }: SidebarProps) {
  const pathname = usePathname();
  const { data: session } = useSession();
  const { resolvedTheme, setTheme, mounted } = useTheme();
  const { locale, setLocale, t } = useI18n();
  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const { hasFeature } = useFeatures();
  const [wsOpen, setWsOpen] = useState(false);
  const [workspaces, setWorkspaces] = useState<{ id: string; name: string; slug: string; plan: string; role: string; memberCount: number }[]>([]);
  const [activeWs, setActiveWs] = useState<string>("");
  const wsRef = useRef<HTMLDivElement>(null);

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

  // Close dropdown on outside click
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (wsRef.current && !wsRef.current.contains(e.target as Node)) setWsOpen(false);
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

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

  // Filter nav items by feature access
  const visibleNav = mainNav.filter((item) => {
    const basePath = item.href.split("?")[0];
    const featureId = SIDEBAR_FEATURE_MAP[basePath];
    if (!featureId) return true; // No gate = always show
    return hasFeature(featureId);
  });

  const NavItem = ({ item }: { item: { name: string; key: string; href: string; icon: React.ComponentType<{ className?: string }> } }) => {
    const basePath = item.href.split("?")[0];
    const isActive = pathname.startsWith(basePath);
    return (
      <Link
        key={item.name}
        href={item.href}
        onClick={onNavigate}
        className={cn(
          "group flex items-center gap-3 rounded-lg px-3 py-2 text-[13px] font-medium transition-all duration-150",
          isActive
            ? "bg-neutral-900 text-white dark:bg-white dark:text-neutral-900"
            : "text-neutral-600 hover:bg-neutral-100 hover:text-neutral-900 dark:text-neutral-400 dark:hover:bg-neutral-800 dark:hover:text-white"
        )}
      >
        <item.icon className={cn("h-4 w-4 shrink-0", isActive ? "text-white dark:text-neutral-900" : "text-neutral-400 group-hover:text-neutral-600 dark:group-hover:text-neutral-300")} />
        {item.key ? t(item.key as Parameters<typeof t>[0]) : item.name}
      </Link>
    );
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
            <Shield className="h-4 w-4 text-white dark:text-neutral-900" />
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
      <nav className="flex-1 overflow-y-auto px-3 pt-3 pb-3 space-y-5">
        {/* Main */}
        <div className="space-y-0.5">
          {visibleNav.map((item) => (
            <NavItem key={item.name} item={item} />
          ))}
        </div>

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
        {/* User */}
        {session?.user && (
          <div className="relative">
            <button
              onClick={() => setUserMenuOpen(!userMenuOpen)}
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
              <div className="absolute bottom-full left-0 right-0 mb-1 rounded-lg border border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-900 shadow-lg py-1 z-50">
                <div className="px-3 py-2 border-b border-neutral-100 dark:border-neutral-800">
                  <p className="text-[12px] font-medium text-neutral-700 dark:text-neutral-300 truncate">{session.user.email}</p>
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
                  <div className="flex items-center gap-1">
                    <Languages className="h-3.5 w-3.5 text-neutral-500" />
                    <select
                      value={locale}
                      onChange={(e) => setLocale(e.target.value as typeof locale)}
                      className="bg-transparent text-[11px] font-medium text-neutral-600 dark:text-neutral-400 border-none outline-none cursor-pointer"
                    >
                      {SUPPORTED_LOCALES.map((l) => (
                        <option key={l.code} value={l.code}>
                          {l.flag} {l.name}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                <button
                  onClick={() => signOut({ callbackUrl: "/auth/login" })}
                  className="flex w-full items-center gap-2.5 px-3 py-2 text-[13px] font-medium text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors"
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
