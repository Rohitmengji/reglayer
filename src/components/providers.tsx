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
import { BrandProvider, type BrandContextType } from "@/components/layout/BrandProvider";
import { CommandPalette } from "@/components/command-palette";
import { ShortcutsModal } from "@/components/shortcuts/shortcuts-modal";
import { GlobalShortcuts } from "@/components/shortcuts/global-shortcuts";
import { ViewingPreferences } from "@/components/a11y/viewing-preferences";
import { RecentTracker } from "@/components/recent/recent-tracker";
import { ConfettiCanvas } from "@/components/confetti";

const DEFAULT_BRAND: BrandContextType = {
  brandName: "RegLayer",
  primaryColor: "#6366f1",
  accentColor: "#4f46e5",
  logoUrl: null,
  faviconUrl: null,
  supportEmail: null,
  isAgency: false,
  agencySlug: null,
  showPoweredBy: false,
};

export function Providers({ children, brand }: { children: React.ReactNode; brand?: BrandContextType }) {
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
          <I18nProvider>
            <BrandProvider brand={brand ?? DEFAULT_BRAND}>
              <CommandPalette />
              <ShortcutsModal />
              <GlobalShortcuts />
              <ViewingPreferences />
              <RecentTracker />
              <ConfettiCanvas />
              {children}
            </BrandProvider>
          </I18nProvider>
        </ThemeProvider>
      </QueryClientProvider>
    </SessionProvider>
  );
}
