/**
 * RegLayer — Third-Party Vendor Risk Scanner
 *
 * INDUSTRY PROBLEM: 60%+ of accessibility violations on enterprise sites come from
 * third-party code: chat widgets, analytics scripts, consent banners, social embeds,
 * payment forms, ad networks. When organizations get sued, the violation is on THEIR
 * site — the vendor doesn't get named. Teams can't even identify which vendor caused
 * which violations because everything's mixed together in scan results.
 *
 * SOLUTION: Isolate third-party scripts, attribute violations to specific vendors,
 * generate a vendor risk scorecard, and provide contract leverage data
 * ("Your widget causes 12 violations that put us at legal risk").
 *
 * HOW:
 * 1. Parse DOM for known third-party patterns (iframes, script sources, shadow DOMs)
 * 2. Match element selectors in violations to vendor ownership
 * 3. Calculate per-vendor risk contribution
 * 4. Generate vendor report cards with remediation responsibility assignment
 */

import "server-only";

import { prisma } from "@/lib/database/prisma";

export interface VendorProfile {
  id: string;
  name: string;
  category: VendorCategory;
  domainPatterns: string[];  // Regex patterns to identify vendor elements
  selectorPatterns: string[]; // CSS selector patterns for vendor-injected DOM
}

export type VendorCategory =
  | "chat-widget"
  | "analytics"
  | "consent-banner"
  | "social-embed"
  | "payment"
  | "advertising"
  | "video-player"
  | "form-builder"
  | "customer-support"
  | "personalization"
  | "unknown";

export interface VendorRiskReport {
  scanId: string;
  siteUrl: string;
  totalViolations: number;
  vendorViolations: number;
  firstPartyViolations: number;
  vendorContributionPercent: number;
  vendors: VendorRiskCard[];
  unattributed: number;
  recommendation: string;
}

export interface VendorRiskCard {
  vendor: string;
  category: VendorCategory;
  violationCount: number;
  riskContribution: number; // percentage of total vendor violations
  violations: Array<{
    ruleId: string;
    impact: string;
    count: number;
  }>;
  riskScore: number; // 0-100
  legalExposure: string;
  contractRecommendation: string;
}

/**
 * Known third-party vendor detection patterns.
 * Maps vendor name → identifiers in DOM/URLs.
 */
const KNOWN_VENDORS: VendorProfile[] = [
  {
    id: "intercom",
    name: "Intercom",
    category: "chat-widget",
    domainPatterns: ["intercom", "intercomcdn"],
    selectorPatterns: ["#intercom-container", ".intercom-", "[data-intercom]"],
  },
  {
    id: "drift",
    name: "Drift",
    category: "chat-widget",
    domainPatterns: ["drift.com", "driftt.com"],
    selectorPatterns: ["#drift-widget", ".drift-"],
  },
  {
    id: "zendesk",
    name: "Zendesk",
    category: "customer-support",
    domainPatterns: ["zendesk", "zdassets"],
    selectorPatterns: ["#launcher", "[data-garden-id]", ".zEWidget-"],
  },
  {
    id: "hubspot",
    name: "HubSpot",
    category: "chat-widget",
    domainPatterns: ["hubspot", "hs-scripts", "hsforms"],
    selectorPatterns: ["#hubspot-messages", ".hs-", "#hs-web-interactives"],
  },
  {
    id: "google-analytics",
    name: "Google Analytics",
    category: "analytics",
    domainPatterns: ["google-analytics", "googletagmanager", "gtag"],
    selectorPatterns: [],
  },
  {
    id: "hotjar",
    name: "Hotjar",
    category: "analytics",
    domainPatterns: ["hotjar.com", "static.hotjar"],
    selectorPatterns: ["#_hj", "._hj"],
  },
  {
    id: "cookiebot",
    name: "Cookiebot",
    category: "consent-banner",
    domainPatterns: ["cookiebot.com", "consentcdn"],
    selectorPatterns: ["#CybotCookiebotDialog", ".CybotCookiebot"],
  },
  {
    id: "onetrust",
    name: "OneTrust",
    category: "consent-banner",
    domainPatterns: ["onetrust.com", "cookielaw"],
    selectorPatterns: ["#onetrust-", ".onetrust-", "#ot-sdk-"],
  },
  {
    id: "osano",
    name: "Osano",
    category: "consent-banner",
    domainPatterns: ["osano.com"],
    selectorPatterns: [".osano-cm-"],
  },
  {
    id: "stripe",
    name: "Stripe",
    category: "payment",
    domainPatterns: ["stripe.com", "js.stripe"],
    selectorPatterns: [".__PrivateStripeElement", ".StripeElement", "iframe[name*='stripe']"],
  },
  {
    id: "youtube",
    name: "YouTube",
    category: "video-player",
    domainPatterns: ["youtube.com", "youtube-nocookie"],
    selectorPatterns: ["iframe[src*='youtube']", ".ytp-"],
  },
  {
    id: "vimeo",
    name: "Vimeo",
    category: "video-player",
    domainPatterns: ["vimeo.com", "player.vimeo"],
    selectorPatterns: ["iframe[src*='vimeo']"],
  },
  {
    id: "twitter",
    name: "X (Twitter)",
    category: "social-embed",
    domainPatterns: ["twitter.com", "platform.twitter", "x.com"],
    selectorPatterns: [".twitter-tweet", "twitterwidget", "[data-tweet-id]"],
  },
  {
    id: "facebook",
    name: "Facebook/Meta",
    category: "social-embed",
    domainPatterns: ["facebook.com", "fbcdn", "connect.facebook"],
    selectorPatterns: [".fb-", "iframe[src*='facebook']", "[data-href*='facebook']"],
  },
  {
    id: "typeform",
    name: "Typeform",
    category: "form-builder",
    domainPatterns: ["typeform.com"],
    selectorPatterns: ["[data-tf-widget]", ".typeform-"],
  },
  {
    id: "recaptcha",
    name: "Google reCAPTCHA",
    category: "form-builder",
    domainPatterns: ["recaptcha", "gstatic.com/recaptcha"],
    selectorPatterns: [".g-recaptcha", ".grecaptcha-badge", "iframe[src*='recaptcha']"],
  },
  {
    id: "optimizely",
    name: "Optimizely",
    category: "personalization",
    domainPatterns: ["optimizely.com", "cdn.optimizely"],
    selectorPatterns: [],
  },
  {
    id: "segment",
    name: "Segment",
    category: "analytics",
    domainPatterns: ["segment.com", "cdn.segment"],
    selectorPatterns: [],
  },
];

/**
 * Analyze a scan's violations and attribute them to third-party vendors.
 */
export async function analyzeVendorRisk(scanId: string): Promise<VendorRiskReport | null> {
  const scan = await prisma.scan.findUnique({
    where: { id: scanId },
    include: {
      violations: {
        select: {
          id: true,
          ruleId: true,
          impact: true,
          description: true,
          affectedElements: true,
        },
      },
    },
  });

  if (!scan) return null;

  const vendorMap = new Map<string, { vendor: VendorProfile; violations: typeof scan.violations }>();
  const firstPartyViolations: typeof scan.violations = [];
  let unattributed = 0;

  for (const violation of scan.violations) {
    const elements = violation.affectedElements as Array<{ target?: string[]; html?: string }> | null;
    let attributed = false;

    if (Array.isArray(elements)) {
      for (const element of elements) {
        const selector = element.target?.[0] ?? "";
        const html = element.html ?? "";
        const combined = `${selector} ${html}`.toLowerCase();

        for (const vendor of KNOWN_VENDORS) {
          const matchesSelector = vendor.selectorPatterns.some((p) =>
            combined.includes(p.toLowerCase().replace(/[[\]]/g, ""))
          );
          const matchesDomain = vendor.domainPatterns.some((d) => combined.includes(d));

          if (matchesSelector || matchesDomain) {
            const existing = vendorMap.get(vendor.id);
            if (existing) {
              existing.violations.push(violation);
            } else {
              vendorMap.set(vendor.id, { vendor, violations: [violation] });
            }
            attributed = true;
            break;
          }
        }

        if (attributed) break;
      }
    }

    if (!attributed) {
      // Check description for vendor keywords
      const desc = violation.description.toLowerCase();
      let foundVendor = false;
      for (const vendor of KNOWN_VENDORS) {
        if (vendor.domainPatterns.some((d) => desc.includes(d))) {
          const existing = vendorMap.get(vendor.id);
          if (existing) {
            existing.violations.push(violation);
          } else {
            vendorMap.set(vendor.id, { vendor, violations: [violation] });
          }
          foundVendor = true;
          break;
        }
      }

      if (!foundVendor) {
        firstPartyViolations.push(violation);
      }
    }
  }

  // Build vendor risk cards
  const vendorViolationCount = Array.from(vendorMap.values()).reduce(
    (sum, v) => sum + v.violations.length, 0
  );

  const vendors: VendorRiskCard[] = Array.from(vendorMap.entries())
    .map(([, { vendor, violations }]) => {
      // Group violations by rule
      const ruleGroups = new Map<string, { impact: string; count: number }>();
      for (const v of violations) {
        const existing = ruleGroups.get(v.ruleId);
        if (existing) existing.count++;
        else ruleGroups.set(v.ruleId, { impact: v.impact, count: 1 });
      }

      const criticalCount = violations.filter((v) => v.impact === "critical").length;
      const seriousCount = violations.filter((v) => v.impact === "serious").length;
      const riskScore = Math.min(100, criticalCount * 25 + seriousCount * 15 + violations.length * 3);

      let legalExposure: string;
      if (riskScore >= 70) legalExposure = "HIGH — This vendor significantly increases your legal risk";
      else if (riskScore >= 40) legalExposure = "MODERATE — Notable contribution to compliance gap";
      else legalExposure = "LOW — Minor accessibility impact";

      let contractRecommendation: string;
      if (riskScore >= 70) {
        contractRecommendation = "Require VPAT/ACR from vendor. Include accessibility SLA in contract. Consider replacement.";
      } else if (riskScore >= 40) {
        contractRecommendation = "Request accessibility roadmap from vendor. Include compliance clause in next renewal.";
      } else {
        contractRecommendation = "Monitor. No immediate action needed.";
      }

      return {
        vendor: vendor.name,
        category: vendor.category,
        violationCount: violations.length,
        riskContribution: vendorViolationCount > 0
          ? Math.round((violations.length / vendorViolationCount) * 100)
          : 0,
        violations: Array.from(ruleGroups.entries()).map(([ruleId, data]) => ({
          ruleId,
          impact: data.impact,
          count: data.count,
        })),
        riskScore,
        legalExposure,
        contractRecommendation,
      };
    })
    .sort((a, b) => b.riskScore - a.riskScore);

  const vendorContributionPercent = scan.violations.length > 0
    ? Math.round((vendorViolationCount / scan.violations.length) * 100)
    : 0;

  let recommendation: string;
  if (vendorContributionPercent >= 50) {
    recommendation = "⚠️ Majority of violations come from third-party vendors. Fixing your own code won't achieve compliance. Engage vendors or find accessible alternatives.";
  } else if (vendorContributionPercent >= 25) {
    recommendation = "Notable vendor contribution. Address first-party issues first, then work with highest-risk vendors.";
  } else {
    recommendation = "Most violations are in your own code. Focus internal remediation, monitor vendors periodically.";
  }

  return {
    scanId,
    siteUrl: scan.url,
    totalViolations: scan.violations.length,
    vendorViolations: vendorViolationCount,
    firstPartyViolations: firstPartyViolations.length,
    vendorContributionPercent,
    vendors,
    unattributed,
    recommendation,
  };
}
