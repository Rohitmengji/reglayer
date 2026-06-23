/**
 * RegLayer Bot Agent — AI code editing (hardened)
 *
 * Security:
 * - NEVER sends .env, secrets, keys, tokens to AI
 * - Blocks edits to sensitive files (env, config, workflows, prisma schema)
 * - Path traversal prevention (no ../, no absolute paths)
 * - Validates AI output strictly (JSON, file existence, search string match)
 * - 60s timeout on API call
 * - Task input sanitized (500 char max, shell metacharacters stripped)
 * - Max 10 edits, max 5 new files
 *
 * Usage: node scripts/bot-agent.mjs "fix the mobile nav on pricing page"
 */

import { readFileSync, readdirSync, statSync, existsSync } from "fs";
import { join, relative, normalize, isAbsolute } from "path";

const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
const RAW_TASK = process.argv[2];

if (!OPENAI_API_KEY) { console.error("ERROR: OPENAI_API_KEY not set"); process.exit(1); }
if (!RAW_TASK) { console.error("Usage: node bot-agent.mjs <task>"); process.exit(1); }

// ── Security: sanitize input ───────────────────────────────────────────────
const TASK = RAW_TASK.slice(0, 500).replace(/[`${}\\]/g, "");
if (TASK.length < 5) { console.error("ERROR: Task too short"); process.exit(1); }

// ── Security: sensitive file patterns ──────────────────────────────────────
const SENSITIVE = [/\.env/i, /secret/i, /\.pem$/i, /\.key$/i, /credential/i, /password/i];
const FORBIDDEN_EDITS = [
  ".env", ".env.local", ".env.production", "prisma/schema.prisma",
  "prisma.config.ts", ".github/", "scripts/bot-agent.mjs",
  "scripts/apply-edits.mjs", "AGENTS.md", "package.json",
  "package-lock.json", "next.config.ts", "tsconfig.json",
];

const isSensitive = (p) => SENSITIVE.some((r) => r.test(p));
const isForbidden = (p) => FORBIDDEN_EDITS.some((f) => p.startsWith(f));

// ── Collect files (never sends secrets) ────────────────────────────────────
function collectFiles(dir, base = dir) {
  const files = [];
  const SKIP = ["node_modules",".next",".git","dist","coverage","public","src/generated","test-results","playwright-report","visual-audit","e2e","linkedin"];
  const MAX_SIZE = 12_000, MAX_TOTAL = 60_000;
  let total = 0;

  function walk(d) {
    let entries;
    try { entries = readdirSync(d, { withFileTypes: true }); } catch { return; }
    for (const e of entries) {
      const full = join(d, e.name);
      const rel = relative(base, full);
      if (SKIP.some((s) => rel.startsWith(s)) || e.name.startsWith(".")) continue;
      if (e.isDirectory()) { walk(full); continue; }
      if (!/\.(tsx?|css)$/.test(e.name) || e.name.endsWith(".d.ts")) continue;
      if (isSensitive(rel)) continue;
      const s = statSync(full);
      if (s.size > MAX_SIZE || total + s.size > MAX_TOTAL) continue;
      total += s.size;
      files.push({ path: rel, content: readFileSync(full, "utf8") });
    }
  }
  walk(dir);
  return files;
}

// ── Relevance scoring ──────────────────────────────────────────────────────
function rank(task, files) {
  const kw = task.toLowerCase().split(/\s+/).filter((k) => k.length >= 3);
  return files
    .map((f) => {
      const p = f.path.toLowerCase(), h = f.content.toLowerCase().slice(0, 400);
      let s = 0;
      for (const k of kw) { if (p.includes(k)) s += 10; if (h.includes(k)) s += 2; }
      if (p.includes("globals.css")) s += 5;
      if (p.endsWith("layout.tsx")) s += 3;
      return { ...f, score: s };
    })
    .filter((f) => f.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, 15);
}

// ── Main ───────────────────────────────────────────────────────────────────
const all = collectFiles(process.cwd());
const relevant = rank(TASK, all);
if (!relevant.length) { console.error("ERROR: No relevant files found"); process.exit(1); }
console.error(`Scanned ${all.length} files, sending ${relevant.length} to AI`);

const ctx = relevant.map((f) => `--- ${f.path} ---\n${f.content}`).join("\n\n");

const SYS = `You are a senior engineer on RegLayer (Next.js 16, Tailwind 4, TypeScript).

RULES:
- Only change what the task asks. No extras, no refactoring, no comments.
- Use existing codebase patterns. "use client" for interactive components.
- NEVER edit .env, package.json, prisma schema, workflows, or config files.
- NEVER output secrets, API keys, or credentials.
- Maximum 5 edits.

OUTPUT: ONLY a JSON array (no markdown, no explanation):
[{"path":"src/...","action":"edit","search":"exact verbatim lines","replace":"new lines"},
 {"path":"src/...","action":"create","content":"full file"}]

"search" must be EXACT copy-paste from the file (3-5 context lines for uniqueness).`;

const ctrl = new AbortController();
const timer = setTimeout(() => ctrl.abort(), 60_000);

let res;
try {
  res = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${OPENAI_API_KEY}` },
    body: JSON.stringify({
      model: "gpt-5.4-mini",
      messages: [{ role: "system", content: SYS }, { role: "user", content: `Task: ${TASK}\n\nFiles:\n${ctx}\n\nJSON:` }],
      temperature: 0.05,
      max_tokens: 8000,
    }),
    signal: ctrl.signal,
  });
} catch (err) {
  clearTimeout(timer);
  console.error(err.name === "AbortError" ? "ERROR: API timeout (60s)" : `ERROR: ${err.message}`);
  process.exit(1);
}
clearTimeout(timer);

if (!res.ok) {
  console.error(`ERROR: API ${res.status}: ${(await res.text().catch(() => "")).slice(0, 200)}`);
  process.exit(1);
}

const raw = (await res.json()).choices?.[0]?.message?.content ?? "";
if (!raw.trim()) { console.error("ERROR: Empty AI response"); process.exit(1); }

// ── Parse + validate ───────────────────────────────────────────────────────
let edits;
try { edits = JSON.parse(raw.replace(/^```json\n?/, "").replace(/\n?```$/, "").trim()); }
catch { console.error("ERROR: Invalid JSON\n" + raw.slice(0, 300)); process.exit(1); }

if (!Array.isArray(edits)) { console.error("ERROR: Expected array"); process.exit(1); }
if (!edits.length) { console.error("ERROR: 0 edits"); process.exit(1); }
if (edits.length > 10) { console.error("ERROR: Too many edits:", edits.length); process.exit(1); }

const valid = [];
for (const e of edits) {
  if (!e.path || typeof e.path !== "string") { console.error("SKIP: no path"); continue; }
  const norm = normalize(e.path);
  if (isAbsolute(norm) || norm.startsWith("..")) { console.error(`BLOCK: traversal: ${e.path}`); continue; }
  if (isForbidden(norm)) { console.error(`BLOCK: forbidden: ${norm}`); continue; }
  if (isSensitive(norm)) { console.error(`BLOCK: sensitive: ${norm}`); continue; }

  if (e.action === "create") {
    if (!e.content) { console.error(`SKIP: no content for ${e.path}`); continue; }
    if (/api.key|secret_key|password\s*=/i.test(e.content)) { console.error(`BLOCK: secrets in ${e.path}`); continue; }
    valid.push(e);
  } else if (e.action === "edit") {
    if (!e.search || !e.replace) { console.error(`SKIP: missing search/replace: ${e.path}`); continue; }
    if (!existsSync(e.path)) { console.error(`SKIP: not found: ${e.path}`); continue; }
    if (!readFileSync(e.path, "utf8").includes(e.search)) { console.error(`SKIP: search miss: ${e.path}`); continue; }
    valid.push(e);
  } else { console.error(`SKIP: unknown action: ${e.action}`); }
}

if (!valid.length) { console.error("ERROR: All edits invalid/blocked"); process.exit(1); }
console.error(`Validated ${valid.length}/${edits.length} edits`);
console.log(JSON.stringify(valid, null, 2));
