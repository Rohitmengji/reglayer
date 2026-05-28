/**
 * Real User Monitoring (RUM) — Accessibility Event Collector
 *
 * Processes accessibility barrier events sent from the
 * client-side RUM snippet embedded on production sites.
 */

export interface RumEvent {
  type:
    | "focus-trap"
    | "keyboard-nav-failure"
    | "missing-label"
    | "low-contrast-interaction"
    | "missing-alt-interaction"
    | "aria-error"
    | "screen-reader-issue"
    | "touch-target-small"
    | "animation-no-reduce";
  selector: string;
  page: string;
  timestamp: number;
  sessionId: string;
  userAgent?: string;
  viewport?: { width: number; height: number };
  details?: Record<string, unknown>;
}

export interface RumSession {
  sessionId: string;
  siteId: string;
  startedAt: number;
  events: RumEvent[];
  pages: string[];
  deviceType: "desktop" | "mobile" | "tablet";
  assistiveTech?: string;
}

export interface RumAggregation {
  siteId: string;
  period: "hour" | "day" | "week";
  totalSessions: number;
  totalEvents: number;
  barriersByType: Record<string, number>;
  topPages: { page: string; eventCount: number }[];
  topSelectors: { selector: string; type: string; count: number }[];
  impactScore: number;
  deviceBreakdown: { desktop: number; mobile: number; tablet: number };
  assistiveTechUsers: number;
}

/**
 * Aggregate raw events into summary metrics
 */
export function aggregateEvents(
  events: RumEvent[],
  siteId: string,
  period: "hour" | "day" | "week" = "day"
): RumAggregation {
  const barriersByType: Record<string, number> = {};
  const pageEvents: Record<string, number> = {};
  const selectorCounts: Record<string, { type: string; count: number }> = {};
  const sessions = new Set<string>();
  const deviceCounts = { desktop: 0, mobile: 0, tablet: 0 };
  let assistiveTechUsers = 0;

  for (const event of events) {
    // Count by type
    barriersByType[event.type] = (barriersByType[event.type] || 0) + 1;

    // Count by page
    pageEvents[event.page] = (pageEvents[event.page] || 0) + 1;

    // Count by selector
    const key = `${event.type}::${event.selector}`;
    if (!selectorCounts[key]) {
      selectorCounts[key] = { type: event.type, count: 0 };
    }
    selectorCounts[key].count++;

    // Track sessions
    sessions.add(event.sessionId);

    // Device type detection from viewport
    if (event.viewport) {
      if (event.viewport.width < 768) deviceCounts.mobile++;
      else if (event.viewport.width < 1024) deviceCounts.tablet++;
      else deviceCounts.desktop++;
    }

    // Assistive tech detection
    if (event.details?.assistiveTech) {
      assistiveTechUsers++;
    }
  }

  const topPages = Object.entries(pageEvents)
    .map(([page, eventCount]) => ({ page, eventCount }))
    .sort((a, b) => b.eventCount - a.eventCount)
    .slice(0, 10);

  const topSelectors = Object.entries(selectorCounts)
    .map(([key, val]) => ({
      selector: key.split("::")[1],
      type: val.type,
      count: val.count,
    }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 20);

  // Impact score: weighted sum of barriers normalized
  const weights: Record<string, number> = {
    "focus-trap": 10,
    "keyboard-nav-failure": 8,
    "screen-reader-issue": 9,
    "missing-label": 6,
    "aria-error": 7,
    "low-contrast-interaction": 5,
    "missing-alt-interaction": 4,
    "touch-target-small": 5,
    "animation-no-reduce": 3,
  };

  let weightedSum = 0;
  for (const [type, count] of Object.entries(barriersByType)) {
    weightedSum += (weights[type] || 5) * count;
  }

  // Normalize to 0-100 (higher = worse)
  const totalSessions = sessions.size || 1;
  const impactScore = Math.min(100, Math.round((weightedSum / totalSessions) * 2));

  return {
    siteId,
    period,
    totalSessions,
    totalEvents: events.length,
    barriersByType,
    topPages,
    topSelectors,
    impactScore,
    deviceBreakdown: deviceCounts,
    assistiveTechUsers,
  };
}

/**
 * Detect device type from user agent string
 */
export function detectDevice(ua: string): "desktop" | "mobile" | "tablet" {
  const lower = ua.toLowerCase();
  if (/ipad|tablet|playbook|silk/.test(lower)) return "tablet";
  if (/mobile|iphone|ipod|android(?!.*tablet)|blackberry|opera mini|iemobile/.test(lower)) return "mobile";
  return "desktop";
}

/**
 * Detect assistive technology from user agent or event details
 */
export function detectAssistiveTech(ua: string, details?: Record<string, unknown>): string | undefined {
  if (details?.assistiveTech) return String(details.assistiveTech);
  const lower = ua.toLowerCase();
  if (lower.includes("nvda")) return "NVDA";
  if (lower.includes("jaws")) return "JAWS";
  if (lower.includes("voiceover")) return "VoiceOver";
  if (lower.includes("talkback")) return "TalkBack";
  return undefined;
}
