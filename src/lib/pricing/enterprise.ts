/**
 * RegLayer — Enterprise plan feature model (single source of truth)
 *
 * WHY: The pricing page and the expanded Enterprise section both need the same
 *      feature list. Defining it once — with honest availability status, a
 *      category, and a plain-English explanation — prevents the two surfaces
 *      from drifting and keeps every advertised capability backed by real code.
 * WHAT: Typed metadata for each Enterprise feature. `status` is the ONLY source
 *       of "coming soon" (no more suffixing it into the label string), so the
 *       badge, the screen-reader announcement, and the styling stay in sync.
 * HOW: Labels reuse the existing translated `pricing.enterpriseFeatureN` keys.
 *      `evidence` documents the production code that backs each "available"
 *      claim — a checklist for the "no hollow feature labels" rule, not shown
 *      to users. Icons are restricted to the set already imported elsewhere so
 *      we never trip the pinned lucide-react build.
 */

import type { ComponentType } from "react";
import {
  Check,
  Globe,
  Users,
  FileText,
  FileCheck,
  Lock,
  Webhook,
  Zap,
  BarChart3,
  Shield,
  ShieldCheck,
  Headset,
  Building2,
  SlidersHorizontal,
} from "lucide-react";
import type { TranslationKey } from "@/lib/i18n/translations";

/** A lucide icon accepts at least a className; typed structurally to avoid coupling to lucide's type exports. */
export type FeatureIcon = ComponentType<{ className?: string }>;

export type FeatureStatus = "available" | "coming-soon";

export type FeatureCategoryId =
  | "scale"
  | "compliance"
  | "integration"
  | "governance"
  | "support";

export interface EnterpriseFeature {
  id: string;
  /** Reuses the already-translated label keys so we don't fork copy. */
  labelKey: TranslationKey;
  /** Plain-English explanation (tooltip + section). Omit for self-explanatory items. */
  descKey?: TranslationKey;
  status: FeatureStatus;
  category: FeatureCategoryId;
  icon: FeatureIcon;
  /**
   * Internal-only: the production code that backs an "available" claim, or the
   * reason a feature is "coming-soon". Verified during the pricing audit; never
   * rendered. Keeps the "no hollow labels" guarantee auditable in one place.
   */
  evidence: string;
}

export interface FeatureCategory {
  id: FeatureCategoryId;
  titleKey: TranslationKey;
  icon: FeatureIcon;
}

export const ENTERPRISE_CATEGORIES: FeatureCategory[] = [
  { id: "scale", titleKey: "pricing.ent.catScale", icon: Globe },
  { id: "compliance", titleKey: "pricing.ent.catCompliance", icon: FileText },
  { id: "integration", titleKey: "pricing.ent.catIntegration", icon: Webhook },
  { id: "governance", titleKey: "pricing.ent.catGovernance", icon: Shield },
  { id: "support", titleKey: "pricing.ent.catSupport", icon: Building2 },
];

export const ENTERPRISE_FEATURES: EnterpriseFeature[] = [
  {
    id: "everything-pro",
    labelKey: "pricing.enterpriseFeature1",
    status: "available",
    category: "scale",
    icon: Check,
    evidence: "Inherits the full Pro feature set via feature-catalog.ts / feature-access.ts.",
  },
  {
    id: "unlimited-sites",
    labelKey: "pricing.enterpriseFeature2",
    descKey: "pricing.ent.descUnlimitedSites",
    status: "available",
    category: "scale",
    icon: Globe,
    evidence: "PLAN_LIMITS.ENTERPRISE scansPerMonth/pagesPerScan = -1; enforced in api/crawl & api/scan.",
  },
  {
    id: "unlimited-team",
    labelKey: "pricing.enterpriseFeature3",
    descKey: "pricing.ent.descUnlimitedTeam",
    status: "available",
    category: "scale",
    icon: Users,
    evidence: "PLAN_LIMITS.ENTERPRISE.teamMembers = -1; enforced in api/team invite path.",
  },
  {
    id: "vpat-acr",
    labelKey: "pricing.enterpriseFeature4",
    descKey: "pricing.ent.descVpat",
    status: "available",
    category: "compliance",
    icon: FileCheck,
    evidence: "api/compliance/vpat + lib/compliance/vpat-generator (VPAT 2.4 / ACR, HTML+MD).",
  },
  {
    id: "custom-rules",
    labelKey: "pricing.enterpriseFeature5",
    descKey: "pricing.ent.descCustomRules",
    status: "available",
    category: "compliance",
    icon: SlidersHorizontal,
    evidence: "ComplianceRule model + /api/rules CRUD + lib/compliance/customRules.ts, evaluated via /api/scans/[id]/custom-rules; managed at /compliance/rules.",
  },
  {
    id: "jira-slack",
    labelKey: "pricing.enterpriseFeature6",
    descKey: "pricing.ent.descIntegrations",
    status: "available",
    category: "integration",
    icon: Webhook,
    evidence: "api/integrations + lib/integrations/dispatcher (real Jira REST + Slack webhooks).",
  },
  {
    id: "api-cicd",
    labelKey: "pricing.enterpriseFeature7",
    descKey: "pricing.ent.descApi",
    status: "available",
    category: "integration",
    icon: Zap,
    evidence: "api/keys (scoped keys) + api/gate (CI/CD quality gate, pass/fail by threshold).",
  },
  {
    id: "audit-trail",
    labelKey: "pricing.enterpriseFeature8",
    descKey: "pricing.ent.descAudit",
    status: "available",
    category: "governance",
    icon: BarChart3,
    evidence: "api/audit-log (365d retention) + api/account/export (evidence export).",
  },
  {
    id: "white-label",
    labelKey: "pricing.enterpriseFeature9",
    descKey: "pricing.ent.descWhiteLabel",
    status: "available",
    category: "governance",
    icon: FileText,
    evidence: "Agency branding (logo/colors/brandName) injected into VPAT/ACR exports via vpat-generator branding.",
  },
  {
    id: "sso",
    labelKey: "pricing.enterpriseFeature10",
    descKey: "pricing.ent.descSso",
    status: "coming-soon",
    category: "governance",
    icon: Lock,
    evidence: "Only Credentials + Google OAuth today; SAML/OIDC not implemented — coming soon.",
  },
  {
    id: "account-manager",
    labelKey: "pricing.enterpriseFeature11",
    descKey: "pricing.ent.descAccountManager",
    status: "available",
    category: "support",
    icon: Headset,
    evidence: "Human service commitment fulfilled by the sales/CS team (not code-gated).",
  },
  {
    id: "sla",
    labelKey: "pricing.enterpriseFeature12",
    descKey: "pricing.ent.descSla",
    status: "available",
    category: "support",
    icon: ShieldCheck,
    evidence: "Contractual uptime commitment (operational/legal, not code-gated).",
  },
];

/** Group features by category, preserving the canonical category order. */
export function enterpriseFeaturesByCategory(): Array<{
  category: FeatureCategory;
  features: EnterpriseFeature[];
}> {
  return ENTERPRISE_CATEGORIES.map((category) => ({
    category,
    features: ENTERPRISE_FEATURES.filter((f) => f.category === category.id),
  })).filter((group) => group.features.length > 0);
}

/** Enterprise pricing. Monthly is the list rate; annual is the effective per-month rate when billed yearly. */
export const ENTERPRISE_PRICE = { monthly: 199, annual: 159 } as const;
