/**
 * Apply file edits from the bot agent JSON output.
 *
 * Usage: node scripts/apply-edits.mjs edits.json
 *
 * Reads the JSON array of edits and applies them to the working tree.
 * Returns a human-readable diff summary for the approval comment.
 */

import { readFileSync, writeFileSync, mkdirSync } from "fs";
import { dirname } from "path";

const editsFile = process.argv[2];
if (!editsFile) {
  console.error("Usage: node apply-edits.mjs <edits.json>");
  process.exit(1);
}

const edits = JSON.parse(readFileSync(editsFile, "utf8"));
const summary = [];

for (const edit of edits) {
  if (edit.action === "create") {
    mkdirSync(dirname(edit.path), { recursive: true });
    writeFileSync(edit.path, edit.content);
    summary.push(`📄 **Created** \`${edit.path}\``);
  } else if (edit.action === "edit") {
    const content = readFileSync(edit.path, "utf8");
    if (!content.includes(edit.search)) {
      summary.push(`⚠️ **Skipped** \`${edit.path}\` — search string not found`);
      continue;
    }
    const updated = content.replace(edit.search, edit.replace);
    writeFileSync(edit.path, updated);

    // Generate a short diff preview
    const searchLines = edit.search.split("\n").length;
    const replaceLines = edit.replace.split("\n").length;
    const delta = replaceLines - searchLines;
    const sign = delta > 0 ? `+${delta}` : delta < 0 ? `${delta}` : "±0";
    summary.push(`✏️ **Edited** \`${edit.path}\` (${sign} lines)`);
  }
}

// Output summary to stdout
console.log(summary.join("\n"));
