/**
 * GPT Provider — implements LLMProvider for OpenAI GPT-5.4-mini.
 * Swap to Claude by creating claude.mjs and setting LLM_PROVIDER=claude.
 */

// Cost per 1M tokens (GPT-5.4-mini estimate)
const INPUT_COST_PER_M = 0.15;
const OUTPUT_COST_PER_M = 0.60;

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
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error("OPENAI_API_KEY not set");

  const ctx = files.map((f) => `--- ${f.path} ---\n${f.content}`).join("\n\n");

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 60_000);

  let res;
  try {
    res = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({
        model: "gpt-5.4-mini",
        messages: [
          { role: "system", content: SYS_PROMPT },
          { role: "user", content: `Task: ${task}\n\nFiles:\n${ctx}\n\nJSON:` },
        ],
        temperature: 0.05,
        max_completion_tokens: 8000,
      }),
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timer);
  }

  if (!res.ok) {
    const errBody = await res.text().catch(() => "");
    throw new Error(`OpenAI API ${res.status}: ${errBody.slice(0, 200)}`);
  }

  const data = await res.json();
  const raw = data.choices?.[0]?.message?.content ?? "";
  if (!raw.trim()) throw new Error("Empty AI response");

  const cleaned = raw.replace(/^```json\n?/, "").replace(/\n?```$/, "").trim();
  const parsed = JSON.parse(cleaned);

  const edits = Array.isArray(parsed) ? parsed : parsed.edits || [];
  const summary = parsed.summary || "";

  // Extract usage
  const usage = data.usage || {};
  const inputTokens = usage.prompt_tokens || 0;
  const outputTokens = usage.completion_tokens || 0;
  const totalTokens = inputTokens + outputTokens;
  const costUsd = (inputTokens / 1_000_000) * INPUT_COST_PER_M + (outputTokens / 1_000_000) * OUTPUT_COST_PER_M;

  return {
    summary,
    edits,
    usage: { inputTokens, outputTokens, totalTokens, costUsd: Math.round(costUsd * 10000) / 10000 },
  };
}

export const name = "gpt-5.4-mini";
