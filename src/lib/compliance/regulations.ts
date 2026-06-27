/**
 * RegLayer — accessibility regulation applicability + deadlines engine
 *
 * Answers the question every buyer actually has: "which accessibility laws apply
 * to ME, to what WCAG level, and by when?" Given a business profile (region,
 * sector, public/private, size, EU reach) it returns the applicable regimes with
 * the required WCAG version/level and key dates. Pure + deterministic.
 *
 * NOT legal advice — general guidance based on the well-established regimes
 * (EAA, EU WAD, ADA Title II/III, Section 508, UK PSBAR/Equality Act, AODA).
 * Dates reflect the major rules as of 2026.
 */
export type Region = "US" | "EU" | "UK" | "CA" | "OTHER";
export type GovLevel = "federal" | "state_local" | "none";
export type Sector = "ecommerce" | "banking" | "transport" | "ebooks" | "telecom" | "media" | "other";

export interface RegulationProfile {
  region?: Region;
  isPublicSector?: boolean;
  governmentLevel?: GovLevel; // US public sector tiering
  sellsToEU?: boolean;
  sector?: Sector;
  employees?: number;
  annualRevenueEur?: number; // EAA microenterprise test
  populationServed?: number; // ADA Title II tiering
}

export interface ApplicableLaw {
  id: string;
  name: string;
  jurisdiction: string;
  appliesBecause: string;
  standard: string;
  wcagVersion: "2.0" | "2.1" | "2.2";
  level: "A" | "AA" | "AAA";
  status: "in_effect" | "upcoming";
  deadline: string | null; // ISO date, or null if in effect / no fixed date
  notes?: string;
}

export interface RegulationAssessment {
  applicable: ApplicableLaw[];
  requiredWcag: string | null; // strictest among applicable, e.g. "WCAG 2.1 Level AA"
  disclaimer: string;
}

const DISCLAIMER = "General guidance, not legal advice. Confirm obligations with qualified counsel for your specific situation.";
const EAA_SECTORS = new Set<Sector>(["ecommerce", "banking", "transport", "ebooks", "telecom", "media"]);
const VERSION_RANK: Record<string, number> = { "2.0": 0, "2.1": 1, "2.2": 2 };
const LEVEL_RANK: Record<string, number> = { A: 0, AA: 1, AAA: 2 };

export function assessRegulations(profile: RegulationProfile): RegulationAssessment {
  const p = profile ?? {};
  const laws: ApplicableLaw[] = [];

  // ── EAA — private sector providing covered services/products to EU consumers ──
  if (!p.isPublicSector && p.sellsToEU && p.sector && EAA_SECTORS.has(p.sector)) {
    const microExempt =
      p.employees !== undefined && p.employees < 10 &&
      p.annualRevenueEur !== undefined && p.annualRevenueEur <= 2_000_000;
    if (!microExempt) {
      laws.push({
        id: "eaa", name: "European Accessibility Act (Directive 2019/882)", jurisdiction: "EU",
        appliesBecause: `You provide ${p.sector} services/products to consumers in the EU`,
        standard: "EN 301 549", wcagVersion: "2.1", level: "AA", status: "in_effect", deadline: "2025-06-28",
        notes: "Microenterprises providing services (<10 staff and ≤ €2M turnover) are exempt.",
      });
    }
  }

  // ── EU public-sector web/app directive ──
  if (p.isPublicSector && p.region === "EU") {
    laws.push({
      id: "eu-wad", name: "EU Web Accessibility Directive (2016/2102)", jurisdiction: "EU",
      appliesBecause: "You are an EU public-sector body", standard: "EN 301 549",
      wcagVersion: "2.1", level: "AA", status: "in_effect", deadline: null,
    });
  }

  // ── United States ──
  if (p.region === "US") {
    if (p.isPublicSector && p.governmentLevel === "federal") {
      laws.push({
        id: "section-508", name: "Section 508 of the Rehabilitation Act", jurisdiction: "US (federal)",
        appliesBecause: "You are a US federal agency or a vendor selling to one",
        standard: "Revised Section 508", wcagVersion: "2.0", level: "AA", status: "in_effect", deadline: null,
      });
    }
    if (p.isPublicSector && p.governmentLevel === "state_local") {
      const large = (p.populationServed ?? 0) >= 50_000;
      laws.push({
        id: "ada-title-ii", name: "ADA Title II (DOJ 2024 web rule)", jurisdiction: "US (state/local government)",
        appliesBecause: "You are a US state or local government entity",
        standard: "WCAG", wcagVersion: "2.1", level: "AA", status: "upcoming",
        deadline: large ? "2026-04-24" : "2027-04-26",
        notes: large ? "Entities serving ≥ 50,000 people." : "Entities serving < 50,000 people, plus special-district governments.",
      });
    }
    if (!p.isPublicSector) {
      laws.push({
        id: "ada-title-iii", name: "ADA Title III", jurisdiction: "US",
        appliesBecause: "US courts treat business websites as places of public accommodation",
        standard: "WCAG (de facto)", wcagVersion: "2.1", level: "AA", status: "in_effect", deadline: null,
        notes: "No fixed federal deadline, but active litigation risk; WCAG 2.1 AA is the de-facto bar.",
      });
    }
  }

  // ── United Kingdom ──
  if (p.region === "UK") {
    laws.push(p.isPublicSector
      ? { id: "uk-psbar", name: "Public Sector Bodies Accessibility Regulations 2018", jurisdiction: "UK", appliesBecause: "You are a UK public-sector body", standard: "EN 301 549", wcagVersion: "2.1", level: "AA", status: "in_effect", deadline: null }
      : { id: "uk-equality-act", name: "Equality Act 2010", jurisdiction: "UK", appliesBecause: "UK service providers must make reasonable adjustments for disabled users", standard: "WCAG (expected)", wcagVersion: "2.1", level: "AA", status: "in_effect", deadline: null });
  }

  // ── Canada — Ontario (AODA) ──
  if (p.region === "CA" && (p.isPublicSector || (p.employees ?? 0) >= 20)) {
    laws.push({
      id: "aoda", name: "AODA (Accessibility for Ontarians with Disabilities Act)", jurisdiction: "Canada (Ontario)",
      appliesBecause: p.isPublicSector ? "Public-sector organization in Ontario" : "Private organization in Ontario with 20+ employees",
      standard: "WCAG", wcagVersion: "2.0", level: "AA", status: "in_effect", deadline: null,
    });
  }

  return { applicable: laws, requiredWcag: strictest(laws), disclaimer: DISCLAIMER };
}

function strictest(laws: ApplicableLaw[]): string | null {
  if (laws.length === 0) return null;
  let best = laws[0];
  for (const l of laws) {
    if (VERSION_RANK[l.wcagVersion] > VERSION_RANK[best.wcagVersion] ||
      (VERSION_RANK[l.wcagVersion] === VERSION_RANK[best.wcagVersion] && LEVEL_RANK[l.level] > LEVEL_RANK[best.level])) {
      best = l;
    }
  }
  return `WCAG ${best.wcagVersion} Level ${best.level}`;
}
