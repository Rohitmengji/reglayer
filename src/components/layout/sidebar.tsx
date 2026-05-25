"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useSession, signOut } from "next-auth/react";
import { cn } from "@/lib/utils/cn";
import { Shield, LayoutDashboard, Scan, GitCompare, BarChart3, Zap, Settings, LogOut } from "lucide-react";

const navigation = [
  { name: "Dashboard", href: "/dashboard", icon: LayoutDashboard },
  { name: "Scans", href: "/scans", icon: Scan },
  { name: "Priorities", href: "/priorities", icon: Zap },
  { name: "Analytics", href: "/analytics", icon: BarChart3 },
  { name: "Compare", href: "/scans/compare", icon: GitCompare },
  { name: "Settings", href: "/settings", icon: Settings },
];

export function Sidebar() {
  const pathname = usePathname();
  const { data: session } = useSession();

  return (
    <aside className="flex h-full w-64 flex-col border-r border-neutral-200 bg-white">
      {/* Brand */}
      <div className="flex h-16 items-center gap-2 border-b border-neutral-200 px-6">
        <Shield className="h-6 w-6 text-neutral-900" />
        <span className="text-lg font-bold tracking-tight text-neutral-900">
          RegLayer
        </span>
      </div>

      {/* Navigation */}
      <nav className="flex-1 space-y-1 px-3 py-4">
        {navigation.map((item) => {
          const isActive = pathname.startsWith(item.href);
          return (
            <Link
              key={item.name}
              href={item.href}
              className={cn(
                "flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors",
                isActive
                  ? "bg-neutral-100 text-neutral-900"
                  : "text-neutral-600 hover:bg-neutral-50 hover:text-neutral-900"
              )}
            >
              <item.icon className="h-4 w-4" />
              {item.name}
            </Link>
          );
        })}
      </nav>

      {/* User & Footer */}
      <div className="border-t border-neutral-200 px-4 py-4 space-y-3">
        {session?.user && (
          <div className="flex items-center justify-between">
            <div className="min-w-0">
              <p className="truncate text-xs font-medium text-neutral-700">
                {session.user.name || session.user.email}
              </p>
              <p className="truncate text-xs text-neutral-400">
                {session.user.email}
              </p>
            </div>
            <button
              onClick={() => signOut({ callbackUrl: "/auth/login" })}
              className="rounded-md p-1.5 text-neutral-400 hover:bg-neutral-100 hover:text-neutral-600 transition-colors"
              title="Sign out"
            >
              <LogOut className="h-3.5 w-3.5" />
            </button>
          </div>
        )}
        <p className="text-xs text-neutral-400">
          RegLayer v0.1.0
        </p>
      </div>
    </aside>
  );
}
