/**
 * RegLayer — Developer Skill Score Engine
 *
 * WHY: Gamification drives repeat usage. Developers want measurable proof
 *      they're becoming better at accessibility.
 *
 * WHAT: Computes a skill profile from the user's scan history:
 *   - Overall skill score (0–100)
 *   - Category breakdown (color, structure, forms, images, keyboard, aria)
 *   - Badges earned (based on thresholds)
 *   - Progress metrics (violations fixed, streaks, improvement rate)
 *
 * HOW: Analyzes all COMPLETED scans owned by the user. Maps violation ruleIds
 *      to categories. Computes score from: recent avg scan score, fix rate,
 *      category coverage, and improvement trend.
 */

// ─────────────── Category Mapping ───────────────

/**
 * Maps axe-core ruleIds to skill categories.
 * A violation's ruleId tells us which accessibility domain the developer
 * needs to improve in.
 */
export const SKILL_CATEGORIES = {
  color: {
    name: "Color & Contrast",
    description: "Ensuring sufficient color contrast and not relying on color alone",
    icon: "Palette",
    rules: [
      "color-contrast",
      "color-contrast-enhanced",
      "link-in-text-block",
    ],
  },
  structure: {
    name: "Page Structure",
    description: "Proper headings, landmarks, and document structure",
    icon: "Layout",
    rules: [
      "heading-order",
      "landmark-one-main",
      "landmark-unique",
      "region",
      "bypass",
      "page-has-heading-one",
      "document-title",
      "html-has-lang",
      "html-lang-valid",
      "valid-lang",
      "landmark-banner-is-top-level",
      "landmark-contentinfo-is-top-level",
      "landmark-main-is-top-level",
      "landmark-no-duplicate-banner",
      "landmark-no-duplicate-contentinfo",
      "landmark-no-duplicate-main",
    ],
  },
  forms: {
    name: "Forms & Inputs",
    description: "Accessible form controls, labels, and error handling",
    icon: "FormInput",
    rules: [
      "label",
      "input-button-name",
      "input-image-alt",
      "select-name",
      "autocomplete-valid",
      "form-field-multiple-labels",
    ],
  },
  images: {
    name: "Images & Media",
    description: "Alt text, captions, and media alternatives",
    icon: "Image",
    rules: [
      "image-alt",
      "image-redundant-alt",
      "input-image-alt",
      "svg-img-alt",
      "object-alt",
      "video-caption",
      "audio-caption",
      "frame-title",
      "frame-title-unique",
    ],
  },
  keyboard: {
    name: "Keyboard & Focus",
    description: "Full keyboard operability and visible focus indicators",
    icon: "Keyboard",
    rules: [
      "tabindex",
      "focus-order-semantics",
      "scrollable-region-focusable",
      "nested-interactive",
      "no-autoplay-audio",
      "accesskeys",
    ],
  },
  aria: {
    name: "ARIA & Semantics",
    description: "Correct ARIA usage and semantic HTML",
    icon: "Code2",
    rules: [
      "aria-allowed-attr",
      "aria-allowed-role",
      "aria-command-name",
      "aria-dialog-name",
      "aria-hidden-body",
      "aria-hidden-focus",
      "aria-input-field-name",
      "aria-meter-name",
      "aria-progressbar-name",
      "aria-required-attr",
      "aria-required-children",
      "aria-required-parent",
      "aria-roledescription",
      "aria-roles",
      "aria-text",
      "aria-toggle-field-name",
      "aria-tooltip-name",
      "aria-treeitem-name",
      "aria-valid-attr",
      "aria-valid-attr-value",
      "button-name",
      "link-name",
      "role-img-alt",
      "empty-heading",
      "duplicate-id",
      "duplicate-id-aria",
      "duplicate-id-active",
      "list",
      "listitem",
      "definition-list",
      "dlitem",
      "table-duplicate-name",
      "td-headers-attr",
      "th-has-data-cells",
    ],
  },
} as const;

export type SkillCategory = keyof typeof SKILL_CATEGORIES;
export const ALL_CATEGORIES = Object.keys(SKILL_CATEGORIES) as SkillCategory[];

/**
 * Given a ruleId, return the category it belongs to.
 * Falls back to "aria" for unknown rules (most generic).
 */
export function categorizeRule(ruleId: string): SkillCategory {
  for (const [cat, config] of Object.entries(SKILL_CATEGORIES)) {
    if ((config.rules as readonly string[]).includes(ruleId)) return cat as SkillCategory;
  }
  return "aria"; // fallback
}

// ─────────────── Badges ───────────────

export interface Badge {
  id: string;
  name: string;
  description: string;
  icon: string;
  category: SkillCategory | "overall";
  threshold: number; // category score needed to earn
  tier: "bronze" | "silver" | "gold";
}

export const BADGES: Badge[] = [
  // Overall
  { id: "first-scan", name: "First Steps", description: "Completed your first accessibility scan", icon: "Rocket", category: "overall", threshold: 0, tier: "bronze" },
  { id: "score-70", name: "Accessibility Aware", description: "Achieved a scan score of 70+", icon: "Target", category: "overall", threshold: 70, tier: "bronze" },
  { id: "score-85", name: "Accessibility Champion", description: "Achieved a scan score of 85+", icon: "Trophy", category: "overall", threshold: 85, tier: "silver" },
  { id: "score-95", name: "Accessibility Expert", description: "Achieved a scan score of 95+", icon: "Crown", category: "overall", threshold: 95, tier: "gold" },
  { id: "fix-10", name: "Bug Squasher", description: "Fixed 10 violations", icon: "Bug", category: "overall", threshold: 10, tier: "bronze" },
  { id: "fix-50", name: "Fixer Upper", description: "Fixed 50 violations", icon: "Wrench", category: "overall", threshold: 50, tier: "silver" },
  { id: "fix-100", name: "Accessibility Hero", description: "Fixed 100 violations", icon: "Shield", category: "overall", threshold: 100, tier: "gold" },
  { id: "streak-3", name: "Consistent", description: "3-scan improvement streak", icon: "Flame", category: "overall", threshold: 3, tier: "bronze" },
  { id: "streak-7", name: "On Fire", description: "7-scan improvement streak", icon: "Flame", category: "overall", threshold: 7, tier: "silver" },

  // Category mastery
  { id: "color-pro", name: "Color Contrast Pro", description: "Zero color violations for 3+ scans", icon: "Palette", category: "color", threshold: 90, tier: "silver" },
  { id: "structure-pro", name: "Structure Master", description: "Perfect page structure for 3+ scans", icon: "Layout", category: "structure", threshold: 90, tier: "silver" },
  { id: "forms-pro", name: "Form Whisperer", description: "All forms fully accessible for 3+ scans", icon: "FormInput", category: "forms", threshold: 90, tier: "silver" },
  { id: "images-pro", name: "Alt Text Champion", description: "All images properly described for 3+ scans", icon: "Image", category: "images", threshold: 90, tier: "silver" },
  { id: "keyboard-pro", name: "Keyboard Navigator", description: "Full keyboard access for 3+ scans", icon: "Keyboard", category: "keyboard", threshold: 90, tier: "silver" },
  { id: "aria-pro", name: "ARIA Master", description: "Correct ARIA usage for 3+ scans", icon: "Code2", category: "aria", threshold: 90, tier: "silver" },
];

// ─────────────── Score Computation ───────────────

export interface CategoryScore {
  category: SkillCategory;
  score: number; // 0–100
  violationCount: number; // total violations in this category
  fixedCount: number; // violations marked FIXED/VERIFIED
  trend: "improving" | "stable" | "declining";
}

export interface SkillProfile {
  overallScore: number;
  level: string;
  totalScans: number;
  totalViolationsFound: number;
  totalViolationsFixed: number;
  fixRate: number; // percentage
  improvementStreak: number;
  bestScore: number;
  categories: CategoryScore[];
  badges: Badge[];
  nextBadge: Badge | null;
  weakestCategory: SkillCategory | null;
  strongestCategory: SkillCategory | null;
}

interface ScanData {
  id: string;
  score: number | null;
  createdAt: Date;
  violations: Array<{
    ruleId: string;
    impact: string;
    status: string;
  }>;
}

/**
 * Compute the full skill profile for a user given their scan history.
 */
export function computeSkillProfile(scans: ScanData[]): SkillProfile {
  if (scans.length === 0) {
    return emptyProfile();
  }

  // Sort scans by date (ascending)
  const sorted = [...scans].sort(
    (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
  );

  // Aggregate all violations across all scans
  const allViolations = sorted.flatMap((s) => s.violations);
  const totalViolationsFound = allViolations.length;
  const totalViolationsFixed = allViolations.filter(
    (v) => v.status === "FIXED" || v.status === "VERIFIED"
  ).length;
  const fixRate = totalViolationsFound > 0
    ? Math.round((totalViolationsFixed / totalViolationsFound) * 100)
    : 0;

  // Category scores
  const categoryViolations: Record<SkillCategory, { total: number; fixed: number; recentCount: number }> = {
    color: { total: 0, fixed: 0, recentCount: 0 },
    structure: { total: 0, fixed: 0, recentCount: 0 },
    forms: { total: 0, fixed: 0, recentCount: 0 },
    images: { total: 0, fixed: 0, recentCount: 0 },
    keyboard: { total: 0, fixed: 0, recentCount: 0 },
    aria: { total: 0, fixed: 0, recentCount: 0 },
  };

  // Count violations per category
  for (const v of allViolations) {
    const cat = categorizeRule(v.ruleId);
    categoryViolations[cat].total++;
    if (v.status === "FIXED" || v.status === "VERIFIED") {
      categoryViolations[cat].fixed++;
    }
  }

  // Count violations in recent scans (last 3)
  const recentScans = sorted.slice(-3);
  for (const scan of recentScans) {
    for (const v of scan.violations) {
      const cat = categorizeRule(v.ruleId);
      categoryViolations[cat].recentCount++;
    }
  }

  // Calculate category scores
  const categories: CategoryScore[] = ALL_CATEGORIES.map((cat) => {
    const data = categoryViolations[cat];
    // Score = 100 - (recent violations / recent scans * weight)
    const avgRecentViolations = recentScans.length > 0
      ? data.recentCount / recentScans.length
      : 0;
    // 0 violations = 100, 5+ = low score
    const score = Math.max(0, Math.min(100, 100 - avgRecentViolations * 20));

    // Trend: compare first half vs second half of scans
    const mid = Math.floor(sorted.length / 2);
    const firstHalf = sorted.slice(0, mid || 1);
    const secondHalf = sorted.slice(mid);
    const firstCount = firstHalf.flatMap((s) => s.violations).filter((v) => categorizeRule(v.ruleId) === cat).length;
    const secondCount = secondHalf.flatMap((s) => s.violations).filter((v) => categorizeRule(v.ruleId) === cat).length;
    const firstAvg = firstHalf.length > 0 ? firstCount / firstHalf.length : 0;
    const secondAvg = secondHalf.length > 0 ? secondCount / secondHalf.length : 0;

    let trend: "improving" | "stable" | "declining" = "stable";
    if (secondAvg < firstAvg - 0.5) trend = "improving";
    else if (secondAvg > firstAvg + 0.5) trend = "declining";

    return { category: cat, score: Math.round(score), violationCount: data.total, fixedCount: data.fixed, trend };
  });

  // Improvement streak
  const scores = sorted.filter((s) => s.score != null).map((s) => s.score!);
  let improvementStreak = 0;
  for (let i = scores.length - 1; i > 0; i--) {
    if (scores[i] >= scores[i - 1]) {
      improvementStreak++;
    } else {
      break;
    }
  }

  const bestScore = scores.length > 0 ? Math.max(...scores) : 0;

  // Overall score: weighted average of category scores + fix rate bonus
  const avgCategoryScore = categories.reduce((sum, c) => sum + c.score, 0) / categories.length;
  const fixBonus = fixRate * 0.1; // up to 10 extra points
  const overallScore = Math.min(100, Math.round(avgCategoryScore + fixBonus));

  // Level
  const level = getLevel(overallScore);

  // Strongest/weakest
  const sorted_categories = [...categories].sort((a, b) => a.score - b.score);
  const weakestCategory = sorted_categories[0]?.violationCount > 0 ? sorted_categories[0].category : null;
  const strongestCategory = sorted_categories[sorted_categories.length - 1]?.category ?? null;

  // Badges earned
  const earnedBadges = computeBadges({
    totalScans: scans.length,
    bestScore,
    totalFixed: totalViolationsFixed,
    improvementStreak,
    categories,
  });

  // Next badge to earn
  const allBadgeIds = new Set(earnedBadges.map((b) => b.id));
  const nextBadge = BADGES.find((b) => !allBadgeIds.has(b.id)) ?? null;

  return {
    overallScore,
    level,
    totalScans: scans.length,
    totalViolationsFound,
    totalViolationsFixed,
    fixRate,
    improvementStreak,
    bestScore,
    categories,
    badges: earnedBadges,
    nextBadge,
    weakestCategory,
    strongestCategory,
  };
}

function getLevel(score: number): string {
  if (score >= 95) return "Expert";
  if (score >= 85) return "Advanced";
  if (score >= 70) return "Intermediate";
  if (score >= 50) return "Beginner";
  return "Novice";
}

function computeBadges(data: {
  totalScans: number;
  bestScore: number;
  totalFixed: number;
  improvementStreak: number;
  categories: CategoryScore[];
}): Badge[] {
  const earned: Badge[] = [];

  for (const badge of BADGES) {
    let qualifies = false;

    switch (badge.id) {
      case "first-scan":
        qualifies = data.totalScans >= 1;
        break;
      case "score-70":
        qualifies = data.bestScore >= 70;
        break;
      case "score-85":
        qualifies = data.bestScore >= 85;
        break;
      case "score-95":
        qualifies = data.bestScore >= 95;
        break;
      case "fix-10":
        qualifies = data.totalFixed >= 10;
        break;
      case "fix-50":
        qualifies = data.totalFixed >= 50;
        break;
      case "fix-100":
        qualifies = data.totalFixed >= 100;
        break;
      case "streak-3":
        qualifies = data.improvementStreak >= 3;
        break;
      case "streak-7":
        qualifies = data.improvementStreak >= 7;
        break;
      default:
        // Category badges: check if that category score >= threshold
        if (badge.category !== "overall") {
          const catScore = data.categories.find((c) => c.category === badge.category);
          qualifies = (catScore?.score ?? 0) >= badge.threshold;
        }
    }

    if (qualifies) earned.push(badge);
  }

  return earned;
}

function emptyProfile(): SkillProfile {
  return {
    overallScore: 0,
    level: "Novice",
    totalScans: 0,
    totalViolationsFound: 0,
    totalViolationsFixed: 0,
    fixRate: 0,
    improvementStreak: 0,
    bestScore: 0,
    categories: ALL_CATEGORIES.map((cat) => ({
      category: cat,
      score: 0,
      violationCount: 0,
      fixedCount: 0,
      trend: "stable" as const,
    })),
    badges: [],
    nextBadge: BADGES[0],
    weakestCategory: null,
    strongestCategory: null,
  };
}
