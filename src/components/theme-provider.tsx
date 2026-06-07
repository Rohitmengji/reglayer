"use client";

/**
 * ---------------------------------------------------------
 * RegLayer — Theme Provider
 * ---------------------------------------------------------
 *
 * WHY: Manages dark/light mode across the entire app.
 *
 * WHAT:
 * - React context providing: resolvedTheme, setTheme(), mounted
 * - Persists preference to localStorage (key: "reglayer-theme")
 * - Syncs HTML class (dark/light) for Tailwind dark: variant
 * - Supports "system" theme (follows OS preference)
 *
 * HOW:
 * - On mount, reads from localStorage or defaults to "system"
 * - Uses matchMedia("prefers-color-scheme: dark") for system detection
 * - Adds/removes .dark/.light class on <html> element
 * - Sets color-scheme CSS property for browser UI integration
 * - mounted flag prevents hydration mismatch (server doesn't know theme)
 * ---------------------------------------------------------
 */

import { createContext, useContext, useEffect, useRef, useState } from "react";

type Theme = "light" | "dark" | "system";

interface ThemeContextValue {
  theme: Theme;
  setTheme: (t: Theme) => void;
  resolvedTheme: "light" | "dark";
  mounted: boolean;
}

const ThemeContext = createContext<ThemeContextValue>({
  theme: "system",
  setTheme: () => {},
  resolvedTheme: "light",
  mounted: false,
});

export function useTheme() {
  return useContext(ThemeContext);
}

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [theme, setThemeState] = useState<Theme>("system");
  const [resolvedTheme, setResolvedTheme] = useState<"light" | "dark">("light");
  const [mounted, setMounted] = useState(false);
  const initialized = useRef(false);

  // Read from localStorage on mount and sync state
  useEffect(() => {
    const stored = localStorage.getItem("reglayer-theme") as Theme | null;
    const t = stored || "system";
    const effective =
      t === "system"
        ? window.matchMedia("(prefers-color-scheme: dark)").matches
          ? "dark"
          : "light"
        : t;
    document.documentElement.classList.toggle("dark", effective === "dark");
    document.documentElement.classList.toggle("light", effective === "light");
    initialized.current = true;
    // Batch state updates via queueMicrotask to avoid synchronous setState in effect
    queueMicrotask(() => {
      setThemeState(t);
      setResolvedTheme(effective);
      setMounted(true);
    });
  }, []);

  // Apply theme changes after initialization
  useEffect(() => {
    if (!initialized.current) return;
    const effective =
      theme === "system"
        ? window.matchMedia("(prefers-color-scheme: dark)").matches
          ? "dark"
          : "light"
        : theme;
    setResolvedTheme(effective);
    document.documentElement.classList.toggle("dark", effective === "dark");
    document.documentElement.classList.toggle("light", effective === "light");
  }, [theme]);

  // Listen for system preference changes
  useEffect(() => {
    if (theme !== "system") return;
    const mql = window.matchMedia("(prefers-color-scheme: dark)");
    const handler = (e: MediaQueryListEvent) => {
      setResolvedTheme(e.matches ? "dark" : "light");
      document.documentElement.classList.toggle("dark", e.matches);
      document.documentElement.classList.toggle("light", !e.matches);
    };
    mql.addEventListener("change", handler);
    return () => mql.removeEventListener("change", handler);
  }, [theme]);

  function setTheme(t: Theme) {
    setThemeState(t);
    localStorage.setItem("reglayer-theme", t);
  }

  return (
    <ThemeContext.Provider value={{ theme, setTheme, resolvedTheme, mounted }}>
      {children}
    </ThemeContext.Provider>
  );
}
