"use client";

/**
 * ---------------------------------------------------------
 * RegLayer — Root Providers
 * ---------------------------------------------------------
 *
 * WHY: React apps need context providers for shared state.
 * This file composes all providers in the correct order.
 *
 * WHAT:
 * Provider hierarchy (outer → inner):
 * 1. SessionProvider — NextAuth session (auth state)
 * 2. QueryClientProvider — React Query (server state caching)
 * 3. ThemeProvider — Dark/light mode
 * 4. I18nProvider — Translations
 *
 * HOW:
 * - "use client" because providers use React context (client-side)
 * - QueryClient created with useState to avoid re-creation on re-render
 * - staleTime: 60s means data stays fresh for 1 minute before refetching
 * - refetchOnWindowFocus: false prevents unwanted refetches
 * ---------------------------------------------------------
 */

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { SessionProvider } from "next-auth/react";
import { useState } from "react";
import { ThemeProvider } from "@/components/theme-provider";
import { I18nProvider } from "@/components/i18n-provider";

export function Providers({ children }: { children: React.ReactNode }) {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            staleTime: 60 * 1000,
            refetchOnWindowFocus: false,
          },
        },
      })
  );

  return (
    <SessionProvider>
      <QueryClientProvider client={queryClient}>
        <ThemeProvider>
          <I18nProvider>{children}</I18nProvider>
        </ThemeProvider>
      </QueryClientProvider>
    </SessionProvider>
  );
}
