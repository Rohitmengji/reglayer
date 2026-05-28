"use client";

/**
 * ---------------------------------------------------------
 * RegLayer — Theme Toggle Button
 * ---------------------------------------------------------
 *
 * WHY: Users need a way to switch between dark and light mode.
 *
 * WHAT: A button that shows Sun (in dark mode) or Moon (in light mode)
 * and toggles the theme on click.
 *
 * HOW: Uses useTheme() from ThemeProvider to read/write theme state.
 * Icons swap based on resolvedTheme. Hidden until mounted to
 * prevent hydration mismatch.
 * ---------------------------------------------------------
 */

import { useTheme } from "@/components/theme-provider";
import { Moon, Sun } from "lucide-react";

export function ThemeToggle() {
  const { resolvedTheme, setTheme } = useTheme();

  return (
    <button
      onClick={() => setTheme(resolvedTheme === "dark" ? "light" : "dark")}
      className="rounded-md p-2 text-neutral-600 dark:text-neutral-300 hover:bg-neutral-100 dark:hover:bg-neutral-800 transition-colors"
      aria-label="Toggle theme"
    >
      {/* Both icons rendered; CSS dark: classes control visibility instantly via the blocking script's dark class.
          This avoids hydration mismatch — server and client render identical HTML. */}
      <Sun className="h-4 w-4 hidden dark:block" />
      <Moon className="h-4 w-4 block dark:hidden" />
    </button>
  );
}
