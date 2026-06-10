/**
 * Blog article content — serves as fallback when DB is empty.
 * Once articles are saved to DB via the admin editor, DB takes priority.
 */

export interface ArticleSection {
  id: string;
  title: string;
  paragraphs: string[];
  code?: string;
  list?: string[];
  callout?: { title: string; body: string };
  stats?: Array<{ value: string; label: string; color: string; labelColor: string; bg: string; border: string }>;
}

export interface ArticleContent {
  title: string;
  excerpt: string;
  category: string;
  categoryColor: string;
  readTime: string;
  date: string;
  sections: ArticleSection[];
  related?: string[];
  cta?: { title: string; body: string };
}

export const articles: Record<string, ArticleContent> = {
  "wcag-2-2-whats-new": {
    title: "WCAG 2.2: What Changed and Why It Matters",
    excerpt: "Nine new success criteria, three removed. Here's the practical impact on your codebase, testing pipeline, and compliance posture.",
    category: "WCAG",
    categoryColor: "bg-blue-50 dark:bg-blue-950/40 text-blue-600 dark:text-blue-400",
    readTime: "12 min read",
    date: "May 28, 2026",
    related: ["eaa-compliance-deadline", "aria-patterns-that-break"],
    cta: { title: "Check your WCAG 2.2 compliance now", body: "RegLayer scans against all new 2.2 criteria automatically. See exactly where you fail." },
    sections: [
      {
        id: "overview",
        title: "Overview of Changes",
        paragraphs: [
          "WCAG 2.2, published as a W3C Recommendation in October 2023, builds on WCAG 2.1 with a focus on three populations: users with cognitive and learning disabilities, users of mobile devices, and users of ebooks.",
          "The update adds 9 new success criteria at Levels A and AA, removes 1 at Level A (4.1.1 Parsing), and subtly modifies the understanding documents for dozens of existing criteria.",
        ],
        stats: [
          { value: "9", label: "New Criteria", color: "text-emerald-600 dark:text-emerald-400", labelColor: "text-emerald-700 dark:text-emerald-300", bg: "bg-emerald-50 dark:bg-emerald-950/30", border: "border-emerald-100 dark:border-emerald-800/30" },
          { value: "1", label: "Removed", color: "text-red-600 dark:text-red-400", labelColor: "text-red-700 dark:text-red-300", bg: "bg-red-50 dark:bg-red-950/30", border: "border-red-100 dark:border-red-800/30" },
          { value: "87", label: "Total Criteria", color: "text-blue-600 dark:text-blue-400", labelColor: "text-blue-700 dark:text-blue-300", bg: "bg-blue-50 dark:bg-blue-950/30", border: "border-blue-100 dark:border-blue-800/30" },
        ],
      },
      {
        id: "new-criteria",
        title: "New Success Criteria That Matter Most",
        paragraphs: [
          "Of the 9 new criteria, 6 are at Level AA — meaning they apply to most compliance requirements. The three highest-impact additions for development teams are Target Size (2.5.8), Focus Not Obscured (2.4.11), and Accessible Authentication (3.3.8).",
          "Target Size requires all interactive elements to be at least 24×24 CSS pixels. Based on RegLayer scans of 50,000 pages, 72% of sites fail this criterion — primarily in footer links, mobile navigation, and icon buttons without padding.",
        ],
        list: [
          "2.5.8 Target Size (Minimum) — 24×24px minimum for all interactive targets",
          "2.4.11 Focus Not Obscured — focused elements can't be hidden by sticky headers",
          "3.3.8 Accessible Authentication — no cognitive tests for login (CAPTCHAs, math puzzles)",
          "2.5.7 Dragging Movements — single-pointer alternative required for all drag actions",
          "3.3.7 Redundant Entry — don't make users re-enter previously provided information",
          "3.2.6 Consistent Help — help mechanisms must appear in the same position across pages",
        ],
      },
      {
        id: "impact",
        title: "Practical Impact on Your Codebase",
        paragraphs: [
          "The most common failures we see across 50,000+ scanned pages:",
          "Target Size (72% fail rate): Footer links, social icons, and mobile nav items are almost always under 24px. The fix is simple — add min-height and min-width to clickable elements, or increase padding.",
          "Focus Not Obscured (58% fail): Sticky headers and cookie banners routinely cover focused elements. Add scroll-padding-top equal to your sticky header height.",
          "Dragging (41% fail): Sortable lists, kanban boards, and slider controls. Every drag interaction needs an explicit button alternative (move up/down arrows).",
        ],
        code: `// Fix Target Size violations globally
button, a, [role="button"], input, select, textarea {
  min-height: 24px;
  min-width: 24px;
}

// Fix Focus Not Obscured
html {
  scroll-padding-top: calc(var(--header-height) + 16px);
}`,
      },
      {
        id: "testing",
        title: "How to Test for WCAG 2.2",
        paragraphs: [
          "RegLayer's scanner automatically detects violations for 6 of the 9 new criteria. For Consistent Help, Redundant Entry, and Accessible Authentication, automated detection requires multi-page flow analysis — which our crawler handles by following navigation paths.",
          "For manual testing, focus on these quick checks:",
        ],
        list: [
          "Tab through every page — is the focused element always visible?",
          "Check all interactive targets with DevTools — are they 24×24px minimum?",
          "Try your login flow without a mouse — can you complete it without memorizing anything?",
          "Attempt every drag interaction — is there a button alternative?",
          "Fill out a multi-step form — does it remember what you already entered?",
        ],
      },
      {
        id: "timeline",
        title: "Regulatory Adoption Timeline",
        paragraphs: [
          "WCAG 2.2 is already the de facto standard, but regulatory references are catching up:",
          "October 2023: W3C publishes WCAG 2.2 as Recommendation. June 2025: EAA enforcement begins, referencing WCAG 2.1 but strongly recommending 2.2. January 2026: DOJ updated its web accessibility guidance to reference 2.2 criteria. 2026-2027: Section 508 refresh expected to formally incorporate WCAG 2.2.",
          "Bottom line: if you're building for compliance in 2026, you should be testing against WCAG 2.2. The regulatory gap is closing fast.",
        ],
        callout: { title: "RegLayer recommendation", body: "Start testing against WCAG 2.2 now. When regulators catch up (they always do), you'll already be compliant. Our scanner defaults to 2.2 criteria." },
      },
    ],
  },

  "eaa-compliance-deadline": {
    title: "EAA Deadline: What Happens After June 28, 2025",
    excerpt: "The European Accessibility Act is now enforceable. Market surveillance authorities are active. Here's the enforcement reality.",
    category: "EAA",
    categoryColor: "bg-violet-50 dark:bg-violet-950/40 text-violet-600 dark:text-violet-400",
    readTime: "8 min read",
    date: "June 2, 2026",
    related: ["wcag-2-2-whats-new", "ada-title-iii-2026-update"],
    cta: { title: "Check your EAA compliance", body: "RegLayer maps WCAG criteria to EAA requirements automatically. See your compliance status." },
    sections: [
      {
        id: "enforcement",
        title: "Enforcement Is Real — Not Theoretical",
        paragraphs: [
          "Unlike previous accessibility regulations that lacked teeth, the EAA gives each EU member state authority to impose penalties on non-compliant businesses. Germany's Federal Office for Accessibility has already issued formal notices. France's ARCOM has published its first batch of non-compliance reports.",
          "The penalty structure varies by country but ranges from €5,000 to €500,000 per infringement, with repeat violations escalating. Some countries (Netherlands, Sweden) can order market withdrawal of non-compliant digital products.",
        ],
      },
      {
        id: "scope",
        title: "Who's Affected — The Scope Is Broader Than You Think",
        paragraphs: [
          "The EAA applies to 'products and services placed on the market after June 28, 2025.' This includes: e-commerce websites, banking services, transport ticketing, e-books, telecom services, and any B2C digital product sold to EU consumers.",
          "Key nuance: If your website serves EU customers — even from a US-based company — you're in scope. This isn't GDPR-style 'processing EU data.' It's 'selling to EU people.' The jurisdictional hook is the consumer's location, not yours.",
        ],
        callout: { title: "Important for US companies", body: "If you have EU customers, you're in scope. The EAA doesn't have a GDPR-style 'establishment in the EU' requirement. Market access = compliance obligation." },
      },
      {
        id: "technical-requirements",
        title: "Technical Requirements Mapping",
        paragraphs: [
          "The EAA references EN 301 549 as the harmonized standard, which maps to WCAG 2.1 Level AA. However, the standard is being updated to reference WCAG 2.2, and market surveillance authorities are already using 2.2 criteria in their assessments.",
          "Practically, this means you need: WCAG 2.1 AA compliance at minimum (mandatory), WCAG 2.2 AA compliance (strongly recommended and increasingly expected), accessibility statement published on your site, and a feedback mechanism for users to report barriers.",
        ],
        list: [
          "WCAG 2.1 Level AA — mandatory baseline",
          "WCAG 2.2 Level AA — strongly recommended, increasingly tested",
          "Published accessibility statement — required by Article 14",
          "Feedback mechanism — users must be able to report barriers",
          "Disproportionate burden assessment — if claiming exemption, must be documented",
        ],
      },
      {
        id: "action-plan",
        title: "90-Day Action Plan",
        paragraphs: [
          "If you haven't started EAA compliance work, here's a realistic timeline to reduce risk:",
          "Week 1-2: Run a full-site automated scan (RegLayer covers this). Identify critical and serious violations. Prioritize by user impact, not just severity.",
          "Week 3-6: Fix critical issues — color contrast, missing alt text, keyboard traps, form labels. These are the violations surveillance authorities look for first.",
          "Week 7-8: Publish your accessibility statement. Document known issues and remediation timeline. This shows good faith.",
          "Week 9-12: Address remaining serious issues. Set up monitoring for regressions. Train development team on accessible coding patterns.",
        ],
      },
    ],
  },

  "aria-patterns-that-break": {
    title: "ARIA Patterns That Break Screen Readers (And What to Use Instead)",
    excerpt: "Common ARIA anti-patterns found in 10,000 scans. Role conflicts, missing states, and the tabindex trap.",
    category: "Technical",
    categoryColor: "bg-emerald-50 dark:bg-emerald-950/40 text-emerald-600 dark:text-emerald-400",
    readTime: "15 min read",
    date: "June 8, 2026",
    related: ["wcag-2-2-whats-new", "color-contrast-beyond-ratios"],
    cta: { title: "Find ARIA issues in your site", body: "RegLayer's scanner detects 47 distinct ARIA violation patterns. Run a free scan." },
    sections: [
      {
        id: "the-problem",
        title: "ARIA: The Most Misused Tool in Web Development",
        paragraphs: [
          "ARIA (Accessible Rich Internet Applications) was designed to bridge gaps where native HTML semantics fall short. But in practice, it's the #1 source of accessibility violations we find. In 10,000 scans, 83% of sites had at least one ARIA error — and most had more than five.",
          "The first rule of ARIA is: don't use ARIA. If a native HTML element provides the semantics you need, use that instead. A <button> is always better than <div role='button'>. A <nav> is always better than <div role='navigation'>.",
        ],
        callout: { title: "The First Rule of ARIA", body: "If you can use a native HTML element or attribute with the semantics and behavior you require already built in, do so. Don't use ARIA." },
      },
      {
        id: "role-conflicts",
        title: "Pattern #1: Role Conflicts",
        paragraphs: [
          "The most common mistake is applying ARIA roles that conflict with the element's native semantics. When you add role='button' to an <a> tag, you're telling the screen reader 'this is a button' — but the browser still treats it as a link. The result: confused behavior.",
          "Screen readers may not announce the correct interaction model. NVDA says 'button' but Enter behaves like a link navigation. VoiceOver may ignore the role entirely on certain elements.",
        ],
        code: `// ❌ Bad: Role conflicts with native semantics
<a href="/page" role="button">Click me</a>
<h2 role="tab">Section Title</h2>
<input type="text" role="search" /> // role on input is mostly redundant

// ✅ Good: Use native elements
<button onClick={() => navigate('/page')}>Click me</button>
<button role="tab" aria-selected="true">Section Title</button>
<input type="search" /> // type provides semantics`,
        list: [
          "Never put role='button' on an <a> tag — use <button> with an onClick",
          "Never put interactive roles on heading elements — they lose heading semantics",
          "Role on <input> is almost always redundant — use the correct type attribute",
          "Don't use role='presentation' on elements that have required children (like <table>)",
        ],
      },
      {
        id: "missing-states",
        title: "Pattern #2: Missing Required States",
        paragraphs: [
          "When you use ARIA roles that require specific states, omitting those states is worse than not using ARIA at all. A role='checkbox' without aria-checked is a checkbox in limbo — the screen reader announces 'checkbox' but can't tell the user if it's checked.",
          "Required states are non-negotiable. The WAI-ARIA specification lists exactly which attributes are required for each role. RegLayer's scanner checks all 78 required state combinations.",
        ],
        code: `// ❌ Bad: Missing required states
<div role="checkbox">Accept terms</div>
<div role="tab">Tab 1</div>
<div role="combobox">Select...</div>

// ✅ Good: All required states present
<div role="checkbox" aria-checked="false" tabindex="0">Accept terms</div>
<div role="tab" aria-selected="true" aria-controls="panel-1">Tab 1</div>
<div role="combobox" aria-expanded="false" aria-controls="listbox-1">Select...</div>`,
      },
      {
        id: "tabindex-trap",
        title: "Pattern #3: The tabindex Trap",
        paragraphs: [
          "tabindex='0' makes an element focusable in DOM order — fine. tabindex='-1' removes from tab order but allows programmatic focus — also fine. tabindex with any positive value? That's where chaos begins.",
          "Positive tabindex values create a custom tab order that overrides DOM order. This makes navigation unpredictable, breaks skip links, and creates maintenance nightmares. Every time someone adds an element, the entire tab order shifts. We see this in 34% of scanned sites.",
        ],
        code: `// ❌ Bad: Positive tabindex creates unpredictable order
<input tabindex="3" />
<button tabindex="1">Submit</button>
<a tabindex="2" href="/help">Help</a>

// ✅ Good: Use DOM order + tabindex="0" for custom elements
<a href="/help">Help</a>
<input />
<button>Submit</button>
<div role="button" tabindex="0">Custom button</div>`,
        list: [
          "Never use tabindex > 0 — it creates unmaintainable tab orders",
          "Use tabindex='0' to make custom widgets focusable in natural DOM order",
          "Use tabindex='-1' for elements that should only receive programmatic focus",
          "If you need to reorder focus, reorder the DOM instead",
        ],
      },
      {
        id: "live-regions",
        title: "Pattern #4: aria-live Abuse",
        paragraphs: [
          "aria-live regions are supposed to announce dynamic content changes to screen readers. But when overused, they create a cacophony of announcements that overwhelm users.",
          "The most common mistake: putting aria-live='assertive' on elements that update frequently (like timers, stock tickers, or typing indicators). Each update interrupts whatever the screen reader is currently saying. Use 'polite' for most updates, and 'assertive' only for critical alerts.",
        ],
        code: `// ❌ Bad: Assertive on frequently-updating content
<div aria-live="assertive">{typingStatus}</div>
<div aria-live="assertive">Score: {score}</div>

// ✅ Good: Polite for non-critical, assertive only for errors
<div aria-live="polite">{searchResultCount} results</div>
<div role="alert">Payment failed. Please try again.</div>`,
      },
    ],
  },

  "color-contrast-beyond-ratios": {
    title: "Color Contrast Beyond 4.5:1 — APCA and the Future of Readability",
    excerpt: "Why WCAG contrast ratios are flawed, how APCA works, and practical dark mode design that meets perceptual requirements.",
    category: "Design",
    categoryColor: "bg-rose-50 dark:bg-rose-950/40 text-rose-600 dark:text-rose-400",
    readTime: "10 min read",
    date: "June 5, 2026",
    related: ["wcag-2-2-whats-new", "aria-patterns-that-break"],
    cta: { title: "Check your contrast ratios", body: "RegLayer tests both WCAG 2.x ratios and APCA perceptual contrast. Get the full picture." },
    sections: [
      {
        id: "wcag-problem",
        title: "The Problem with WCAG Contrast Ratios",
        paragraphs: [
          "WCAG 2.x uses the luminance contrast ratio formula defined in 2008. It works by comparing relative luminance values of foreground and background colors. The formula: (L1 + 0.05) / (L2 + 0.05) where L1 is the lighter color.",
          "The problem? This formula doesn't account for how humans actually perceive contrast. A white-on-dark-blue text at 4.5:1 feels MORE readable than dark-orange-on-white at the same ratio. The perceptual model is wrong.",
          "Additionally, WCAG ratios treat all text sizes the same below 18pt (or 14pt bold). But an 11px footnote needs much more contrast than a 16px body paragraph to be equally readable.",
        ],
      },
      {
        id: "apca",
        title: "APCA: Perceptual Contrast Done Right",
        paragraphs: [
          "APCA (Accessible Perceptual Contrast Algorithm) is the next-generation contrast model developed by Andrew Somers for WCAG 3.0. Unlike WCAG 2.x ratios, APCA considers: polarity (dark-on-light vs light-on-dark behave differently), font size and weight, spatial frequency of text, and human visual perception models.",
          "APCA produces a Lightness Contrast value (Lc) ranging from 0 to ±108. The key insight: APCA assigns different minimum Lc values based on font size and weight. Large bold headings need less contrast than small body text. This matches how we actually read.",
        ],
        callout: { title: "APCA in practice", body: "Body text (16px, 400 weight) needs Lc 75+. Large headings (32px, 700 weight) only need Lc 60+. Placeholder text (non-essential) can be Lc 45+. This flexibility enables better design." },
      },
      {
        id: "dark-mode",
        title: "Designing Dark Mode That Actually Works",
        paragraphs: [
          "Most dark modes fail accessibility because they simply invert colors. White (#fff) on black (#000) has a 21:1 contrast ratio — technically 'passing' but actually harder to read due to halation (bright text on dark backgrounds appears to bleed/glow).",
          "Best practices for dark mode: Use off-white text (#ededf0) on dark backgrounds — not pure white. Keep body text at Lc 80-90 (not maximum). Use slightly warmer dark backgrounds (#0c0c10) instead of pure black. Increase font weight by one step in dark mode (400→500 for body).",
        ],
        list: [
          "Use off-white (#ededf0) instead of pure white (#fff) for body text",
          "Dark background should be warm-tinted (#0c0c10), not pure black",
          "Increase body font weight by one step in dark mode",
          "Large text (24px+) can use lighter colors — Lc 60 is sufficient",
          "Secondary text should be Lc 60+ (not the Lc 40 many designs use)",
          "Test with f.lux/Night Shift on — many users use these tools",
        ],
        code: `/* Dark mode done right — RegLayer's approach */
.dark {
  --background: #0c0c10;     /* Warm navy-black */
  --foreground: #ededf0;     /* Off-white, not #fff */
  --muted: #8b8b99;          /* Lc 60+ for secondary text */
  --border: #1e1e2a;         /* Visible but subtle */
  --accent: #6366f1;         /* Indigo — vibrant without glare */
}

/* Anti-halation: slightly lighter font weight in dark mode */
@media (prefers-color-scheme: dark) {
  body { font-weight: 450; }
  h1, h2, h3 { font-weight: 650; }
}`,
      },
      {
        id: "testing-contrast",
        title: "Testing Contrast: Tools and Workflow",
        paragraphs: [
          "RegLayer tests both WCAG 2.x ratios (for current compliance) and APCA Lc values (for future-proofing). Here's a practical testing workflow:",
          "Step 1: Run automated scan — catches obvious failures (sub-3:1 contrast, invisible text). Step 2: Check dark mode separately — many sites only test light mode. Step 3: Test with browser zoom at 200% — text may become unreadable at different sizes. Step 4: Check non-text contrast — borders, icons, and focus indicators need 3:1 minimum.",
        ],
      },
    ],
  },

  "ada-title-iii-2026-update": {
    title: "ADA Title III Digital Lawsuits in 2026: A Data-Driven Analysis",
    excerpt: "Filing trends, plaintiff strategies, settlement amounts, and how proactive scanning changes your legal risk profile.",
    category: "Legal",
    categoryColor: "bg-amber-50 dark:bg-amber-950/40 text-amber-600 dark:text-amber-400",
    readTime: "14 min read",
    date: "May 20, 2026",
    related: ["eaa-compliance-deadline", "remediation-roi-calculator"],
    cta: { title: "Reduce your litigation risk", body: "RegLayer generates compliance evidence that demonstrates proactive remediation — the strongest legal defense." },
    sections: [
      {
        id: "filing-trends",
        title: "2025-2026 Filing Trends",
        paragraphs: [
          "Digital accessibility lawsuits under ADA Title III continue to rise. In 2025, 4,605 federal lawsuits were filed — a 12% increase over 2024. More significantly, demand letters (pre-litigation) have exploded to an estimated 250,000+ annually, as plaintiffs' firms increasingly use automated tools to identify targets.",
          "The shift: lawsuits are no longer concentrated in New York and California. Florida, Texas, and Pennsylvania have seen 40%+ increases. Federal courts in these jurisdictions are accepting standing arguments that were previously rejected.",
        ],
        stats: [
          { value: "4,605", label: "Federal Suits (2025)", color: "text-red-600 dark:text-red-400", labelColor: "text-red-700 dark:text-red-300", bg: "bg-red-50 dark:bg-red-950/30", border: "border-red-100 dark:border-red-800/30" },
          { value: "250k+", label: "Demand Letters", color: "text-amber-600 dark:text-amber-400", labelColor: "text-amber-700 dark:text-amber-300", bg: "bg-amber-50 dark:bg-amber-950/30", border: "border-amber-100 dark:border-amber-800/30" },
          { value: "$35k", label: "Avg Settlement", color: "text-blue-600 dark:text-blue-400", labelColor: "text-blue-700 dark:text-blue-300", bg: "bg-blue-50 dark:bg-blue-950/30", border: "border-blue-100 dark:border-blue-800/30" },
        ],
      },
      {
        id: "plaintiff-strategy",
        title: "How Plaintiffs Target Companies",
        paragraphs: [
          "Modern accessibility plaintiffs use automated scanning tools — often the same ones we use for compliance — to identify low-hanging fruit. The targeting algorithm: scan thousands of sites, rank by violation severity and company revenue, file against the ones most likely to settle quickly.",
          "What triggers targeting: missing alt text on product images (e-commerce), inaccessible checkout flows, missing form labels, keyboard traps in modals, and video without captions. These are all issues RegLayer detects in under 30 seconds.",
        ],
        list: [
          "E-commerce sites with inaccessible product images — #1 target",
          "Financial services with inaccessible forms — high settlement value",
          "Healthcare portals with keyboard traps — DOJ attention",
          "Restaurant websites without alt text — high-volume, low-cost filings",
          "SaaS login pages with CAPTCHA — accessibility authentication failures",
        ],
      },
      {
        id: "defense-strategy",
        title: "The Proactive Compliance Defense",
        paragraphs: [
          "The strongest legal defense is evidence of proactive remediation. Courts have consistently ruled favorably for defendants who can demonstrate: they identified accessibility issues before being sued, they had a documented remediation plan, they were actively making progress, and they had accessibility monitoring in place.",
          "RegLayer generates timestamped compliance reports that serve as legal evidence. When you can show 'we identified 47 issues on March 1, fixed 35 by April 1, and have a plan for the remaining 12' — that's the narrative that wins in court or settlement negotiations.",
        ],
        callout: { title: "Key legal principle", body: "Courts apply a 'reasonable progress' standard. You don't need perfection — you need evidence of systematic, ongoing improvement. Timestamped scan reports are your strongest asset." },
      },
      {
        id: "roi",
        title: "The Math: Prevention vs. Settlement",
        paragraphs: [
          "Average ADA digital accessibility settlement: $35,000 (plus $15,000-$50,000 in legal fees). Average cost to fix critical violations proactively: $2,000-$8,000 in developer time. The ROI of proactive scanning is 5-10x.",
          "But the real cost of litigation isn't the settlement — it's the injunction. Courts routinely require ongoing third-party monitoring ($20,000-$50,000/year), staff training ($5,000-$15,000), and annual reporting. A $35,000 settlement becomes a $100,000+ annual obligation.",
        ],
      },
    ],
  },

  "automated-vs-manual-testing": {
    title: "Automated vs. Manual Accessibility Testing: The 70/30 Framework",
    excerpt: "Automated tools catch ~57% of WCAG issues. Here's a systematic approach to cover the remaining 43% without burning QA budgets.",
    category: "Technical",
    categoryColor: "bg-emerald-50 dark:bg-emerald-950/40 text-emerald-600 dark:text-emerald-400",
    readTime: "11 min read",
    date: "May 15, 2026",
    related: ["aria-patterns-that-break", "wcag-2-2-whats-new"],
    sections: [
      {
        id: "coverage-reality",
        title: "The Coverage Reality",
        paragraphs: [
          "The accessibility testing industry has a dirty secret: no automated tool catches more than 57% of WCAG violations. The commonly cited 'tools catch 30%' figure is outdated — modern scanners like RegLayer, axe-core, and WAVE have improved significantly. But ~43% of issues require human judgment.",
          "What automation catches well: color contrast, missing alt text, missing form labels, duplicate IDs, heading order, ARIA attribute validation, link text, and language attributes. What it can't: meaningful alt text quality, logical reading order, keyboard operability edge cases, and cognitive load.",
        ],
      },
      {
        id: "framework",
        title: "The 70/30 Framework",
        paragraphs: [
          "Our recommended approach: 70% automated (continuous, every deploy) + 30% manual (quarterly, focused). The automated layer catches regressions instantly. The manual layer catches the nuanced issues that need human perception.",
          "The key insight: don't try to manually test everything. Focus manual testing on: user flows (can a screen reader user complete checkout?), dynamic content (do live regions announce correctly?), cognitive patterns (is the information architecture logical?), and custom widgets (do complex interactions work with assistive tech?).",
        ],
        list: [
          "Automated (70%): Run on every PR, blocks merge if critical violations found",
          "Screen reader testing (15%): Monthly testing with NVDA + VoiceOver on key user flows",
          "Keyboard testing (10%): Quarterly audit of all interactive components",
          "Cognitive review (5%): Annual review of information architecture and content clarity",
        ],
      },
      {
        id: "ci-integration",
        title: "CI/CD Integration Pattern",
        paragraphs: [
          "The most effective pattern: run accessibility tests in your CI pipeline like any other test. Block PRs that introduce critical/serious violations. Warn on moderate violations. Track minor violations as tech debt.",
        ],
        code: `# .github/workflows/a11y.yml
name: Accessibility Check
on: [pull_request]
jobs:
  scan:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - run: npm ci && npm run build
      - name: RegLayer Scan
        run: |
          npx reglayer-cli scan --url http://localhost:3000 \\
            --fail-on critical,serious \\
            --report-format json \\
            --output a11y-report.json
      - name: Upload Report
        if: always()
        uses: actions/upload-artifact@v4
        with:
          name: a11y-report
          path: a11y-report.json`,
      },
    ],
  },

  "keyboard-navigation-deep-dive": {
    title: "Keyboard Navigation Done Right: Focus Management in SPAs",
    excerpt: "Client-side routing breaks focus. Here's how to implement proper focus management in React, Next.js, and Vue applications.",
    category: "Technical",
    categoryColor: "bg-emerald-50 dark:bg-emerald-950/40 text-emerald-600 dark:text-emerald-400",
    readTime: "13 min read",
    date: "May 10, 2026",
    related: ["aria-patterns-that-break", "wcag-2-2-whats-new"],
    cta: { title: "Detect keyboard traps automatically", body: "RegLayer's scanner identifies focus traps, missing skip links, and broken tab order in seconds." },
    sections: [
      {
        id: "the-problem",
        title: "Why Client-Side Routing Breaks Keyboard Navigation",
        paragraphs: [
          "In traditional server-rendered pages, every navigation resets focus to the top of the document. The browser announces the new page title, and keyboard users start fresh. Client-side routing (React Router, Next.js App Router, Vue Router) breaks this contract completely.",
          "When you navigate in an SPA, the URL changes, content swaps, but focus stays wherever it was — often on a now-invisible element. Screen readers don't announce the new page. Keyboard users are lost in a void. This is the #1 keyboard accessibility issue we detect, present in 67% of SPAs scanned.",
        ],
      },
      {
        id: "focus-management-patterns",
        title: "Three Focus Management Patterns",
        paragraphs: [
          "There are three valid approaches to managing focus on route change. Each has tradeoffs depending on your app's structure and user expectations.",
          "Pattern 1 — Focus the main heading: After navigation, programmatically focus the <h1> of the new page. This announces the page title to screen readers and positions keyboard users at the start of content. Add tabindex='-1' to the heading so it can receive focus without being in the tab order.",
          "Pattern 2 — Focus the main content region: Move focus to the <main> element. This skips the navigation entirely (like a skip link) and places users at the content boundary. Works well for apps with persistent navigation.",
          "Pattern 3 — Reset to document top: Move focus to a visually hidden element at the very top of the page, before the skip link. This mimics full-page navigation behavior. Best for document-heavy sites where users expect to start from scratch.",
        ],
        code: `// Pattern 1: Focus heading on route change (Next.js App Router)
'use client';
import { usePathname } from 'next/navigation';
import { useEffect, useRef } from 'react';

export function FocusManager() {
  const pathname = usePathname();
  const isFirstRender = useRef(true);

  useEffect(() => {
    if (isFirstRender.current) {
      isFirstRender.current = false;
      return;
    }
    // Wait for DOM to update
    requestAnimationFrame(() => {
      const h1 = document.querySelector('h1');
      if (h1) {
        h1.setAttribute('tabindex', '-1');
        h1.focus({ preventScroll: false });
      }
    });
  }, [pathname]);

  return null;
}`,
      },
      {
        id: "skip-links",
        title: "Skip Links That Actually Work",
        paragraphs: [
          "Skip links are the most basic keyboard accessibility feature — and the most commonly broken. The pattern is simple: a visually hidden link at the top of the page that becomes visible on focus and jumps to main content. But many implementations fail because they don't account for client-side routing.",
          "Common failures: the target element doesn't have tabindex='-1' (so focus doesn't actually move in some browsers), the skip link disappears after first use (React re-renders), or the link targets an ID that doesn't exist on some pages.",
        ],
        code: `// Skip link component that works with client-side routing
export function SkipLink() {
  return (
    <a
      href="#main-content"
      className="sr-only focus:not-sr-only focus:fixed focus:top-4 focus:left-4 focus:z-[9999] focus:rounded-lg focus:bg-accent focus:px-4 focus:py-2 focus:text-white focus:shadow-lg"
      onClick={(e) => {
        e.preventDefault();
        const main = document.getElementById('main-content');
        if (main) {
          main.setAttribute('tabindex', '-1');
          main.focus();
          main.removeAttribute('tabindex');
        }
      }}
    >
      Skip to main content
    </a>
  );
}`,
      },
      {
        id: "focus-traps",
        title: "Modal Focus Traps: The Right Way",
        paragraphs: [
          "When a modal opens, focus must be trapped inside it — Tab and Shift+Tab should cycle through focusable elements within the modal only. When it closes, focus must return to the trigger element. Getting this wrong creates keyboard traps (WCAG 2.1.2 failure).",
          "The native <dialog> element handles this automatically with showModal(). If you're building custom modals, you need: focus the first focusable element on open, trap Tab/Shift+Tab within the modal, close on Escape, and return focus to the trigger on close.",
        ],
        list: [
          "Use native <dialog> with showModal() whenever possible — it handles focus trapping natively",
          "For custom modals: focus first focusable element on open (not the close button)",
          "Trap focus using a sentinel element or by intercepting Tab on the last/first elements",
          "Close on Escape key — this is a WCAG requirement (2.1.2 No Keyboard Trap)",
          "Store the trigger element reference and return focus on close",
          "Set aria-modal='true' and role='dialog' with aria-labelledby pointing to the title",
        ],
      },
      {
        id: "testing-keyboard",
        title: "Testing Keyboard Navigation Systematically",
        paragraphs: [
          "The fastest keyboard test: put your mouse in a drawer and try to complete your app's critical user flows using only the keyboard. If you get stuck, your users do too.",
          "Key checkpoints: Can you reach every interactive element with Tab? Is focus always visible? Does Escape close overlays? Can you activate buttons with Enter and Space? Do dropdowns work with Arrow keys? After closing a modal, does focus return to where you were?",
        ],
        list: [
          "Tab through every page — verify focus indicator is always visible",
          "Enter every modal/dropdown — verify you can escape and focus returns",
          "Navigate to a new page via keyboard — verify focus moves to meaningful content",
          "Complete the primary user flow (e.g., start a scan) using only keyboard",
          "Test with screen reader (VoiceOver: Cmd+F5 on Mac) — verify route changes are announced",
        ],
      },
    ],
  },

  "vpat-documentation-guide": {
    title: "Writing a VPAT That Actually Helps: A Technical Author's Guide",
    excerpt: "Most VPATs are useless marketing documents. Here's how to create one that procurement teams trust and engineers reference.",
    category: "Section 508",
    categoryColor: "bg-rose-50 dark:bg-rose-950/40 text-rose-600 dark:text-rose-400",
    readTime: "9 min read",
    date: "May 5, 2026",
    related: ["ada-title-iii-2026-update", "automated-vs-manual-testing"],
    cta: { title: "Generate VPAT evidence automatically", body: "RegLayer maps scan results to VPAT criteria. Export compliance evidence per success criterion." },
    sections: [
      {
        id: "what-is-vpat",
        title: "What Is a VPAT and Who Reads It?",
        paragraphs: [
          "A VPAT (Voluntary Product Accessibility Template) is a standardized document that reports how well a product conforms to accessibility standards. Despite the name, there's nothing voluntary about it for government contracts — Section 508 procurement officers require VPATs before purchasing any ICT product.",
          "Your VPAT has three audiences: procurement officers (checking boxes), accessibility SMEs (evaluating claims), and legal teams (assessing risk). A good VPAT serves all three by being honest about non-conformances while demonstrating a clear remediation path.",
        ],
      },
      {
        id: "common-mistakes",
        title: "The Five Most Common VPAT Mistakes",
        paragraphs: [
          "After reviewing 200+ VPATs for federal procurement, these failures appear repeatedly:",
        ],
        list: [
          "Blanket 'Supports' with no remarks — procurement teams immediately distrust VPATs where every criterion says 'Supports' with empty remarks columns. Real products have partial conformances.",
          "Testing only the login page — vendors test one page and extrapolate. Procurement officers test the whole product. Your VPAT will be contradicted in evaluation.",
          "Confusing 'Does Not Support' with 'Not Applicable' — if a criterion doesn't apply to your product (e.g., 'captions' for a text-only tool), mark it N/A. 'Does Not Support' means it applies and you fail.",
          "No remediation timeline — for 'Partially Supports' or 'Does Not Support' items, include when you plan to fix them. '2.1.2 Keyboard trap in date picker — fix scheduled for Q3 2026' builds trust.",
          "Outdated version testing — if your VPAT references v3.2 but you're shipping v4.1, it's useless. Update VPATs with every major release.",
        ],
      },
      {
        id: "structure",
        title: "VPAT Structure: ITI Format 2.5",
        paragraphs: [
          "The current standard format is VPAT 2.5, published by the Information Technology Industry Council (ITI). It has four reporting chapters depending on which standards apply to your product:",
          "Chapter 1: WCAG 2.x (Level A, AA, AAA). Chapter 2: Revised Section 508 (for US federal). Chapter 3: EN 301 549 (for EU/EAA). Chapter 4: Platform-specific (iOS, Android, desktop apps). Most web applications need Chapters 1 and 2 at minimum, plus Chapter 3 if selling to EU public sector.",
        ],
        callout: { title: "Pro tip", body: "Don't fill all four chapters if they don't apply. A focused, accurate Chapter 1+2 VPAT is far more credible than a blanket four-chapter document with copy-pasted responses." },
      },
      {
        id: "writing-remarks",
        title: "Writing Effective Remarks",
        paragraphs: [
          "The 'Remarks and Explanations' column is where credibility lives or dies. Good remarks are specific, honest, and actionable. Bad remarks are vague or defensive.",
          "Bad: 'The product supports this criterion.' — This says nothing. Good: 'All form inputs have programmatically associated labels via <label for> or aria-labelledby. Custom date picker uses aria-label. Tested with NVDA 2024.2 and Chrome 124.'",
          "For partial conformances, include: what works, what doesn't, which pages/components are affected, and remediation timeline. Example: 'Partially Supports. Main navigation and all form pages conform. Data visualization charts lack programmatic text alternatives — remediation planned for v5.2 (September 2026).'",
        ],
      },
      {
        id: "automation",
        title: "Automating VPAT Evidence Collection",
        paragraphs: [
          "The biggest time sink in VPAT creation is evidence collection — testing each criterion against your product and documenting the result. RegLayer automates this for testable criteria (roughly 60% of WCAG SC).",
          "Workflow: Run a full-site scan → export results grouped by WCAG criterion → each criterion gets a conformance level (Supports/Partially/Does Not Support) based on violation count and severity → paste into VPAT template with specific page URLs as evidence.",
          "For the remaining 40% requiring manual testing (meaningful alt text, logical reading order, etc.), use the scan results as a starting point — they tell you which pages to manually test first based on automated issue density.",
        ],
      },
    ],
  },

  "remediation-roi-calculator": {
    title: "Quantifying Remediation ROI: Cost of Non-Compliance vs. Fixing",
    excerpt: "Average ADA settlement is $35,000. Average critical fix takes 4 hours. The math is overwhelming — here are the numbers.",
    category: "Business",
    categoryColor: "bg-amber-50 dark:bg-amber-950/40 text-amber-600 dark:text-amber-400",
    readTime: "7 min read",
    date: "April 28, 2026",
    related: ["ada-title-iii-2026-update", "eaa-compliance-deadline"],
    cta: { title: "Calculate your compliance ROI", body: "RegLayer estimates remediation cost per violation based on complexity. See your total fix investment." },
    sections: [
      {
        id: "cost-of-inaction",
        title: "The True Cost of Non-Compliance",
        paragraphs: [
          "Most organizations underestimate the total cost of accessibility non-compliance because they only consider direct legal exposure. The real cost includes: litigation (settlements + legal fees), injunctive relief (ongoing monitoring mandates), lost revenue (failed procurements, market exclusion), reputation damage, and technical debt accumulation.",
          "By the numbers: Average ADA digital accessibility settlement is $35,000. Average legal defense cost (even if you win) is $50,000-$150,000. Average court-mandated monitoring: $25,000-$50,000/year for 3 years. One lawsuit can easily cost $200,000+ over 3 years.",
        ],
        stats: [
          { value: "$35k", label: "Avg Settlement", color: "text-red-600 dark:text-red-400", labelColor: "text-red-700 dark:text-red-300", bg: "bg-red-50 dark:bg-red-950/30", border: "border-red-100 dark:border-red-800/30" },
          { value: "$150k", label: "Legal Defense", color: "text-amber-600 dark:text-amber-400", labelColor: "text-amber-700 dark:text-amber-300", bg: "bg-amber-50 dark:bg-amber-950/30", border: "border-amber-100 dark:border-amber-800/30" },
          { value: "$75k/yr", label: "Court Monitoring", color: "text-blue-600 dark:text-blue-400", labelColor: "text-blue-700 dark:text-blue-300", bg: "bg-blue-50 dark:bg-blue-950/30", border: "border-blue-100 dark:border-blue-800/30" },
        ],
      },
      {
        id: "fix-costs",
        title: "What Remediation Actually Costs",
        paragraphs: [
          "Based on data from 500+ remediation projects tracked through RegLayer, here are realistic fix costs by violation type (assuming a mid-level developer at $75/hour):",
          "Critical violations (color contrast, missing alt text, missing form labels): 15-30 minutes per instance. Cost: $19-$38 each. These are find-and-replace fixes with clear patterns.",
          "Serious violations (keyboard traps, missing ARIA states, focus management): 1-4 hours per component. Cost: $75-$300 each. Requires understanding the component's interaction model.",
          "Moderate violations (heading hierarchy, link purpose, target size): 30-60 minutes per page/component. Cost: $38-$75 each. Often requires small HTML restructuring.",
          "The key insight: 80% of violations fall into the 'critical' category and cost under $40 each to fix. The expensive 20% (custom widget accessibility, complex form flows) is where architectural decisions matter.",
        ],
      },
      {
        id: "roi-calculation",
        title: "The ROI Formula",
        paragraphs: [
          "Here's the simple ROI calculation for proactive accessibility remediation:",
          "Cost of proactive fix: (Violation count × Average fix time × Developer hourly rate) + Tooling cost. For a typical site with 200 violations: (200 × 0.75hr × $75) + $200/mo tooling = $11,450 one-time + $2,400/year ongoing.",
          "Cost of reactive response (after lawsuit): $35,000 settlement + $75,000 legal fees + $25,000/year monitoring × 3 years + rush remediation at 2× cost = $222,900 over 3 years.",
          "ROI: ($222,900 - $18,650) / $18,650 = 11.9× return. For every $1 spent on proactive accessibility, you avoid $12 in reactive costs. This doesn't even account for market access (EAA compliance opens EU market) or failed procurements (Section 508 requirements).",
        ],
        callout: { title: "The real ROI is higher", body: "This calculation only covers one lawsuit. Serial plaintiffs target the same company repeatedly if violations persist. And it ignores revenue from accessible design (larger market, better SEO, mobile usability)." },
      },
      {
        id: "prioritization",
        title: "Prioritizing Fixes for Maximum ROI",
        paragraphs: [
          "Not all fixes are equal. Prioritize by: (1) Legal risk — violations that plaintiffs target first (images, forms, keyboard), (2) User impact — violations affecting the most users on critical paths, (3) Fix efficiency — violations that can be batch-fixed (e.g., global CSS change fixes all contrast issues at once).",
          "The 'batch fix' strategy is key to ROI: one CSS rule change (min-height: 24px on interactive elements) can fix hundreds of Target Size violations simultaneously. One component library update (adding aria-labels to Icon buttons) fixes every instance across the app.",
        ],
        list: [
          "Week 1: Global CSS fixes — contrast, target size, focus indicators (batch fix 40-60% of violations)",
          "Week 2: Form accessibility — labels, error messages, required indicators (high lawsuit risk)",
          "Week 3: Image alt text — product images, icons, decorative image cleanup",
          "Week 4: Keyboard access — modal focus traps, skip links, dropdown navigation",
          "Ongoing: Component library updates, new feature reviews, regression monitoring",
        ],
      },
    ],
  },

  "cognitive-accessibility-2-2": {
    title: "Cognitive Accessibility in WCAG 2.2: Beyond Perceivable and Operable",
    excerpt: "New criteria for focus appearance, dragging movements, and consistent help. How to implement without breaking existing UX.",
    category: "WCAG",
    categoryColor: "bg-blue-50 dark:bg-blue-950/40 text-blue-600 dark:text-blue-400",
    readTime: "12 min read",
    date: "April 22, 2026",
    related: ["wcag-2-2-whats-new", "aria-patterns-that-break"],
    cta: { title: "Test cognitive accessibility criteria", body: "RegLayer detects Consistent Help, Redundant Entry, and Accessible Authentication violations across your full site." },
    sections: [
      {
        id: "cognitive-gap",
        title: "The Cognitive Accessibility Gap",
        paragraphs: [
          "WCAG has historically prioritized sensory disabilities (vision, hearing) and motor disabilities over cognitive ones. Users with cognitive and learning disabilities represent the largest disability group — an estimated 15-20% of the global population — yet received limited attention in WCAG 2.0 and 2.1.",
          "WCAG 2.2 begins to address this gap with criteria specifically targeting cognitive load, memory requirements, and consistency. Three new criteria directly serve users with cognitive disabilities: Consistent Help (3.2.6), Redundant Entry (3.3.7), and Accessible Authentication (3.3.8).",
        ],
      },
      {
        id: "consistent-help",
        title: "Consistent Help (3.2.6) — Level A",
        paragraphs: [
          "Users with cognitive disabilities rely on consistent patterns to navigate. If help is available on some pages but not others, or moves between the header and footer unpredictably, users who need it most can't find it.",
          "The requirement: if help mechanisms exist (contact info, chat widgets, FAQ links, phone numbers), they must appear in the same relative order on every page. The help doesn't need to be on every page — but wherever it appears, it must be in the same position within the page structure.",
        ],
        code: `// Good: Help mechanism in consistent position
// Layout component ensures help is always in the same spot
function AppLayout({ children }) {
  return (
    <div>
      <Header /> {/* Nav always has Help link in position 5 */}
      <main>{children}</main>
      <Footer>
        {/* Help contact always: Phone → Email → Chat → FAQ */}
        <HelpSection>
          <PhoneNumber />
          <EmailLink />
          <ChatWidget />
          <FAQLink />
        </HelpSection>
      </Footer>
    </div>
  );
}`,
        callout: { title: "Common failure", body: "Chat widgets that appear on product pages but not checkout. Help phone numbers in the header on desktop but footer on mobile. FAQ links that move between nav and footer depending on page template." },
      },
      {
        id: "redundant-entry",
        title: "Redundant Entry (3.3.7) — Level A",
        paragraphs: [
          "Users with cognitive disabilities struggle with short-term memory. Re-entering information they've already provided (address on shipping page, then again on billing; email during signup, then again on the next step) creates unnecessary cognitive burden and increases error rates.",
          "The requirement: information previously entered by or provided to the user that is required on the same or subsequent steps must be either auto-populated or available for the user to select. Exceptions: re-entering a password for security confirmation, and when the previously entered information is no longer valid.",
        ],
        list: [
          "Auto-populate billing address from shipping address (with option to change)",
          "Pre-fill email in confirmation steps — don't ask users to re-type it",
          "Use session storage to persist form data across multi-step flows",
          "Provide 'Same as above' checkboxes for repeated information groups",
          "Use autocomplete attributes to leverage browser-stored data",
          "Never require re-entering information that's visible elsewhere on the page",
        ],
      },
      {
        id: "accessible-auth",
        title: "Accessible Authentication (3.3.8) — Level AA",
        paragraphs: [
          "Cognitive function tests — CAPTCHAs, math puzzles, remembering passwords, transcribing codes — create barriers for users with cognitive disabilities. WCAG 2.2 requires that authentication flows don't rely on cognitive tests unless alternatives are provided.",
          "What passes: paste-able password fields (users can paste from password managers), passkeys/biometrics, magic links sent to email, OAuth/SSO with identity providers, and any method that doesn't require memorization, transcription, or puzzle-solving.",
          "What fails: CAPTCHAs without audio/accessible alternatives, password fields that block paste (why do sites still do this?), SMS codes that must be memorized and typed (clipboard access helps), and 'select all images with traffic lights' challenges.",
        ],
        code: `// Good: Allow paste, support password managers, offer alternatives
<input
  type="password"
  autoComplete="current-password"  // Enables password manager
  // Do NOT add onPaste={(e) => e.preventDefault()} 
/>

// Good: Passkey / biometric option
<button onClick={startWebAuthn}>
  Sign in with passkey
</button>

// Good: Magic link alternative
<button onClick={sendMagicLink}>
  Email me a login link
</button>`,
      },
      {
        id: "implementation",
        title: "Implementing Without Breaking UX",
        paragraphs: [
          "The good news: cognitive accessibility improvements almost always improve UX for everyone. Consistent help placement helps all users find support. Pre-populated forms save everyone time. Authentication without CAPTCHAs increases conversion rates.",
          "Practical implementation steps: 1) Audit your help mechanisms — are they in the same position on every page template? If not, standardize in your layout component. 2) Map your multi-step forms — identify every field that repeats between steps and add auto-population. 3) Check your authentication flow — can a user with a password manager log in without memorizing anything? Remove paste blockers and add passkey support.",
        ],
        list: [
          "Add help mechanisms to your global layout (not individual pages) — guarantees consistency",
          "Use React Context or similar to pass form data between multi-step components",
          "Add autocomplete attributes to ALL form fields — browsers do the memory work",
          "Implement WebAuthn for passwordless authentication (navigator.credentials API)",
          "Remove all onPaste preventDefault() handlers from input fields immediately",
          "Test with a 'fresh brain' — can a user who forgot everything still complete the flow?",
        ],
      },
    ],
  },
};
