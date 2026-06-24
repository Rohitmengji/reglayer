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

const RAW_TASK = process.argv[2];

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

// ── LLM Provider selection ─────────────────────────────────────────────────
const LLM_PROVIDER = process.env.LLM_PROVIDER || "gpt";
let generateFromProvider;

if (LLM_PROVIDER === "claude") {
  const { generateEdits: gen } = await import("./llm/claude.mjs");
  generateFromProvider = gen;
} else {
  const { generateEdits: gen } = await import("./llm/gpt.mjs");
  generateFromProvider = gen;
}

console.error(`Using LLM provider: ${LLM_PROVIDER}`);

let providerResult;
try {
  providerResult = await generateFromProvider(TASK, relevant.map((f) => ({ path: f.path, content: f.content })));
} catch (err) {
  console.error(`ERROR: LLM call failed: ${err.message}`);
  process.exit(1);
}

const { summary, edits: rawEdits, usage } = providerResult;
if (usage) {
  console.error(`Tokens: ${usage.totalTokens} | Cost: $${usage.costUsd}`);
}

const raw = JSON.stringify({ summary, edits: rawEdits });
if (!rawEdits || !rawEdits.length) { console.error("ERROR: LLM returned 0 edits"); process.exit(1); }

// Provider already parsed — validate directly
let edits = rawEdits;
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
console.log(JSON.stringify({ summary, edits: valid }, null, 2));
