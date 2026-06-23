/**
 * RegLayer Bot Agent — AI-powered code editing
 *
 * Called by GitHub Actions with a task description.
 * 1. Reads relevant source files based on the task
 * 2. Calls GPT-4o with task + file contents
 * 3. Outputs file edits as JSON for the workflow to apply
 *
 * Usage: node scripts/bot-agent.mjs "fix the mobile nav on pricing page"
 */

import { readFileSync, readdirSync, statSync } from "fs";
import { join, relative } from "path";

const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
const TASK = process.argv[2];

if (!OPENAI_API_KEY) {
  console.error("OPENAI_API_KEY not set");
  process.exit(1);
}
if (!TASK) {
  console.error("Usage: node bot-agent.mjs <task description>");
  process.exit(1);
}

// Collect relevant source files (skip large/binary/generated)
function collectFiles(dir, base = dir) {
  const files = [];
  const SKIP = ["node_modules", ".next", ".git", "dist", "coverage", "public", "src/generated", "test-results", "playwright-report"];
  const MAX_FILE_SIZE = 15_000; // 15KB per file
  const MAX_TOTAL = 80_000; // 80KB total context

  let totalSize = 0;

  function walk(d) {
    for (const entry of readdirSync(d, { withFileTypes: true })) {
      const full = join(d, entry.name);
      const rel = relative(base, full);
      if (SKIP.some((s) => rel.startsWith(s))) continue;
      if (entry.isDirectory()) {
        walk(full);
      } else if (/\.(tsx?|css|json)$/.test(entry.name) && !entry.name.endsWith(".d.ts")) {
        const stat = statSync(full);
        if (stat.size > MAX_FILE_SIZE) continue;
        if (totalSize + stat.size > MAX_TOTAL) continue;
        totalSize += stat.size;
        files.push({ path: rel, content: readFileSync(full, "utf8") });
      }
    }
  }

  walk(dir);
  return files;
}

// Build context — only send files likely relevant to the task
function buildContext(task, allFiles) {
  const keywords = task.toLowerCase().split(/\s+/);
  const scored = allFiles.map((f) => {
    const pathLower = f.path.toLowerCase();
    const contentLower = f.content.toLowerCase().slice(0, 500);
    let score = 0;
    for (const kw of keywords) {
      if (kw.length < 3) continue;
      if (pathLower.includes(kw)) score += 10;
      if (contentLower.includes(kw)) score += 2;
    }
    // Always include key config files
    if (pathLower.includes("globals.css")) score += 5;
    if (pathLower.includes("layout.tsx") && !pathLower.includes("node_modules")) score += 3;
    if (pathLower.includes("package.json") && pathLower.split("/").length <= 2) score += 3;
    return { ...f, score };
  });

  return scored
    .filter((f) => f.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, 20);
}

const allFiles = collectFiles(process.cwd());
const relevant = buildContext(TASK, allFiles);

console.error(`Found ${allFiles.length} files, sending ${relevant.length} relevant to GPT-4o`);

const fileContext = relevant
  .map((f) => `--- ${f.path} ---\n${f.content}`)
  .join("\n\n");

const systemPrompt = `You are a senior full-stack engineer working on RegLayer, a Next.js 16 web accessibility compliance platform.

Rules:
- Only make changes directly requested by the task
- Don't add comments, docstrings, or refactor beyond what's asked
- Use existing patterns from the codebase
- Tailwind CSS 4 for styling, "use client" for interactive components
- All text visible to users must use the i18n system (t("key"))

Output format — respond ONLY with a JSON array of file edits:
[
  {
    "path": "src/app/pricing/page.tsx",
    "action": "edit",
    "search": "exact lines to find (include 3+ lines of context)",
    "replace": "replacement lines"
  },
  {
    "path": "src/components/new-file.tsx",
    "action": "create",
    "content": "full file content"
  }
]

Rules for edits:
- "search" must be an EXACT substring from the current file (copy-paste precision)
- Include 3-5 lines of surrounding context in "search" to ensure uniqueness
- "replace" is the full replacement including context lines
- For new files use "action": "create" with full "content"
- NEVER output anything outside the JSON array — no markdown, no explanation`;

const userPrompt = `Task: ${TASK}

Relevant source files:
${fileContext}

Output ONLY the JSON array of edits.`;

const response = await fetch("https://api.openai.com/v1/chat/completions", {
  method: "POST",
  headers: {
    "Content-Type": "application/json",
    Authorization: `Bearer ${OPENAI_API_KEY}`,
  },
  body: JSON.stringify({
    model: "gpt-4o",
    messages: [
      { role: "system", content: systemPrompt },
      { role: "user", content: userPrompt },
    ],
    temperature: 0.1,
    max_tokens: 8000,
  }),
});

if (!response.ok) {
  const err = await response.text();
  console.error("OpenAI API error:", response.status, err);
  process.exit(1);
}

const data = await response.json();
const raw = data.choices[0]?.message?.content ?? "";

// Strip markdown fences if present
const cleaned = raw.replace(/^```json\n?/, "").replace(/\n?```$/, "").trim();

// Validate JSON
try {
  const edits = JSON.parse(cleaned);
  if (!Array.isArray(edits)) throw new Error("Expected array");
  // Output to stdout for the workflow to consume
  console.log(JSON.stringify(edits, null, 2));
} catch (e) {
  console.error("Failed to parse GPT response as JSON:", e.message);
  console.error("Raw response:", raw.slice(0, 500));
  process.exit(1);
}
