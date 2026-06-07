/**
 * RegLayer — Learning Paths Engine
 *
 * WHY: Developers need structured guidance to fix their weakest areas.
 *      Generic docs overwhelm — personalized paths convert.
 *
 * WHAT: Maps violation categories to learning modules. Each module has:
 *   - Lessons with theory + code examples
 *   - Difficulty level
 *   - Estimated time
 *   - WCAG criteria covered
 *
 * HOW: Analyzes user's category scores from SkillProfile, recommends
 *      paths sorted by weakness. Each lesson has actionable content
 *      a developer can apply immediately.
 */

import type { SkillCategory, CategoryScore } from "./engine";

// ─────────────── Types ───────────────

export interface Lesson {
  id: string;
  title: string;
  description: string;
  difficulty: "beginner" | "intermediate" | "advanced";
  estimatedMinutes: number;
  wcagCriteria: string[];
  content: LessonContent;
}

export interface LessonContent {
  theory: string;
  badExample: CodeExample;
  goodExample: CodeExample;
  tips: string[];
  testYourself: string;
}

export interface CodeExample {
  code: string;
  language: string;
  explanation: string;
}

export interface LearningModule {
  id: string;
  category: SkillCategory;
  title: string;
  description: string;
  lessons: Lesson[];
}

export interface PersonalizedPath {
  category: SkillCategory;
  module: LearningModule;
  priority: number; // 1 = highest priority (weakest area)
  reason: string;
  categoryScore: number;
}

// ─────────────── Learning Modules ───────────────

export const LEARNING_MODULES: LearningModule[] = [
  // ─── Color & Contrast ───
  {
    id: "color-basics",
    category: "color",
    title: "Color & Contrast Fundamentals",
    description: "Ensure all users can read your content regardless of vision ability",
    lessons: [
      {
        id: "color-1",
        title: "Understanding Contrast Ratios",
        description: "What WCAG contrast ratios mean and how to check them",
        difficulty: "beginner",
        estimatedMinutes: 5,
        wcagCriteria: ["1.4.3", "1.4.6"],
        content: {
          theory: `Color contrast is the difference in luminance between foreground text and its background. WCAG 2.1 requires:\n\n- **AA standard**: 4.5:1 for normal text, 3:1 for large text (18px+ bold or 24px+)\n- **AAA standard**: 7:1 for normal text, 4.5:1 for large text\n\nLow contrast makes text unreadable for users with low vision, color blindness, or anyone in bright sunlight.`,
          badExample: {
            code: `<p style="color: #999; background: #fff;">\n  This light gray text on white fails contrast.\n</p>`,
            language: "html",
            explanation: "Gray (#999) on white (#fff) = 2.85:1 ratio — fails AA",
          },
          goodExample: {
            code: `<p style="color: #595959; background: #fff;">\n  This darker gray text on white passes AA.\n</p>`,
            language: "html",
            explanation: "Dark gray (#595959) on white (#fff) = 7:1 ratio — passes AAA",
          },
          tips: [
            "Use browser DevTools (Inspect > Color picker) to check contrast live",
            "Don't rely on brand colors alone — verify every combination",
            "Test with both light and dark mode if your app supports them",
            "Large text (18px bold+) has a lower threshold (3:1)",
          ],
          testYourself: "Open your site in DevTools, inspect body text — what's the contrast ratio? Does it pass AA (4.5:1)?",
        },
      },
      {
        id: "color-2",
        title: "Don't Rely on Color Alone",
        description: "Conveying information through means beyond just color",
        difficulty: "beginner",
        estimatedMinutes: 5,
        wcagCriteria: ["1.4.1"],
        content: {
          theory: `About 8% of men and 0.5% of women have some form of color blindness. If you use color as the ONLY way to convey meaning (like red = error, green = success), these users miss critical information.\n\nAlways pair color with another indicator: icons, text labels, patterns, or underlines.`,
          badExample: {
            code: `{/* Only color indicates error */}\n<input className={hasError ? "border-red-500" : "border-gray-300"} />\n<span className="text-red-500">{error}</span>`,
            language: "tsx",
            explanation: "A color-blind user might not see the red border or text",
          },
          goodExample: {
            code: `{/* Color + icon + text */}\n<input\n  className={hasError ? "border-red-500" : "border-gray-300"}\n  aria-invalid={hasError}\n  aria-describedby={hasError ? "error-msg" : undefined}\n/>\n{hasError && (\n  <span id="error-msg" className="text-red-500 flex items-center gap-1">\n    <AlertCircle className="h-4 w-4" /> {error}\n  </span>\n)}`,
            language: "tsx",
            explanation: "Icon + text + aria-invalid provides multiple cues",
          },
          tips: [
            "Use icons alongside status colors (✓ for success, ✕ for error)",
            "Add text labels to colored badges/tags",
            "Underline links — don't rely only on color to distinguish them from text",
            "Test your UI in grayscale to verify meaning is preserved",
          ],
          testYourself: "Find a status indicator in your app. Can you tell its meaning with a grayscale filter applied?",
        },
      },
    ],
  },

  // ─── Page Structure ───
  {
    id: "structure-basics",
    category: "structure",
    title: "Semantic Page Structure",
    description: "Build pages that screen readers and search engines can navigate",
    lessons: [
      {
        id: "structure-1",
        title: "Heading Hierarchy",
        description: "Using headings correctly for document outline",
        difficulty: "beginner",
        estimatedMinutes: 5,
        wcagCriteria: ["1.3.1", "2.4.6"],
        content: {
          theory: `Headings (h1–h6) create a document outline that screen reader users navigate by. They're like a table of contents. Rules:\n\n- Every page needs exactly one h1\n- Don't skip levels (h1 → h3 is wrong)\n- Use headings for structure, not just visual size\n- Screen reader users jump between headings to scan content quickly`,
          badExample: {
            code: `<div class="text-2xl font-bold">Dashboard</div>\n<div class="text-lg font-semibold">Recent Scans</div>\n<div class="text-md font-medium">Scan Details</div>`,
            language: "html",
            explanation: "Using divs with styles — no semantic structure",
          },
          goodExample: {
            code: `<h1>Dashboard</h1>\n<section aria-labelledby="recent-heading">\n  <h2 id="recent-heading">Recent Scans</h2>\n  <article>\n    <h3>Scan Details</h3>\n  </article>\n</section>`,
            language: "html",
            explanation: "Proper heading hierarchy with landmarks",
          },
          tips: [
            "Use one h1 per page — it should describe what the page is",
            "In component libraries, pass heading level as a prop for flexibility",
            "Screen reader users press 'H' to jump between headings — make them meaningful",
            "Use Tailwind's text-xl etc. for visual sizing independently of heading level",
          ],
          testYourself: "Install the HeadingsMap browser extension. Does your page show a clean, unbroken hierarchy?",
        },
      },
      {
        id: "structure-2",
        title: "Landmarks & Regions",
        description: "Using HTML5 landmarks for page navigation",
        difficulty: "beginner",
        estimatedMinutes: 5,
        wcagCriteria: ["1.3.1", "2.4.1"],
        content: {
          theory: `HTML5 landmarks let screen readers jump directly to major page sections:\n\n- \`<header>\` / \`role="banner"\` — site header\n- \`<nav>\` / \`role="navigation"\` — navigation links\n- \`<main>\` / \`role="main"\` — primary content\n- \`<aside>\` / \`role="complementary"\` — sidebar\n- \`<footer>\` / \`role="contentinfo"\` — site footer\n\nEvery page MUST have at least one \`<main>\` landmark.`,
          badExample: {
            code: `<div class="header">...</div>\n<div class="sidebar">...</div>\n<div class="content">...</div>\n<div class="footer">...</div>`,
            language: "html",
            explanation: "All divs — screen readers see no structure",
          },
          goodExample: {
            code: `<header>...</header>\n<nav aria-label="Main navigation">...</nav>\n<main>...</main>\n<aside aria-label="Sidebar">...</aside>\n<footer>...</footer>`,
            language: "html",
            explanation: "Semantic elements = automatic landmark roles",
          },
          tips: [
            "Use aria-label on nav elements when you have multiple (<nav aria-label='Breadcrumb'>)",
            "Don't nest <main> inside another landmark",
            "One <main> per page — period",
            "Use <section> with aria-labelledby for sub-regions within main",
          ],
          testYourself: "Open VoiceOver (Cmd+F5 on Mac) and use the landmarks rotor. Can you jump to all major sections?",
        },
      },
    ],
  },

  // ─── Forms ───
  {
    id: "forms-basics",
    category: "forms",
    title: "Accessible Forms",
    description: "Make every form usable by all — labels, errors, and keyboard",
    lessons: [
      {
        id: "forms-1",
        title: "Labels & Input Association",
        description: "Every input needs a programmatic label",
        difficulty: "beginner",
        estimatedMinutes: 5,
        wcagCriteria: ["1.3.1", "3.3.2", "4.1.2"],
        content: {
          theory: `Every form input MUST have a label that is programmatically associated with it. Without this, screen readers just say "edit text" with no context.\n\nThree ways to label:\n1. \`<label for="id">\` (preferred)\n2. \`aria-label\` attribute\n3. \`aria-labelledby\` pointing to another element\n\nPlaceholder text is NOT a label — it disappears on focus.`,
          badExample: {
            code: `<input type="email" placeholder="Enter your email" />\n<input type="password" placeholder="Password" />`,
            language: "html",
            explanation: "Placeholder disappears on focus, not announced as label",
          },
          goodExample: {
            code: `<div>\n  <label htmlFor="email">Email address</label>\n  <input id="email" type="email" placeholder="you@example.com" />\n</div>\n<div>\n  <label htmlFor="password">Password</label>\n  <input id="password" type="password" />\n</div>`,
            language: "html",
            explanation: "Visible labels that are programmatically linked via for/id",
          },
          tips: [
            "Always use visible labels — they help everyone, not just screen reader users",
            "If you must hide labels visually, use sr-only class (not display:none)",
            "Group related fields with <fieldset> and <legend>",
            "Use aria-describedby for hint text (e.g., password requirements)",
          ],
          testYourself: "Click on a label in your form. Does it focus the associated input? If not, the association is broken.",
        },
      },
      {
        id: "forms-2",
        title: "Error Handling & Validation",
        description: "Communicate errors clearly to all users",
        difficulty: "intermediate",
        estimatedMinutes: 8,
        wcagCriteria: ["3.3.1", "3.3.3", "4.1.3"],
        content: {
          theory: `When form validation fails, users need to:\n1. Know there IS an error (announced by screen reader)\n2. Find WHERE the error is\n3. Understand HOW to fix it\n\nUse \`aria-invalid="true"\` on the field, \`aria-describedby\` pointing to the error message, and consider an error summary at the top with links to each field.`,
          badExample: {
            code: `<input type="email" className={error ? "border-red-500" : ""} />\n{error && <p className="text-red-500 text-sm">{error}</p>}`,
            language: "tsx",
            explanation: "Error not associated with input, not announced",
          },
          goodExample: {
            code: `<input\n  type="email"\n  aria-invalid={!!error}\n  aria-describedby={error ? "email-error" : undefined}\n  className={error ? "border-red-500" : ""}\n/>\n{error && (\n  <p id="email-error" role="alert" className="text-red-500 text-sm">\n    {error}\n  </p>\n)}`,
            language: "tsx",
            explanation: "aria-invalid + aria-describedby + role=alert for live announcement",
          },
          tips: [
            "Use role='alert' on error messages so they're announced immediately",
            "Don't clear the form on error — let users fix mistakes in place",
            "Provide specific guidance ('Email must include @') not just 'Invalid'",
            "For multi-field errors, use an error summary with anchor links",
          ],
          testYourself: "Submit your form with invalid data. Does VoiceOver announce the error without you having to find it?",
        },
      },
    ],
  },

  // ─── Images & Media ───
  {
    id: "images-basics",
    category: "images",
    title: "Images & Media Accessibility",
    description: "Describe visual content for users who can't see it",
    lessons: [
      {
        id: "images-1",
        title: "Writing Good Alt Text",
        description: "The art of describing images concisely and usefully",
        difficulty: "beginner",
        estimatedMinutes: 5,
        wcagCriteria: ["1.1.1"],
        content: {
          theory: `Alt text provides a text alternative for images. Rules:\n\n- **Informative images**: Describe the content and function\n- **Decorative images**: Use alt="" (empty) to hide from screen readers\n- **Functional images** (buttons/links): Describe the ACTION, not the image\n- **Complex images** (charts): Provide a longer description nearby\n\nNever start with "Image of..." — the screen reader already says "image".`,
          badExample: {
            code: `<img src="chart.png" />\n<img src="hero.jpg" alt="image" />\n<img src="icon-search.svg" alt="magnifying glass icon" />`,
            language: "html",
            explanation: "Missing alt, unhelpful alt, describes appearance not function",
          },
          goodExample: {
            code: `<img src="chart.png" alt="Revenue grew 40% from Q1 to Q4 2025" />\n<img src="hero.jpg" alt="" />  {/* decorative */}\n<button>\n  <img src="icon-search.svg" alt="Search" />\n</button>`,
            language: "html",
            explanation: "Meaningful alt for chart, empty for decorative, action for functional",
          },
          tips: [
            "Ask: 'If I removed this image, what information is lost?' That's your alt text",
            "Keep it under 125 characters — screen readers may truncate longer",
            "For decorative images (backgrounds, dividers), use alt='' not no alt",
            "In React/Next.js: <Image alt='...' /> — ESLint will warn if missing",
          ],
          testYourself: "Find 3 images on your site. For each: is it informative, decorative, or functional? Write appropriate alt text.",
        },
      },
    ],
  },

  // ─── Keyboard ───
  {
    id: "keyboard-basics",
    category: "keyboard",
    title: "Keyboard Accessibility",
    description: "Ensure every interaction works without a mouse",
    lessons: [
      {
        id: "keyboard-1",
        title: "Focus Management Essentials",
        description: "Tab order, focus indicators, and keyboard traps",
        difficulty: "intermediate",
        estimatedMinutes: 8,
        wcagCriteria: ["2.1.1", "2.1.2", "2.4.7"],
        content: {
          theory: `Many users navigate ONLY with keyboard: motor disabilities, power users, screen reader users. Your app must:\n\n1. **All interactive elements** must be reachable via Tab\n2. **Focus must be visible** — never hide the focus ring\n3. **No keyboard traps** — user can always Tab away\n4. **Logical tab order** — follows visual reading flow\n5. **Custom widgets** need keyboard handlers (Enter, Space, Escape, Arrows)`,
          badExample: {
            code: `<div onClick={handleClick} className="cursor-pointer">\n  Click me\n</div>\n\n<style>\n  *:focus { outline: none; } /* "looks cleaner" */\n</style>`,
            language: "tsx",
            explanation: "Div not keyboard-focusable, focus ring removed globally",
          },
          goodExample: {
            code: `<button\n  onClick={handleClick}\n  className="focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2"\n>\n  Click me\n</button>`,
            language: "tsx",
            explanation: "Native button is focusable, visible focus ring on keyboard use only",
          },
          tips: [
            "Use native <button>, <a>, <input> — they get keyboard support for free",
            "If you MUST use a div, add role='button' tabIndex={0} onKeyDown={handleEnterSpace}",
            "Use focus-visible: instead of focus: to only show ring on keyboard navigation",
            "Tab through your entire page — can you reach and activate everything?",
          ],
          testYourself: "Put your mouse aside. Can you complete your app's core user flow using only Tab, Enter, Space, and Escape?",
        },
      },
    ],
  },

  // ─── ARIA ───
  {
    id: "aria-basics",
    category: "aria",
    title: "ARIA Done Right",
    description: "When and how to use ARIA — and when NOT to",
    lessons: [
      {
        id: "aria-1",
        title: "The First Rule of ARIA",
        description: "Don't use ARIA if native HTML works",
        difficulty: "intermediate",
        estimatedMinutes: 8,
        wcagCriteria: ["4.1.2"],
        content: {
          theory: `The first rule of ARIA: **Don't use ARIA.** Seriously.\n\nNative HTML elements (<button>, <nav>, <input>) already have built-in roles, states, and keyboard behavior. ARIA is for when native HTML can't do what you need (custom widgets, dynamic content).\n\nRules of ARIA:\n1. Don't use ARIA if native HTML works\n2. Don't change native semantics (don't put role="button" on a link)\n3. All ARIA controls must be keyboard operable\n4. Don't use role="presentation" on focusable elements\n5. All interactive elements must have accessible names`,
          badExample: {
            code: `<div role="button" aria-label="Submit" onClick={submit}>\n  Submit\n</div>\n\n<span role="link" onClick={() => navigate('/home')}>\n  Go Home\n</span>`,
            language: "tsx",
            explanation: "Reinventing native elements poorly — no keyboard support",
          },
          goodExample: {
            code: `<button onClick={submit}>\n  Submit\n</button>\n\n<a href="/home">\n  Go Home\n</a>`,
            language: "tsx",
            explanation: "Native elements — keyboard, screen reader, and mouse all work",
          },
          tips: [
            "If you're adding role='button', ask yourself: why not just use <button>?",
            "ARIA live regions (role='alert', aria-live) are great for dynamic updates",
            "Use aria-expanded, aria-controls for disclosure patterns (accordions, menus)",
            "Test with a screen reader — ARIA bugs are invisible to sighted developers",
          ],
          testYourself: "Search your codebase for 'role=' — for each one, could you replace it with a native HTML element?",
        },
      },
    ],
  },
];

// ─────────────── Personalization ───────────────

/**
 * Generate personalized learning paths based on the user's category scores.
 * Weakest categories come first.
 */
export function generateLearningPaths(categories: CategoryScore[]): PersonalizedPath[] {
  // Sort by score ascending (weakest first)
  const sorted = [...categories]
    .filter((c) => c.violationCount > 0 || c.score < 100)
    .sort((a, b) => a.score - b.score);

  return sorted.map((cat, idx) => {
    const learningModule = LEARNING_MODULES.find((m) => m.category === cat.category);
    if (!learningModule) return null;

    let reason: string;
    if (cat.score < 50) {
      reason = `Critical weakness — ${cat.violationCount} violations found in this area`;
    } else if (cat.score < 75) {
      reason = `Room for improvement — ${cat.violationCount} violations, ${cat.trend === "improving" ? "getting better" : "needs attention"}`;
    } else {
      reason = `Nearly mastered — polish your skills for the ${LEARNING_MODULES.find((m) => m.category === cat.category)?.title} badge`;
    }

    return {
      category: cat.category,
      module: learningModule,
      priority: idx + 1,
      reason,
      categoryScore: cat.score,
    };
  }).filter(Boolean) as PersonalizedPath[];
}
