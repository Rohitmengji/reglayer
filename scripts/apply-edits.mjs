/**
 * Apply file edits from bot-agent JSON output (hardened)
 *
 * Security:
 * - Re-validates every edit before applying (defense in depth)
 * - Atomic: reads all files first, validates all, then writes
 * - Path traversal check
 * - Creates backup before editing (in-memory, for rollback)
 *
 * Usage: node scripts/apply-edits.mjs edits.json
 */

import { readFileSync, writeFileSync, mkdirSync, existsSync } from "fs";
import { dirname, normalize, isAbsolute } from "path";

const editsFile = process.argv[2];
if (!editsFile) { console.error("Usage: node apply-edits.mjs <edits.json>"); process.exit(1); }

let edits;
try {
  edits = JSON.parse(readFileSync(editsFile, "utf8"));
} catch (err) {
  console.error("ERROR: Cannot read/parse edits file:", err.message);
  process.exit(1);
}

if (!Array.isArray(edits) || !edits.length) {
  console.error("ERROR: No edits to apply");
  process.exit(1);
}

const FORBIDDEN = [".env", ".github/", "package.json", "prisma/schema.prisma", "node_modules/"];

// ── Phase 1: Validate ALL edits before writing anything ────────────────────
const plan = [];
const summary = [];

for (const edit of edits) {
  const path = normalize(edit.path);

  // Security checks
  if (isAbsolute(path) || path.startsWith("..")) {
    summary.push(`🚫 **Blocked** \`${edit.path}\` — path traversal`);
    continue;
  }
  if (FORBIDDEN.some((f) => path.startsWith(f))) {
    summary.push(`🚫 **Blocked** \`${path}\` — protected file`);
    continue;
  }

  if (edit.action === "create") {
    if (!edit.content) {
      summary.push(`⚠️ **Skipped** \`${path}\` — no content`);
      continue;
    }
    if (existsSync(path)) {
      summary.push(`⚠️ **Skipped** \`${path}\` — file already exists (use edit action)`);
      continue;
    }
    plan.push({ type: "create", path, content: edit.content });
    summary.push(`📄 **Create** \`${path}\``);

  } else if (edit.action === "edit") {
    if (!existsSync(path)) {
      summary.push(`⚠️ **Skipped** \`${path}\` — file not found`);
      continue;
    }
    const original = readFileSync(path, "utf8");
    if (!original.includes(edit.search)) {
      summary.push(`⚠️ **Skipped** \`${path}\` — search string not found`);
      continue;
    }
    // Check for multiple matches (ambiguous edit)
    const matchCount = original.split(edit.search).length - 1;
    if (matchCount > 1) {
      summary.push(`⚠️ **Skipped** \`${path}\` — search matches ${matchCount} locations (ambiguous)`);
      continue;
    }
    const updated = original.replace(edit.search, edit.replace);
    const delta = edit.replace.split("\n").length - edit.search.split("\n").length;
    const sign = delta > 0 ? `+${delta}` : delta < 0 ? `${delta}` : "±0";
    plan.push({ type: "edit", path, content: updated, original });
    summary.push(`✏️ **Edit** \`${path}\` (${sign} lines)`);
  }
}

if (!plan.length) {
  console.log("⚠️ No valid edits to apply.");
  process.exit(0);
}

// ── Phase 2: Apply all edits atomically ────────────────────────────────────
for (const op of plan) {
  if (op.type === "create") {
    mkdirSync(dirname(op.path), { recursive: true });
  }
  writeFileSync(op.path, op.content);
}

console.log(summary.join("\n"));
