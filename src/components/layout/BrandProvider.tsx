"use client";

/**
 * RegLayer — Brand Provider for White-Label Agencies
 *
 * WHY: Agency clients see the agency's branding, not RegLayer's.
 * WHAT: React context providing agency branding to all client components.
 * HOW: Reads initial brand context from a serialized prop, provides via hook.
 */

import { createContext, useContext, type ReactNode } from "react";

export type BrandContextType = {
  brandName: string;
  primaryColor: string;
  accentColor: string;
  logoUrl: string | null;
  faviconUrl: string | null;
  supportEmail: string | null;
  isAgency: boolean;
  agencySlug: string | null;
  showPoweredBy: boolean;
};

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

const BrandContext = createContext<BrandContextType>(DEFAULT_BRAND);

/**
 * Hook to access current brand context.
 * @returns Brand context (agency or default RegLayer)
 */
export function useBrand(): BrandContextType {
  return useContext(BrandContext);
}

/**
 * Provider component that wraps the app with brand context.
 * @param brand - The resolved brand context (from server component)
 * @param children - React children
 */
export function BrandProvider({
  brand,
  children,
}: {
  brand: BrandContextType;
  children: ReactNode;
}) {
  return (
    <BrandContext.Provider value={brand}>
      {children}
    </BrandContext.Provider>
  );
}
