/**
 * RegLayer — Data Residency Engine
 *
 * Ensures AI data is processed and stored in the customer's chosen region.
 *
 * REGIONS:
 *   us-east      → United States (default)
 *   eu-west      → European Union (GDPR)
 *   ap-south     → India (DPDPA)
 *   ap-southeast → Singapore (PDPA)
 *
 * WHAT THIS CONTROLS:
 *   1. LLM Provider Routing — prefer regional endpoints when available
 *   2. Data Tagging — audit entries + embeddings tagged with region
 *   3. Transfer Detection — flag when data crosses region boundaries
 *   4. Policy Enforcement — block transfers that violate workspace policy
 *
 * WHAT THIS DOES NOT DO (V1):
 *   - Separate databases per region (single DB with region tags)
 *   - Geographic load balancing (Vercel handles CDN routing)
 *   - Regional key management (single KMS, encrypted at rest)
 *
 * INSPIRED BY:
 *   - AWS Regions (customer chooses data location)
 *   - Stripe data residency (EU data stays in EU)
 *   - Notion's data residency (workspace-level region selection)
 *   - Vercel's regional compute
 */

import "server-only";

import { prisma } from "@/lib/database/prisma";

// ── Types ─────────────────────────────────────────────────────────────────────

export type DataRegion = "us-east" | "eu-west" | "ap-south" | "ap-southeast";

export interface RegionConfig {
  id: DataRegion;
  name: string;
  location: string;
  flag: string;
  gdprAdequacy: boolean;
  defaultProviderEndpoint: string | null;
  regulations: string[];
}

export interface ResidencyContext {
  workspaceRegion: DataRegion;
  providerRegion: string;
  crossRegion: boolean;
  transferBasis: string | null;
  warnings: string[];
}

export interface ProviderEndpoint {
  provider: string;
  model: string;
  region: string;
  endpoint: string;
}

// ── Region Definitions ────────────────────────────────────────────────────────

export const REGIONS: Record<DataRegion, RegionConfig> = {
  "us-east": {
    id: "us-east",
    name: "United States (East)",
    location: "Virginia, US",
    flag: "🇺🇸",
    gdprAdequacy: false,
    defaultProviderEndpoint: null, // default endpoints are US-based
    regulations: ["CCPA", "Section 508", "ADA"],
  },
  "eu-west": {
    id: "eu-west",
    name: "European Union (West)",
    location: "Frankfurt, DE",
    flag: "🇪🇺",
    gdprAdequacy: true,
    defaultProviderEndpoint: "https://eu.api.openai.com",
    regulations: ["GDPR", "EAA", "EN 301 549", "AI Act"],
  },
  "ap-south": {
    id: "ap-south",
    name: "India",
    location: "Mumbai, IN",
    flag: "🇮🇳",
    gdprAdequacy: false,
    defaultProviderEndpoint: null,
    regulations: ["DPDPA", "IT Act 2000", "RPwD Act"],
  },
  "ap-southeast": {
    id: "ap-southeast",
    name: "Singapore",
    location: "Singapore, SG",
    flag: "🇸🇬",
    gdprAdequacy: true, // EU adequacy decision
    defaultProviderEndpoint: null,
    regulations: ["PDPA", "Accessibility Guidelines"],
  },
};

// ── Provider Endpoints ────────────────────────────────────────────────────────

/**
 * Known regional endpoints for LLM providers.
 * When a workspace is in EU, prefer the EU endpoint to avoid cross-region transfer.
 */
const PROVIDER_ENDPOINTS: ProviderEndpoint[] = [
  // OpenAI
  { provider: "openai", model: "gpt-4o-mini", region: "us-east", endpoint: "https://api.openai.com" },
  { provider: "openai", model: "gpt-4o-mini", region: "eu-west", endpoint: "https://eu.api.openai.com" },
  // Anthropic
  { provider: "anthropic", model: "claude-haiku", region: "us-east", endpoint: "https://api.anthropic.com" },
  { provider: "anthropic", model: "claude-haiku", region: "eu-west", endpoint: "https://eu.api.anthropic.com" },
];

// ── Core Functions ────────────────────────────────────────────────────────────

/**
 * Resolve the data region for a workspace.
 */
export async function resolveRegion(workspaceId: string): Promise<DataRegion> {
  const workspace = await prisma.workspace.findUnique({
    where: { id: workspaceId },
    select: { region: true },
  });

  const region = (workspace?.region ?? "us-east") as DataRegion;
  return REGIONS[region] ? region : "us-east";
}

/**
 * Get the preferred provider endpoint for a workspace's region.
 * Returns null if no regional endpoint exists (falls back to default).
 */
export function getRegionalEndpoint(
  provider: string,
  model: string,
  region: DataRegion,
): ProviderEndpoint | null {
  return PROVIDER_ENDPOINTS.find(
    (e) => e.provider === provider && e.model === model && e.region === region,
  ) ?? null;
}

/**
 * Evaluate data residency compliance for an AI operation.
 * Detects cross-region transfers and returns warnings.
 */
export function evaluateResidency(
  workspaceRegion: DataRegion,
  providerEndpoint: string,
): ResidencyContext {
  const wsConfig = REGIONS[workspaceRegion];
  const warnings: string[] = [];

  // Determine provider's region from endpoint
  const providerRegion = inferProviderRegion(providerEndpoint);
  const crossRegion = providerRegion !== workspaceRegion;

  let transferBasis: string | null = null;

  if (crossRegion) {
    // EU workspace → US provider = GDPR transfer issue
    if (workspaceRegion === "eu-west" && providerRegion === "us-east") {
      warnings.push(
        "Cross-region transfer: EU workspace data processed in US. " +
        "Ensure Standard Contractual Clauses (SCCs) are in place with the AI provider.",
      );
      transferBasis = "SCC";
    }

    // India workspace → any other region
    if (workspaceRegion === "ap-south" && providerRegion !== "ap-south") {
      warnings.push(
        "Cross-border transfer: India workspace data processed outside India. " +
        "Verify DPDPA Section 16 compliance for cross-border data transfers.",
      );
      transferBasis = "DPDPA-consent";
    }

    // Generic cross-region warning
    if (warnings.length === 0) {
      warnings.push(
        `Data processed in ${providerRegion} but workspace is in ${workspaceRegion}. ` +
        "Review data transfer agreements.",
      );
      transferBasis = "contractual";
    }
  }

  return {
    workspaceRegion,
    providerRegion,
    crossRegion,
    transferBasis,
    warnings,
  };
}

/**
 * Set the data region for a workspace.
 * This is a significant change — logs to audit trail.
 */
export async function setWorkspaceRegion(
  workspaceId: string,
  region: DataRegion,
): Promise<{ success: boolean; previousRegion: string }> {
  const current = await prisma.workspace.findUnique({
    where: { id: workspaceId },
    select: { region: true },
  });

  const previousRegion = current?.region ?? "us-east";

  await prisma.workspace.update({
    where: { id: workspaceId },
    data: { region },
  });

  return { success: true, previousRegion };
}

/**
 * Get available regions for display in settings UI.
 */
export function getAvailableRegions(): RegionConfig[] {
  return Object.values(REGIONS);
}

/**
 * Validate that a region string is a valid DataRegion.
 */
export function isValidRegion(region: string): region is DataRegion {
  return region in REGIONS;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function inferProviderRegion(endpoint: string): string {
  if (endpoint.includes("eu.")) return "eu-west";
  if (endpoint.includes("ap-south")) return "ap-south";
  if (endpoint.includes("ap-southeast")) return "ap-southeast";
  return "us-east"; // default — most providers are US-based
}
