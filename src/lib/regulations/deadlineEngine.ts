/**
 * RegLayer — Regulation Deadline Intelligence Engine
 *
 * WHY: Organizations miss compliance deadlines because regulations change frequently.
 *      EAA enforcement date (June 28, 2025), state-level ADA requirements, AODA milestones —
 *      each affects different industries and geographies.
 * WHAT: Tracks all major accessibility regulations, their deadlines, and applicability rules.
 *       Matches workspace profiles to relevant deadlines and generates timely alerts.
 * HOW: Static regulation database + workspace geo/industry matching + countdown alerts.
 */

import "server-only";

export interface Regulation {
  id: string;
  name: string;
  shortName: string;
  jurisdiction: string;
  region: string;
  description: string;
  url: string;
  deadlines: RegulationDeadline[];
  applicability: ApplicabilityRule;
  penalties: PenaltyInfo;
}

export interface RegulationDeadline {
  id: string;
  title: string;
  date: string; // ISO date
  description: string;
  severity: "critical" | "high" | "medium" | "low";
  status: "upcoming" | "active" | "passed";
}

export interface ApplicabilityRule {
  industries: string[] | "all";
  minEmployees?: number;
  minRevenue?: number;
  geos: string[];
  sectorExemptions?: string[];
}

export interface PenaltyInfo {
  maxFine: string;
  enforcementBody: string;
  privateRightOfAction: boolean;
  typicalSettlement?: string;
}

export interface DeadlineAlert {
  regulation: string;
  regulationId: string;
  deadline: RegulationDeadline;
  daysUntil: number;
  urgency: "overdue" | "imminent" | "soon" | "upcoming" | "future";
  recommendation: string;
}

/**
 * Comprehensive regulation database covering major accessibility laws worldwide.
 */
export const REGULATIONS: Regulation[] = [
  {
    id: "eaa",
    name: "European Accessibility Act",
    shortName: "EAA",
    jurisdiction: "European Union",
    region: "EU",
    description: "Requires digital products and services to meet accessibility standards across all EU member states.",
    url: "https://ec.europa.eu/social/main.jsp?catId=1202",
    deadlines: [
      {
        id: "eaa-enforcement",
        title: "Full Enforcement",
        date: "2025-06-28",
        description: "All covered products and services must comply. Non-compliant offerings can be removed from market.",
        severity: "critical",
        status: "active",
      },
      {
        id: "eaa-existing-contracts",
        title: "Existing Service Contracts",
        date: "2030-06-28",
        description: "Five-year transition for existing service contracts entered before June 28, 2025.",
        severity: "medium",
        status: "upcoming",
      },
    ],
    applicability: {
      industries: "all",
      minEmployees: 10,
      geos: ["EU", "EEA"],
    },
    penalties: {
      maxFine: "Varies by member state (up to €100,000+)",
      enforcementBody: "National market surveillance authorities",
      privateRightOfAction: true,
      typicalSettlement: "€10,000–€50,000",
    },
  },
  {
    id: "ada-title-iii",
    name: "Americans with Disabilities Act — Title III",
    shortName: "ADA Title III",
    jurisdiction: "United States (Federal)",
    region: "US",
    description: "Requires places of public accommodation to be accessible, increasingly applied to websites.",
    url: "https://www.ada.gov/topics/intro-to-ada/",
    deadlines: [
      {
        id: "ada-web-rule",
        title: "DOJ Web Accessibility Rule (State/Local Gov)",
        date: "2026-04-24",
        description: "State and local governments with 50,000+ population must comply with WCAG 2.1 AA.",
        severity: "critical",
        status: "upcoming",
      },
      {
        id: "ada-web-rule-small",
        title: "DOJ Web Accessibility Rule (Smaller Entities)",
        date: "2027-04-24",
        description: "Smaller state/local governments must comply with WCAG 2.1 AA.",
        severity: "high",
        status: "upcoming",
      },
    ],
    applicability: {
      industries: "all",
      geos: ["US"],
    },
    penalties: {
      maxFine: "$75,000 first violation, $150,000 subsequent",
      enforcementBody: "DOJ Civil Rights Division",
      privateRightOfAction: true,
      typicalSettlement: "$10,000–$100,000",
    },
  },
  {
    id: "aoda",
    name: "Accessibility for Ontarians with Disabilities Act",
    shortName: "AODA",
    jurisdiction: "Ontario, Canada",
    region: "CA",
    description: "Requires Ontario organizations to make websites and web content accessible.",
    url: "https://www.ontario.ca/laws/statute/05a11",
    deadlines: [
      {
        id: "aoda-full",
        title: "Full WCAG 2.0 AA Compliance",
        date: "2021-01-01",
        description: "All public websites and web content must meet WCAG 2.0 Level AA (already in effect).",
        severity: "critical",
        status: "passed",
      },
      {
        id: "aoda-2025-review",
        title: "2025 Legislative Review",
        date: "2025-12-31",
        description: "Provincial review of AODA effectiveness; potential new requirements expected.",
        severity: "medium",
        status: "upcoming",
      },
    ],
    applicability: {
      industries: "all",
      minEmployees: 50,
      geos: ["CA"],
    },
    penalties: {
      maxFine: "CAD $100,000/day for corporations",
      enforcementBody: "Accessibility Directorate of Ontario",
      privateRightOfAction: false,
      typicalSettlement: "CAD $5,000–$50,000",
    },
  },
  {
    id: "en-301-549",
    name: "EN 301 549 — Accessibility Requirements",
    shortName: "EN 301 549",
    jurisdiction: "European Union",
    region: "EU",
    description: "Harmonized European standard for ICT accessibility, referenced by the EAA and public procurement directives.",
    url: "https://www.etsi.org/deliver/etsi_en/301500_301599/301549/",
    deadlines: [
      {
        id: "en301-v4",
        title: "EN 301 549 v4.1.1 Expected",
        date: "2026-03-01",
        description: "Updated version aligning with WCAG 2.2 expected to become harmonized standard.",
        severity: "high",
        status: "upcoming",
      },
    ],
    applicability: {
      industries: "all",
      geos: ["EU", "EEA", "UK"],
    },
    penalties: {
      maxFine: "Excluded from public procurement",
      enforcementBody: "National public procurement bodies",
      privateRightOfAction: false,
    },
  },
  {
    id: "section-508",
    name: "Section 508 of the Rehabilitation Act",
    shortName: "Section 508",
    jurisdiction: "United States (Federal)",
    region: "US",
    description: "Requires federal agencies and their contractors to make ICT accessible.",
    url: "https://www.section508.gov/",
    deadlines: [
      {
        id: "508-refresh",
        title: "ICT Standards Refresh (WCAG 2.2 alignment)",
        date: "2026-06-30",
        description: "US Access Board expected to update Section 508 to reference WCAG 2.2.",
        severity: "high",
        status: "upcoming",
      },
    ],
    applicability: {
      industries: ["government", "education"],
      geos: ["US"],
    },
    penalties: {
      maxFine: "Loss of federal contracts",
      enforcementBody: "US Access Board / GSA",
      privateRightOfAction: true,
    },
  },
  {
    id: "uk-equality-act",
    name: "UK Equality Act 2010 + PSBAR 2018",
    shortName: "UK Equality Act",
    jurisdiction: "United Kingdom",
    region: "UK",
    description: "Requires public sector websites to meet WCAG 2.1 AA under the Public Sector Bodies Accessibility Regulations.",
    url: "https://www.legislation.gov.uk/uksi/2018/852",
    deadlines: [
      {
        id: "uk-psbar-review",
        title: "PSBAR 5-Year Review",
        date: "2026-09-23",
        description: "Mandatory 5-year review of PSBAR effectiveness. May expand to private sector.",
        severity: "medium",
        status: "upcoming",
      },
    ],
    applicability: {
      industries: ["government", "education", "healthcare"],
      geos: ["UK"],
    },
    penalties: {
      maxFine: "Unlimited (discrimination claims)",
      enforcementBody: "Equality and Human Rights Commission",
      privateRightOfAction: true,
      typicalSettlement: "£5,000–£30,000",
    },
  },
  {
    id: "dda-australia",
    name: "Disability Discrimination Act 1992",
    shortName: "DDA (Australia)",
    jurisdiction: "Australia",
    region: "AU",
    description: "Prohibits discrimination on the basis of disability, applied to web accessibility via the advisory notes.",
    url: "https://www.legislation.gov.au/Series/C2004A04426",
    deadlines: [
      {
        id: "dda-digital-review",
        title: "Digital Accessibility Framework Review",
        date: "2026-07-01",
        description: "Australian Human Rights Commission review of digital accessibility enforcement.",
        severity: "medium",
        status: "upcoming",
      },
    ],
    applicability: {
      industries: "all",
      geos: ["AU"],
    },
    penalties: {
      maxFine: "AUD $66,000+ (individuals), AUD $330,000 (corporations)",
      enforcementBody: "Australian Human Rights Commission",
      privateRightOfAction: true,
    },
  },
];

/**
 * Get upcoming deadlines for a workspace based on geography and industry.
 */
export function getApplicableDeadlines(
  geos: string[],
  industry?: string
): DeadlineAlert[] {
  const now = new Date();
  const alerts: DeadlineAlert[] = [];

  for (const reg of REGULATIONS) {
    // Check geographic applicability
    const geoMatch = reg.applicability.geos.some(
      (g) => geos.includes(g) || geos.includes("GLOBAL")
    );
    if (!geoMatch) continue;

    // Check industry applicability
    if (
      reg.applicability.industries !== "all" &&
      industry &&
      !reg.applicability.industries.includes(industry)
    ) {
      continue;
    }

    for (const deadline of reg.deadlines) {
      const deadlineDate = new Date(deadline.date);
      const daysUntil = Math.ceil(
        (deadlineDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24)
      );

      let urgency: DeadlineAlert["urgency"];
      if (daysUntil < 0) urgency = "overdue";
      else if (daysUntil <= 30) urgency = "imminent";
      else if (daysUntil <= 90) urgency = "soon";
      else if (daysUntil <= 365) urgency = "upcoming";
      else urgency = "future";

      let recommendation: string;
      switch (urgency) {
        case "overdue":
          recommendation = `This deadline has passed. Ensure compliance immediately to avoid enforcement action.`;
          break;
        case "imminent":
          recommendation = `Only ${daysUntil} days remaining. Prioritize compliance testing and remediation now.`;
          break;
        case "soon":
          recommendation = `${daysUntil} days remaining. Start compliance audit and remediation planning.`;
          break;
        case "upcoming":
          recommendation = `${daysUntil} days remaining. Include in next quarter's compliance roadmap.`;
          break;
        case "future":
          recommendation = `${daysUntil} days remaining. Monitor for updates and begin early preparation.`;
          break;
      }

      alerts.push({
        regulation: reg.shortName,
        regulationId: reg.id,
        deadline,
        daysUntil,
        urgency,
        recommendation,
      });
    }
  }

  // Sort by urgency (overdue first, then by days)
  alerts.sort((a, b) => {
    const urgencyOrder = { overdue: 0, imminent: 1, soon: 2, upcoming: 3, future: 4 };
    const orderDiff = urgencyOrder[a.urgency] - urgencyOrder[b.urgency];
    if (orderDiff !== 0) return orderDiff;
    return a.daysUntil - b.daysUntil;
  });

  return alerts;
}

/**
 * Get all regulations applicable to given geography/industry.
 */
export function getApplicableRegulations(
  geos: string[],
  industry?: string
): Regulation[] {
  return REGULATIONS.filter((reg) => {
    const geoMatch = reg.applicability.geos.some(
      (g) => geos.includes(g) || geos.includes("GLOBAL")
    );
    if (!geoMatch) return false;

    if (
      reg.applicability.industries !== "all" &&
      industry &&
      !reg.applicability.industries.includes(industry)
    ) {
      return false;
    }

    return true;
  });
}
