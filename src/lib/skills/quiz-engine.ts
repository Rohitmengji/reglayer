/**
 * RegLayer — Quiz Engine
 *
 * WHY: Testing knowledge cements learning. Random quiz questions prevent
 *      memorization and ensure genuine understanding.
 *
 * WHAT: Generates quiz questions from lesson content. Each question is:
 *   - Multiple choice (4 options, 1 correct)
 *   - Derived from the lesson's theory, code examples, or tips
 *   - Shuffled per user using a seed (userId + lessonId + date)
 *
 * HOW: Each lesson has a pool of question templates. The engine selects
 *      N random questions, shuffles answer options using a seeded PRNG,
 *      and verifies answers server-side.
 */

import type { SkillCategory } from "./engine";

// ─────────────── Types ───────────────

export interface QuizQuestion {
  id: string;
  lessonId: string;
  category: SkillCategory;
  question: string;
  options: string[];
  /** Index 0-3 of the correct answer — only included server-side */
  correctIndex?: number;
}

export interface QuizSubmission {
  questionId: string;
  selectedIndex: number;
}

export interface QuizResult {
  questionId: string;
  correct: boolean;
  correctIndex: number;
  explanation: string;
}

export interface QuizSession {
  lessonId: string;
  category: SkillCategory;
  questions: QuizQuestion[];
  totalQuestions: number;
}

export interface QuizGradeResult {
  score: number; // 0-100
  correct: number;
  total: number;
  results: QuizResult[];
  passed: boolean; // >= 70%
  skillBoost: number; // points added to category
}

// ─────────────── Question Pool ───────────────

interface QuestionTemplate {
  lessonId: string;
  category: SkillCategory;
  question: string;
  options: string[]; // First option is ALWAYS correct (shuffled at runtime)
  explanation: string;
}

/**
 * Master question pool. First option in each `options` array is the correct one.
 * At runtime, options are shuffled per-user so the correct answer moves.
 */
const QUESTION_POOL: QuestionTemplate[] = [
  // ─── Color & Contrast ───
  {
    lessonId: "color-1",
    category: "color",
    question: "What is the minimum contrast ratio required for normal text to meet WCAG AA?",
    options: ["4.5:1", "3:1", "7:1", "2:1"],
    explanation: "WCAG AA requires a minimum 4.5:1 contrast ratio for normal-sized text.",
  },
  {
    lessonId: "color-1",
    category: "color",
    question: "What contrast ratio is required for large text (18px bold+) at WCAG AA?",
    options: ["3:1", "4.5:1", "7:1", "2.5:1"],
    explanation: "Large text (18px bold or 24px regular) only needs 3:1 for AA.",
  },
  {
    lessonId: "color-1",
    category: "color",
    question: "Which tool helps you check color contrast directly in the browser?",
    options: ["Browser DevTools color picker", "console.log()", "Network tab", "Application tab"],
    explanation: "The DevTools color picker shows the contrast ratio and whether it passes WCAG.",
  },
  {
    lessonId: "color-1",
    category: "color",
    question: "What happens to users with low vision when text has poor contrast?",
    options: [
      "Text becomes unreadable",
      "Nothing — all users see the same",
      "The browser automatically fixes it",
      "Only affects users in dark mode",
    ],
    explanation: "Low contrast makes text unreadable for users with low vision, color blindness, or in bright environments.",
  },
  {
    lessonId: "color-2",
    category: "color",
    question: "Why shouldn't you rely only on color to convey meaning?",
    options: [
      "About 8% of men have some form of color blindness",
      "Colors render differently on all monitors",
      "It's slower for the browser to render",
      "WCAG forbids all use of color",
    ],
    explanation: "Around 8% of men have color blindness, so color alone may not communicate status/errors.",
  },
  {
    lessonId: "color-2",
    category: "color",
    question: "What should you pair with color to indicate an error state?",
    options: [
      "An icon and descriptive text",
      "A larger font size",
      "A tooltip on hover only",
      "A CSS animation",
    ],
    explanation: "Icons + text labels ensure all users can identify errors regardless of color perception.",
  },
  {
    lessonId: "color-2",
    category: "color",
    question: "How can you test if your UI relies too much on color?",
    options: [
      "View it in grayscale mode",
      "Remove all CSS",
      "Test only in dark mode",
      "Check the Network waterfall",
    ],
    explanation: "Applying a grayscale filter reveals whether meaning is lost without color.",
  },

  // ─── Page Structure ───
  {
    lessonId: "structure-1",
    category: "structure",
    question: "How many h1 elements should a page have?",
    options: ["Exactly one", "As many as needed", "Zero — use divs instead", "Two — one for mobile, one for desktop"],
    explanation: "Every page needs exactly one h1 that describes the page's main purpose.",
  },
  {
    lessonId: "structure-1",
    category: "structure",
    question: "Why is skipping heading levels (h1 → h3) a problem?",
    options: [
      "It breaks the document outline for screen readers",
      "It causes rendering bugs",
      "It makes the page load slower",
      "It only affects print styles",
    ],
    explanation: "Screen readers use heading levels to build a navigable outline. Skipping levels creates confusing gaps.",
  },
  {
    lessonId: "structure-1",
    category: "structure",
    question: "A screen reader user presses 'H' to do what?",
    options: [
      "Jump between headings to scan content",
      "Go to the home page",
      "Open the help menu",
      "Hide the current element",
    ],
    explanation: "Pressing 'H' in screen readers jumps to the next heading, allowing users to scan page structure quickly.",
  },
  {
    lessonId: "structure-1",
    category: "structure",
    question: "What's wrong with using <div class='text-2xl font-bold'> instead of <h2>?",
    options: [
      "It has no semantic meaning for assistive technology",
      "It renders incorrectly",
      "It's not valid HTML",
      "It can't be styled with CSS",
    ],
    explanation: "Styled divs look like headings visually but convey no structure to screen readers.",
  },
  {
    lessonId: "structure-2",
    category: "structure",
    question: "Which HTML element should be used for the primary content area?",
    options: ["<main>", "<div id='content'>", "<section>", "<article>"],
    explanation: "The <main> element designates the primary content and creates a landmark screen readers can jump to.",
  },
  {
    lessonId: "structure-2",
    category: "structure",
    question: "How many <main> elements should a page have?",
    options: ["One", "As many as needed", "None — use role='main' on a div", "Two — one visible, one hidden"],
    explanation: "A page must have exactly one <main> landmark.",
  },
  {
    lessonId: "structure-2",
    category: "structure",
    question: "When should you add aria-label to a <nav> element?",
    options: [
      "When there are multiple nav elements on the page",
      "Always — every nav needs it",
      "Never — it's redundant",
      "Only in single-page apps",
    ],
    explanation: "Multiple navs need aria-label to differentiate them (e.g., 'Main navigation' vs 'Breadcrumb').",
  },

  // ─── Forms ───
  {
    lessonId: "forms-1",
    category: "forms",
    question: "Why is placeholder text NOT an acceptable label?",
    options: [
      "It disappears when the user starts typing",
      "It's not supported in all browsers",
      "It makes the form slower",
      "Screen readers ignore all placeholders",
    ],
    explanation: "Placeholder text vanishes on focus/typing, leaving users with no context about what to enter.",
  },
  {
    lessonId: "forms-1",
    category: "forms",
    question: "What's the preferred way to associate a label with an input?",
    options: [
      "<label for='id'> matching the input's id attribute",
      "Putting text near the input visually",
      "Using a title attribute",
      "Adding a comment in the code",
    ],
    explanation: "The for/id association programmatically links the label to the input for screen readers.",
  },
  {
    lessonId: "forms-1",
    category: "forms",
    question: "What should you use to group related form fields (like a set of radio buttons)?",
    options: [
      "<fieldset> and <legend>",
      "<div> with a class name",
      "<section> with a heading",
      "<ul> with list items",
    ],
    explanation: "Fieldset groups related controls and legend provides a group label announced by screen readers.",
  },
  {
    lessonId: "forms-2",
    category: "forms",
    question: "Which attribute tells a screen reader that a form field has an error?",
    options: [
      "aria-invalid=\"true\"",
      "class=\"error\"",
      "data-error=\"true\"",
      "style=\"border-color: red\"",
    ],
    explanation: "aria-invalid='true' semantically communicates the error state to assistive technology.",
  },
  {
    lessonId: "forms-2",
    category: "forms",
    question: "How do you make an error message get announced immediately by screen readers?",
    options: [
      "Add role=\"alert\" to the error element",
      "Use a red color",
      "Place it above the input",
      "Use a larger font size",
    ],
    explanation: "role='alert' creates a live region that is announced immediately when content appears.",
  },
  {
    lessonId: "forms-2",
    category: "forms",
    question: "What links an error message to its input field programmatically?",
    options: [
      "aria-describedby on the input pointing to the error's id",
      "Placing them in the same div",
      "Using the same CSS class",
      "Matching background colors",
    ],
    explanation: "aria-describedby creates a programmatic association so the screen reader reads the error with the field.",
  },

  // ─── Images ───
  {
    lessonId: "images-1",
    category: "images",
    question: "What alt text should a purely decorative image have?",
    options: [
      "alt=\"\" (empty string)",
      "alt=\"decorative image\"",
      "No alt attribute at all",
      "alt=\"image\"",
    ],
    explanation: "An empty alt (alt='') tells screen readers to skip the image entirely.",
  },
  {
    lessonId: "images-1",
    category: "images",
    question: "For a search icon inside a button, what should the alt text describe?",
    options: [
      "The action: \"Search\"",
      "The appearance: \"Magnifying glass icon\"",
      "Nothing — icons don't need alt text",
      "The file name: \"icon-search.svg\"",
    ],
    explanation: "Functional images should describe their action/purpose, not their visual appearance.",
  },
  {
    lessonId: "images-1",
    category: "images",
    question: "Why should you NOT start alt text with 'Image of...'?",
    options: [
      "Screen readers already announce 'image' before reading the alt",
      "It's grammatically incorrect",
      "It causes SEO penalties",
      "It breaks in some browsers",
    ],
    explanation: "Screen readers say 'image' automatically, so 'Image of a cat' becomes 'image, Image of a cat' — redundant.",
  },
  {
    lessonId: "images-1",
    category: "images",
    question: "What should you do for a complex chart or graph?",
    options: [
      "Provide a longer text description nearby summarizing the data",
      "Just add alt=\"chart\"",
      "Nothing — charts are visual-only content",
      "Add a tooltip that appears on hover",
    ],
    explanation: "Complex images need detailed descriptions (via alt + longer text or aria-describedby) to convey the data.",
  },

  // ─── Keyboard ───
  {
    lessonId: "keyboard-1",
    category: "keyboard",
    question: "What's wrong with <div onClick={fn}> for an interactive element?",
    options: [
      "It's not keyboard-focusable or operable by default",
      "onClick doesn't work on divs",
      "It renders as a block element",
      "It's slower than a button",
    ],
    explanation: "Divs are not in the tab order and don't respond to Enter/Space — unlike native buttons.",
  },
  {
    lessonId: "keyboard-1",
    category: "keyboard",
    question: "Why should you use focus-visible: instead of focus: for styling?",
    options: [
      "It only shows the focus ring for keyboard users, not mouse clicks",
      "It's faster to render",
      "It works in more browsers",
      "It has higher CSS specificity",
    ],
    explanation: "focus-visible targets keyboard navigation specifically, avoiding visual clutter for mouse users.",
  },
  {
    lessonId: "keyboard-1",
    category: "keyboard",
    question: "What is a 'keyboard trap'?",
    options: [
      "When focus gets stuck and the user can't Tab out of a component",
      "When a keyboard shortcut triggers accidentally",
      "When Tab moves too fast through elements",
      "When the focus ring is invisible",
    ],
    explanation: "A keyboard trap prevents users from leaving a component with Tab/Escape — a serious accessibility barrier.",
  },
  {
    lessonId: "keyboard-1",
    category: "keyboard",
    question: "What's the fastest way to test keyboard accessibility?",
    options: [
      "Put your mouse aside and Tab through the entire page",
      "Check the HTML for tabindex attributes",
      "Run a Lighthouse audit",
      "Inspect the CSS focus styles",
    ],
    explanation: "Manual keyboard testing by navigating the full page reveals issues automated tools often miss.",
  },

  // ─── ARIA ───
  {
    lessonId: "aria-1",
    category: "aria",
    question: "What is the first rule of ARIA?",
    options: [
      "Don't use ARIA if native HTML can do the job",
      "Always add ARIA roles to all elements",
      "Use ARIA on every custom component",
      "ARIA should replace HTML semantics",
    ],
    explanation: "Native HTML elements already have built-in accessibility — ARIA should only fill gaps.",
  },
  {
    lessonId: "aria-1",
    category: "aria",
    question: "What's wrong with <div role='button' onClick={fn}>?",
    options: [
      "It lacks keyboard support that a native <button> provides automatically",
      "The role attribute is deprecated",
      "Divs can't have role attributes",
      "onClick doesn't work with role='button'",
    ],
    explanation: "Adding role='button' to a div doesn't add keyboard handling — you'd still need tabIndex, onKeyDown, etc.",
  },
  {
    lessonId: "aria-1",
    category: "aria",
    question: "When IS it appropriate to use ARIA?",
    options: [
      "For custom widgets that have no native HTML equivalent (e.g., combobox, tree)",
      "For every div and span on the page",
      "To replace all HTML5 semantic elements",
      "Only in forms",
    ],
    explanation: "ARIA is for custom interactive patterns where native HTML can't express the semantics needed.",
  },
  {
    lessonId: "aria-1",
    category: "aria",
    question: "What ARIA attribute is useful for accordion/disclosure patterns?",
    options: [
      "aria-expanded",
      "aria-hidden",
      "aria-label",
      "aria-role",
    ],
    explanation: "aria-expanded communicates whether a collapsible section is currently open or closed.",
  },
];

// ─────────────── Seeded Random ───────────────

/**
 * Simple seeded PRNG (mulberry32). Produces deterministic "random" numbers
 * for a given seed so the same user sees the same shuffled questions within
 * a session window (but different from other users).
 */
function seededRandom(seed: number): () => number {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function hashString(str: string): number {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = ((hash << 5) - hash + char) | 0;
  }
  return hash;
}

/**
 * Shuffle an array in-place using Fisher-Yates with a seeded PRNG.
 */
function shuffleArray<T>(arr: T[], rng: () => number): T[] {
  const result = [...arr];
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}

// ─────────────── Public API ───────────────

/**
 * Generate a quiz for a specific lesson.
 * Questions and their options are shuffled uniquely per user.
 *
 * @param lessonId - The lesson to quiz on
 * @param userId - User ID for seeded randomization
 * @param count - Number of questions (default: 3)
 */
export function generateQuiz(
  lessonId: string,
  userId: string,
  count = 3,
): QuizSession {
  const pool = QUESTION_POOL.filter((q) => q.lessonId === lessonId);
  if (pool.length === 0) {
    throw new Error(`No questions for lesson: ${lessonId}`);
  }

  // Create seed from userId + lessonId + day (so it changes daily)
  const today = new Date().toISOString().slice(0, 10);
  const seed = hashString(`${userId}:${lessonId}:${today}`);
  const rng = seededRandom(seed);

  // Pick N random questions
  const shuffled = shuffleArray(pool, rng);
  const selected = shuffled.slice(0, Math.min(count, pool.length));

  const questions: QuizQuestion[] = selected.map((template, idx) => {
    // Shuffle options — remember index 0 was correct in template
    const optionIndices = [0, 1, 2, 3];
    const shuffledIndices = shuffleArray(optionIndices, rng);
    const shuffledOptions = shuffledIndices.map((i) => template.options[i]);
    const correctIndex = shuffledIndices.indexOf(0);

    return {
      id: `${lessonId}-q${idx}-${seed}`,
      lessonId: template.lessonId,
      category: template.category,
      question: template.question,
      options: shuffledOptions,
      correctIndex, // Keep for server-side grading
    };
  });

  return {
    lessonId,
    category: pool[0].category,
    questions,
    totalQuestions: questions.length,
  };
}

/**
 * Generate a quiz for an entire category (all lessons in that category).
 */
export function generateCategoryQuiz(
  category: SkillCategory,
  userId: string,
  count = 5,
): QuizSession {
  const pool = QUESTION_POOL.filter((q) => q.category === category);
  if (pool.length === 0) {
    throw new Error(`No questions for category: ${category}`);
  }

  const today = new Date().toISOString().slice(0, 10);
  const seed = hashString(`${userId}:${category}:${today}`);
  const rng = seededRandom(seed);

  const shuffled = shuffleArray(pool, rng);
  const selected = shuffled.slice(0, Math.min(count, pool.length));

  const questions: QuizQuestion[] = selected.map((template, idx) => {
    const optionIndices = [0, 1, 2, 3];
    const shuffledIndices = shuffleArray(optionIndices, rng);
    const shuffledOptions = shuffledIndices.map((i) => template.options[i]);
    const correctIndex = shuffledIndices.indexOf(0);

    return {
      id: `${category}-q${idx}-${seed}`,
      lessonId: template.lessonId,
      category: template.category,
      question: template.question,
      options: shuffledOptions,
      correctIndex,
    };
  });

  return {
    lessonId: `category-${category}`,
    category,
    questions,
    totalQuestions: questions.length,
  };
}

/**
 * Grade quiz answers. Returns per-question results + overall score.
 * Also calculates skill boost points based on performance.
 */
export function gradeQuiz(
  session: QuizSession,
  answers: QuizSubmission[],
): QuizGradeResult {
  const results: QuizResult[] = session.questions.map((q) => {
    const answer = answers.find((a) => a.questionId === q.id);
    const selectedIndex = answer?.selectedIndex ?? -1;
    const correct = selectedIndex === q.correctIndex;

    // Find explanation from pool
    const template = QUESTION_POOL.find((t) => t.question === q.question);
    const explanation = template?.explanation || "Review the lesson content for more details.";

    return {
      questionId: q.id,
      correct,
      correctIndex: q.correctIndex!,
      explanation,
    };
  });

  const correctCount = results.filter((r) => r.correct).length;
  const total = results.length;
  const score = total > 0 ? Math.round((correctCount / total) * 100) : 0;
  const passed = score >= 70;

  // Skill boost: up to 5 points for perfect, scales down
  // Only positive if passed
  const skillBoost = passed ? Math.round((score / 100) * 5) : 0;

  return {
    score,
    correct: correctCount,
    total,
    results,
    passed,
    skillBoost,
  };
}

/**
 * Get available quiz lesson IDs (lessons that have questions).
 */
export function getQuizzableLessons(): string[] {
  return [...new Set(QUESTION_POOL.map((q) => q.lessonId))];
}

/**
 * Get question count for a lesson.
 */
export function getQuestionCount(lessonId: string): number {
  return QUESTION_POOL.filter((q) => q.lessonId === lessonId).length;
}
