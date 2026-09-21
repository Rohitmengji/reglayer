"use client";

/**
 * RegLayer — useFeatures hook
 *
 * Shares one workspace feature request across mounted consumers.
 * Single source of truth for feature access — no optimistic/pessimistic split.
 * Master admins see all features without network call.
 */

import { createContext, createElement, useContext, useEffect, useReducer, type ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import { useSession } from "next-auth/react";
import { FEATURE_CATALOG } from "@/lib/features/feature-catalog";

const ALL_FEATURE_IDS = FEATURE_CATALOG.map((f) => f.id);
const INVALIDATE_EVENT = "reglayer:features-invalidated";

interface FeatureAccess {
  features: string[];
  loading: boolean;
  hasFeature: (featureId: string) => boolean;
  canRunScans: boolean;
  accessLoading: boolean;
  accessError: boolean;
  retryAccess: () => void;
}

const FeaturesContext = createContext<FeatureAccess | null>(null);

export function FeaturesProvider({ children }: { children: ReactNode }) {
  const { data: session, status } = useSession();
  const [refetchKey, bump] = useReducer((x: number) => x + 1, 0);
  const identity = session?.user?.email ?? session?.user?.id ?? "";
  const isMasterAdmin = status === "authenticated" && Boolean(session?.user?.isMasterAdmin);
  const enabled = status === "authenticated" && Boolean(identity) && !isMasterAdmin;

  // Listen for invalidation events (triggered by workspace switch, plan upgrade, etc.)
  useEffect(() => {
    const handler = () => bump();
    window.addEventListener(INVALIDATE_EVENT, handler);
    return () => window.removeEventListener(INVALIDATE_EVENT, handler);
  }, []);

  const access = useQuery({
    queryKey: ["workspace-feature-access", status, identity, isMasterAdmin, refetchKey],
    enabled,
    queryFn: async () => {
      const response = await fetch("/api/workspace/features", { signal: AbortSignal.timeout(15_000), cache: "no-store" });
      if (!response.ok) throw new Error("Workspace capabilities unavailable");
      const data = await response.json();
      if (!Array.isArray(data.permissions) || !data.permissions.every((permission: unknown) => typeof permission === "string") ||
          !Array.isArray(data.features) || !data.features.every((feature: unknown) => typeof feature === "string")) {
        throw new Error("Workspace capabilities unavailable");
      }
      return data as { features: string[]; permissions: string[] };
    },
    retry: false,
    staleTime: 30_000,
    gcTime: 0,
    refetchInterval: 60_000,
    refetchOnWindowFocus: true,
  });
  const accessLoading = status === "loading" || (enabled && (access.isPending || access.isFetching));
  const accessError = enabled && access.isError;
  const current = enabled && !accessLoading && !accessError ? access.data : undefined;
  const features = isMasterAdmin ? ALL_FEATURE_IDS : (enabled ? access.data?.features : undefined) ?? (accessError ? ["dashboard", "scans", "settings"] : []);
  const value: FeatureAccess = {
    features,
    loading: status === "loading" || (enabled && access.isPending),
    hasFeature: featureId => features.includes(featureId),
    canRunScans: isMasterAdmin || Boolean(current?.permissions.includes("scans.run")),
    accessLoading,
    accessError,
    retryAccess: bump,
  };
  return createElement(FeaturesContext.Provider, { value }, children);
}

export function useFeatures(): FeatureAccess {
  const features = useContext(FeaturesContext);
  if (!features) throw new Error("useFeatures requires FeaturesProvider");
  return features;
}

/**
 * Force re-fetch on next render (call after plan upgrade or feature toggle).
 */
export function invalidateFeatureCache() {
  window.dispatchEvent(new CustomEvent(INVALIDATE_EVENT));
}
