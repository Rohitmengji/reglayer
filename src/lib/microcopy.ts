/**
 * ---------------------------------------------------------
 * RegLayer — Microcopy & Personality System
 * ---------------------------------------------------------
 *
 * WHY: Every touchpoint is a brand moment. Error messages, loading states,
 * success notifications, empty states — they all communicate personality.
 * Robotic "An error occurred" tells users nobody cares. Human copy tells
 * them a real team built this.
 *
 * WHAT:
 * - Centralized copy for all system messages
 * - Categorized: errors, success, loading, empty, tips
 * - Randomized variants to avoid repetition
 * - Tone: professional but warm, confident, slightly witty
 *
 * PERSONALITY GUIDE:
 * - Voice: Expert friend, not corporate drone
 * - Tone: Calm confidence (never panicky on errors)
 * - Humor: Subtle, never at user's expense
 * - Always actionable: tell them what to do next
 * ---------------------------------------------------------
 */

// ─── Error Messages ───────────────────────────────────────────────────────────

export const errors = {
  generic: [
    "Something didn't work as expected. Our team has been notified.",
    "We hit a snag. Give it another try, or reach out if it persists.",
    "That didn't quite land. Let's try again.",
  ],
  network: [
    "Looks like the connection dropped. Check your internet and try again.",
    "We couldn't reach our servers. Your internet might be taking a break.",
    "Network hiccup — it happens to the best of us. Retry in a moment.",
  ],
  notFound: [
    "We looked everywhere, but this page doesn't exist.",
    "This page has gone on vacation. Try the dashboard instead.",
    "404 — the one accessibility issue we can't auto-fix.",
  ],
  unauthorized: [
    "You'll need to sign in to see this.",
    "This content is for team members. Sign in to continue.",
    "Access denied — but just a login away.",
  ],
  rateLimit: [
    "Whoa, slow down! You're faster than our servers. Try again in a moment.",
    "Rate limit reached. Take a breath — we'll be ready again shortly.",
    "Too many requests too fast. Give us 30 seconds to catch up.",
  ],
  scanFailed: [
    "The scan couldn't complete. The site might be blocking our crawler.",
    "We couldn't scan this URL. Double-check it's publicly accessible.",
    "Scan failed — the page might be behind a login wall or firewall.",
  ],
  validation: [
    "Some fields need attention before we can continue.",
    "Almost there — just fix the highlighted fields.",
    "A few things need adjusting. See the details below.",
  ],
};

// ─── Success Messages ─────────────────────────────────────────────────────────

export const success = {
  scanComplete: [
    "Scan complete! Here's what we found.",
    "All done. Your accessibility report is ready.",
    "Scan finished. Let's see how accessible you are.",
  ],
  saved: [
    "Saved successfully.",
    "Changes saved.",
    "All set — your changes are live.",
  ],
  teamInvited: [
    "Invitation sent! They'll get an email shortly.",
    "Your teammate has been invited. Collaboration unlocked!",
    "Invite sent. The more eyes on accessibility, the better.",
  ],
  fixApplied: [
    "Fix applied! One less barrier for your users.",
    "Done — that issue is now resolved.",
    "Fixed! Your site just became more accessible.",
  ],
  perfectScore: [
    "100% compliance! You're making the web better for everyone. 🎉",
    "Perfect score! Your users (and their lawyers) will love this.",
    "Full marks! You're in the top 1% of accessible websites.",
  ],
  streakMilestone: [
    "Streak milestone reached! You're on fire. 🔥",
    "New record! Your consistency is paying off.",
    "Milestone unlocked! Keep the momentum going.",
  ],
};

// ─── Loading Messages ─────────────────────────────────────────────────────────

export const loading = {
  scan: [
    "Scanning pages for accessibility issues...",
    "Checking WCAG criteria... this usually takes 10-30 seconds.",
    "Our crawler is inspecting your site. Hang tight.",
  ],
  generic: [
    "Loading...",
    "Getting things ready...",
    "One moment...",
  ],
  report: [
    "Generating your compliance report...",
    "Crunching the numbers...",
    "Building your report — almost there.",
  ],
};

// ─── Empty State Messages ─────────────────────────────────────────────────────

export const empty = {
  scans: {
    title: "No scans yet",
    description: "Run your first accessibility scan to discover issues and start your compliance journey.",
  },
  violations: {
    title: "All clear! Zero violations 🎉",
    description: "Your site is passing all accessibility checks. Keep monitoring to maintain this score.",
  },
  sites: {
    title: "No sites registered",
    description: "Add your first website to begin continuous accessibility monitoring.",
  },
  team: {
    title: "Your team awaits",
    description: "Invite colleagues to collaborate. Designers catch visual issues, developers fix code, legal tracks compliance.",
  },
  notifications: {
    title: "You're all caught up",
    description: "No new notifications. We'll let you know when something needs your attention.",
  },
};

// ─── Tips & Encouragements ────────────────────────────────────────────────────

export const tips = [
  "Tip: Alt text should describe the image's purpose, not just what it looks like.",
  "Did you know? 96.3% of homepages have WCAG failures. You're already ahead.",
  "Pro tip: Schedule weekly scans to catch issues before your users do.",
  "Focus indicators aren't just for keyboard users — they help everyone.",
  "Color contrast isn't just about vision — it helps in bright sunlight too.",
  "The EAA deadline is approaching. Run compliance checks monthly to stay ahead.",
  "Most lawsuits target missing alt text and poor keyboard navigation. Fix those first.",
  "Semantic HTML does 80% of the accessibility work for free.",
];

// ─── Helper ───────────────────────────────────────────────────────────────────

/** Pick a random variant from an array of messages */
export function pickRandom<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

/** Get a random error message by category */
export function getErrorMessage(category: keyof typeof errors): string {
  return pickRandom(errors[category]);
}

/** Get a random success message by category */
export function getSuccessMessage(category: keyof typeof success): string {
  return pickRandom(success[category]);
}

/** Get a random loading message by category */
export function getLoadingMessage(category: keyof typeof loading): string {
  return pickRandom(loading[category]);
}

/** Get a random tip */
export function getRandomTip(): string {
  return pickRandom(tips);
}
