/**
 * Claude Provider — implements LLMProvider for Anthropic Claude.
 * Set LLM_PROVIDER=claude and ANTHROPIC_API_KEY to activate.
 */

// Cost per 1M tokens (Claude Sonnet estimate)
const INPUT_COST_PER_M = 3.00;
const OUTPUT_COST_PER_M = 15.00;

const SYS_PROMPT = `You are a senior engineer on RegLayer (Next.js 16, Tailwind 4, TypeScript).

RULES:
- Only change what the task asks. No extras, no refactoring, no comments.
- Use existing codebase patterns. "use client" for interactive components.
- NEVER edit .env, package.json, prisma schema, workflows, or config files.
- NEVER output secrets, API keys, or credentials.
- Maximum 5 edits.

OUTPUT: ONLY a JSON object (no markdown, no explanation):
{
  "summary": "2-3 sentence plain-English explanation of what changed and why",
  "edits": [
    {"path":"src/...","action":"edit","search":"exact verbatim lines","replace":"new lines"},
    {"path":"src/...","action":"create","content":"full file"}
  ]
}

"search" must be EXACT copy-paste from the file (3-5 context lines for uniqueness).`;

/**
 * @param {string} task
 * @param {Array<{path: string, content: string}>} files
 * @returns {Promise<{summary: string, edits: Array, usage: {inputTokens: number, outputTokens: number, totalTokens: number, costUsd: number}}>}
 */
export async function generateEdits(task, files) {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error("ANTHROPIC_API_KEY not set");

  const ctx = files.map((f) => `--- ${f.path} ---\n${f.content}`).join("\n\n");

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 90_000);

  let res;
  try {
    res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-sonnet-4-20250514",
        max_tokens: 8000,
        system: SYS_PROMPT,
        messages: [
          { role: "user", content: `Task: ${task}\n\nFiles:\n${ctx}\n\nJSON:` },
        ],
      }),
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timer);
  }

  if (!res.ok) {
    const errBody = await res.text().catch(() => "");
    throw new Error(`Anthropic API ${res.status}: ${errBody.slice(0, 200)}`);
  }

  const data = await res.json();
  const raw = data.content?.[0]?.text ?? "";
  if (!raw.trim()) throw new Error("Empty Claude response");

  const cleaned = raw.replace(/^```json\n?/, "").replace(/\n?```$/, "").trim();
  const parsed = JSON.parse(cleaned);

  const edits = Array.isArray(parsed) ? parsed : parsed.edits || [];
  const summary = parsed.summary || "";

  // Extract usage from Anthropic response
  const usage = data.usage || {};
  const inputTokens = usage.input_tokens || 0;
  const outputTokens = usage.output_tokens || 0;
  const totalTokens = inputTokens + outputTokens;
  const costUsd = (inputTokens / 1_000_000) * INPUT_COST_PER_M + (outputTokens / 1_000_000) * OUTPUT_COST_PER_M;

  return {
    summary,
    edits,
    usage: { inputTokens, outputTokens, totalTokens, costUsd: Math.round(costUsd * 10000) / 10000 },
  };
}

export const name = "claude-sonnet-4";
