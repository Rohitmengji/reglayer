/**
 * RegLayer — Agency Tenant Resolver
 *
 * WHY: White-label agencies access RegLayer via subdomains or custom domains.
 * WHAT: Resolves agency context from hostname for multi-tenant branding.
 * HOW: Queries DB by slug (subdomain) or customDomain, caches result.
 */

import "server-only";

import { prisma } from "@/lib/database/prisma";
import { unstable_cache } from "next/cache";
import type { AgencyPlan } from "@/generated/prisma/client";

export type AgencyContext = {
  id: string;
  slug: string;
  brandName: string;
  primaryColor: string;
  accentColor: string;
  logoUrl: string | null;
  faviconUrl: string | null;
  supportEmail: string | null;
  plan: AgencyPlan;
  maxClients: number;
};

/**
 * Resolves agency context from hostname.
 * Cached with Next.js unstable_cache — invalidate on agency update.
 * @param hostname - The request hostname (e.g. "myagency.reglayer.app")
 * @returns AgencyContext if found and active, null otherwise
 */
export async function resolveAgency(
  hostname: string
): Promise<AgencyContext | null> {
  const slug = extractSlug(hostname);

  if (!slug) {
    // Check custom domain
    return getCachedAgencyByDomain(hostname);
  }

  return getCachedAgencyBySlug(slug);
}

/**
 * Extracts agency slug from subdomain.
 * Returns null if hostname is the main RegLayer domain or localhost.
 */
function extractSlug(hostname: string): string | null {
  // Remove port if present
  const host = hostname.split(":")[0];

  // Main domains — no agency
  if (
    host === "reglayer.app" ||
    host === "www.reglayer.app" ||
    host === "reglayer.vercel.app" ||
    host === "localhost" ||
    host === "127.0.0.1"
  ) {
    return null;
  }

  // Check if it's a subdomain of reglayer.app
  const reglayerSuffix = ".reglayer.app";
  if (host.endsWith(reglayerSuffix)) {
    const slug = host.slice(0, -reglayerSuffix.length);
    // Only single-level subdomains
    if (slug && !slug.includes(".")) {
      return slug;
    }
  }

  // Not a subdomain — might be a custom domain (handled separately)
  return null;
}

const getCachedAgencyBySlug = unstable_cache(
  async (slug: string): Promise<AgencyContext | null> => {
    const agency = await prisma.agency.findUnique({
      where: { slug, isActive: true },
      select: {
        id: true,
        slug: true,
        brandName: true,
        primaryColor: true,
        accentColor: true,
        logoUrl: true,
        faviconUrl: true,
        supportEmail: true,
        plan: true,
        maxClients: true,
        isActive: true,
      },
    });

    if (!agency || !agency.isActive) return null;

    return {
      id: agency.id,
      slug: agency.slug,
      brandName: agency.brandName,
      primaryColor: agency.primaryColor,
      accentColor: agency.accentColor,
      logoUrl: agency.logoUrl,
      faviconUrl: agency.faviconUrl,
      supportEmail: agency.supportEmail,
      plan: agency.plan,
      maxClients: agency.maxClients,
    };
  },
  ["agency-by-slug"],
  { revalidate: 300, tags: ["agency"] }
);

const getCachedAgencyByDomain = unstable_cache(
  async (domain: string): Promise<AgencyContext | null> => {
    const agency = await prisma.agency.findUnique({
      where: { customDomain: domain, isActive: true },
      select: {
        id: true,
        slug: true,
        brandName: true,
        primaryColor: true,
        accentColor: true,
        logoUrl: true,
        faviconUrl: true,
        supportEmail: true,
        plan: true,
        maxClients: true,
        isActive: true,
      },
    });

    if (!agency || !agency.isActive) return null;

    return {
      id: agency.id,
      slug: agency.slug,
      brandName: agency.brandName,
      primaryColor: agency.primaryColor,
      accentColor: agency.accentColor,
      logoUrl: agency.logoUrl,
      faviconUrl: agency.faviconUrl,
      supportEmail: agency.supportEmail,
      plan: agency.plan,
      maxClients: agency.maxClients,
    };
  },
  ["agency-by-domain"],
  { revalidate: 300, tags: ["agency"] }
);
