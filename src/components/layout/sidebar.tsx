"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useSession, signOut } from "next-auth/react";
import { cn } from "@/lib/utils/cn";
import { useTheme } from "@/components/theme-provider";
import { Shield, LayoutDashboard, Scan, Globe, Zap, Sparkles, BarChart3, GitCompare, Webhook, Settings, LogOut, Grid3X3, Moon, Sun, FileText, Languages, Users, ClipboardList, Bell, Plug, Crown } from "lucide-react";
import { useI18n } from "@/components/i18n-provider";
import { SUPPORTED_LOCALES } from "@/lib/i18n/translations";

const navigation = [
  { name: "Dashboard", key: "nav.dashboard", href: "/dashboard", icon: LayoutDashboard },
  { name: "Scans", key: "nav.scans", href: "/scans", icon: Scan },
  { name: "Compliance", key: "nav.compliance", href: "/compliance", icon: Grid3X3 },
  { name: "Statement", key: "nav.statement", href: "/statement", icon: FileText },
  { name: "Crawl Site", key: "nav.crawl", href: "/crawl", icon: Globe },
  { name: "Priorities", key: "nav.priorities", href: "/priorities", icon: Zap },
  { name: "AI Insights", key: "nav.insights", href: "/insights", icon: Sparkles },
  { name: "Analytics", key: "nav.analytics", href: "/analytics", icon: BarChart3 },
  { name: "Compare", key: "nav.compare", href: "/scans/compare", icon: GitCompare },
  { name: "Team", key: "nav.team", href: "/team", icon: Users },
  { name: "Audit Log", key: "nav.auditLog", href: "/audit-log", icon: ClipboardList },
  { name: "Notifications", key: "nav.notifications", href: "/notifications", icon: Bell },
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

  return (
    <aside className="flex h-full w-64 flex-col border-r border-neutral-200 bg-white dark:border-neutral-700 dark:bg-neutral-900">
      {/* Brand */}
      <div className="flex h-16 items-center gap-2 border-b border-neutral-200 dark:border-neutral-700 px-6">
        <Shield className="h-6 w-6 text-neutral-900 dark:text-white" />
        <span className="text-lg font-bold tracking-tight text-neutral-900 dark:text-white">
          RegLayer
        </span>
      </div>

      {/* Navigation */}
      <nav className="flex-1 space-y-1 px-3 py-4 overflow-y-auto">
        {navigation.map((item) => {
          const isActive = pathname.startsWith(item.href);
          return (
            <Link
              key={item.name}
              href={item.href}
              onClick={onNavigate}
              className={cn(
                "flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors",
                isActive
                  ? "bg-neutral-100 text-neutral-900 dark:bg-neutral-800 dark:text-white"
                  : "text-neutral-600 hover:bg-neutral-50 hover:text-neutral-900 dark:text-neutral-400 dark:hover:bg-neutral-800 dark:hover:text-white"
              )}
            >
              <item.icon className="h-4 w-4" />
              {item.key ? t(item.key as Parameters<typeof t>[0]) : item.name}
            </Link>
          );
        })}

        {/* Master Admin Panel — only visible to master admins */}
        {(session?.user as unknown as { isMasterAdmin?: boolean })?.isMasterAdmin && (
          <Link
            href="/admin"
            onClick={onNavigate}
            className={cn(
              "flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors mt-2 border-t border-neutral-200 dark:border-neutral-700 pt-3",
              pathname === "/admin"
                ? "bg-red-50 text-red-800 dark:bg-red-900/30 dark:text-red-200"
                : "text-red-600 hover:bg-red-50 hover:text-red-800 dark:text-red-400 dark:hover:bg-red-900/20 dark:hover:text-red-200"
            )}
          >
            <Crown className="h-4 w-4" />
            Admin Panel
          </Link>
        )}
      </nav>

      {/* User & Footer */}
      <div className="border-t border-neutral-200 dark:border-neutral-700 px-4 py-4 space-y-3">
        {/* Language Selector */}
        <div className="flex items-center gap-2 rounded-md px-3 py-1.5">
          <Languages className="h-4 w-4 text-neutral-500 dark:text-neutral-400" />
          <select
            value={locale}
            onChange={(e) => setLocale(e.target.value as typeof locale)}
            className="flex-1 bg-transparent text-xs font-medium text-neutral-600 dark:text-neutral-300 border-none outline-none cursor-pointer"
          >
            {SUPPORTED_LOCALES.map((l) => (
              <option key={l.code} value={l.code}>
                {l.flag} {l.name}
              </option>
            ))}
          </select>
        </div>

        {/* Theme Toggle */}
        {mounted && (
          <button
            onClick={() => setTheme(resolvedTheme === "dark" ? "light" : "dark")}
            className="flex w-full items-center gap-3 rounded-md px-3 py-2 text-sm font-medium text-neutral-600 dark:text-neutral-300 hover:bg-neutral-50 dark:hover:bg-neutral-800 transition-colors"
          >
            {resolvedTheme === "dark" ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
            {resolvedTheme === "dark" ? "Light Mode" : "Dark Mode"}
          </button>
        )}

        {session?.user && (
          <div className="flex items-center justify-between">
            <div className="min-w-0">
              <p className="truncate text-xs font-medium text-neutral-700">
                {session.user.name || session.user.email}
              </p>
              <p className="truncate mb-1 text-xs text-neutral-500 dark:text-neutral-400">
                {session.user.email}
              </p>
            </div>
            <button
              onClick={() => signOut({ callbackUrl: "/auth/login" })}
              className="rounded-md p-0.8 text-neutral-500 hover:bg-neutral-100 hover:text-neutral-600 dark:text-neutral-400 dark:hover:bg-neutral-800 transition-colors"
              title="Sign out"
            >
              <LogOut className="h-3.5 w-3.5" />
            </button>
          </div>
        )}
      </div>
    </aside>
  );
}
