"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils/cn";
import { Shield, LayoutDashboard, Scan, Settings } from "lucide-react";

const navigation = [
  { name: "Dashboard", href: "/dashboard", icon: LayoutDashboard },
  { name: "Scans", href: "/scans", icon: Scan },
  { name: "Settings", href: "/settings", icon: Settings },
];

export function Sidebar() {
  const pathname = usePathname();

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

      {/* Footer */}
      <div className="border-t border-neutral-200 px-6 py-4">
        <p className="text-xs text-neutral-500">
          RegLayer v0.1.0
        </p>
        <p className="text-xs text-neutral-400">
          Accessibility Scanner
        </p>
      </div>
    </aside>
  );
}
