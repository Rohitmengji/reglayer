"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useSession, signOut } from "next-auth/react";
import { cn } from "@/lib/utils/cn";
import { useTheme } from "@/components/theme-provider";
import { Shield, LayoutDashboard, Scan, Globe, Zap, Sparkles, BarChart3, GitCompare, Webhook, Settings, LogOut, Grid3X3, Moon, Sun, FileText, Languages, Users, ClipboardList, Plug, Crown, ChevronDown, Eye, Wand2, DollarSign, Route } from "lucide-react";
import { useI18n } from "@/components/i18n-provider";
import { SUPPORTED_LOCALES } from "@/lib/i18n/translations";
import { useState } from "react";

const mainNav = [
  { name: "Dashboard", key: "nav.dashboard", href: "/dashboard", icon: LayoutDashboard },
  { name: "Scans", key: "nav.scans", href: "/scans", icon: Scan },
  { name: "Compliance", key: "nav.compliance", href: "/compliance", icon: Grid3X3 },
  { name: "Statement", key: "nav.statement", href: "/statement", icon: FileText },
  { name: "Crawl Site", key: "nav.crawl", href: "/crawl", icon: Globe },
];

const analysisNav = [
  { name: "Screen Reader", key: "nav.screenReader", href: "/screen-reader", icon: Eye },
  { name: "Priorities", key: "nav.priorities", href: "/priorities", icon: Zap },
  { name: "AI Insights", key: "nav.insights", href: "/insights", icon: Sparkles },
  { name: "Analytics", key: "nav.analytics", href: "/analytics", icon: BarChart3 },
  { name: "Compare", key: "nav.compare", href: "/scans/compare", icon: GitCompare },
];

const automationNav = [
  { name: "Remediation", key: "", href: "/dashboard/remediation", icon: Wand2 },
  { name: "Revenue Impact", key: "", href: "/dashboard/revenue", icon: DollarSign },
  { name: "VPAT/ACR", key: "", href: "/compliance/vpat", icon: FileText },
  { name: "Journey Scan", key: "", href: "/dashboard/journey", icon: Route },
];

const manageNav = [
  { name: "Team", key: "nav.team", href: "/team", icon: Users },
  { name: "Audit Log", key: "nav.auditLog", href: "/audit-log", icon: ClipboardList },
  { name: "Integrations", key: "nav.integrations", href: "/integrations", icon: Plug },
  { name: "Webhooks", key: "nav.webhooks", href: "/webhooks", icon: Webhook },
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

  const NavItem = ({ item }: { item: { name: string; key: string; href: string; icon: React.ComponentType<{ className?: string }> } }) => {
    const isActive = pathname.startsWith(item.href);
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
      {/* Brand */}
      <div className="flex h-14 items-center gap-2.5 px-5">
        <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-neutral-900 dark:bg-white">
          <Shield className="h-4 w-4 text-white dark:text-neutral-900" />
        </div>
        <span className="text-[15px] font-semibold tracking-tight text-neutral-900 dark:text-white">
          RegLayer
        </span>
      </div>

      {/* Navigation */}
      <nav className="flex-1 overflow-y-auto px-3 pb-3 space-y-5">
        {/* Main */}
        <div className="space-y-0.5">
          {mainNav.map((item) => (
            <NavItem key={item.name} item={item} />
          ))}
        </div>

        {/* Analysis */}
        <div className="space-y-0.5">
          <p className="px-3 pb-1 text-[11px] font-semibold uppercase tracking-wider text-neutral-400 dark:text-neutral-500">Analysis</p>
          {analysisNav.map((item) => (
            <NavItem key={item.name} item={item} />
          ))}
        </div>

        {/* Automation */}
        <div className="space-y-0.5">
          <p className="px-3 pb-1 text-[11px] font-semibold uppercase tracking-wider text-neutral-400 dark:text-neutral-500">Automation</p>
          {automationNav.map((item) => (
            <NavItem key={item.name} item={item} />
          ))}
        </div>

        {/* Manage */}
        <div className="space-y-0.5">
          <p className="px-3 pb-1 text-[11px] font-semibold uppercase tracking-wider text-neutral-400 dark:text-neutral-500">Manage</p>
          {manageNav.map((item) => (
            <NavItem key={item.name} item={item} />
          ))}
        </div>

        {/* Master Admin */}
        {(session?.user as unknown as { isMasterAdmin?: boolean })?.isMasterAdmin && (
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
              <ChevronDown className={cn("h-3.5 w-3.5 text-neutral-400 transition-transform", userMenuOpen && "rotate-180")} />
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
