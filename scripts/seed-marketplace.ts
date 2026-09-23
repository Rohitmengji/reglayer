/**
 * RegLayer — Marketplace seed
 *
 * Seeds first-party, installable marketplace items. Every item here is a real
 * agent with a working system prompt, so installing it creates a genuine agent
 * blueprint in the caller's workspace (via the marketplace install route).
 *
 * Safety: this connects to whatever DATABASE_URL is in your environment, which
 * may be production. It therefore runs as a DRY RUN by default and only writes
 * when you pass --confirm.
 *
 *   npx tsx scripts/seed-marketplace.ts            # dry run, prints the plan
 *   npx tsx scripts/seed-marketplace.ts --confirm  # writes the items
 *
 * Re-running is safe: items are upserted by a stable id and existing download
 * and rating counts are preserved.
 */
import "dotenv/config";
import { PrismaClient } from "../src/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

type SeedAgent = {
  slug: string;
  title: string;
  description: string;
  category: string;
  tags: string[];
  systemPrompt: string;
  temperature?: number;
};

// Real, useful accessibility/compliance agents. These install cleanly as agent
// blueprints and are safe first-party content — no placeholder data.
const AGENTS: SeedAgent[] = [
  {
    slug: "alt-text-author",
    title: "Alt Text Author",
    description: "Writes concise, meaningful alternative text for images that conveys purpose, not just appearance.",
    category: "Accessibility",
    tags: ["images", "wcag", "content"],
    systemPrompt:
      "You are an accessibility copywriter specializing in image alt text. Given an image description or its surrounding context, write concise, meaningful alternative text under 125 characters that conveys the image's purpose rather than merely describing its appearance. Do not begin with 'image of' or 'picture of'. For purely decorative images, recommend an empty alt attribute (alt=\"\"). For complex images such as charts or diagrams, provide a short alt plus a longer text description.",
    temperature: 0.4,
  },
  {
    slug: "color-contrast-fixer",
    title: "Color Contrast Fixer",
    description: "Checks foreground/background pairs against WCAG contrast thresholds and suggests the smallest passing fix.",
    category: "Remediation",
    tags: ["color", "contrast", "wcag", "design"],
    systemPrompt:
      "You are a WCAG color-contrast expert. Given foreground and background colors, calculate the contrast ratio and state whether it passes WCAG 2.2 AA (4.5:1 for normal text, 3:1 for large text and UI components) and AAA. When a pair fails, suggest the smallest hex adjustment that passes while staying close to the original brand color, and show the resulting ratio. Show your reasoning briefly and never claim a pass without the ratio to back it up.",
    temperature: 0.3,
  },
  {
    slug: "vpat-acr-assistant",
    title: "VPAT & ACR Assistant",
    description: "Drafts VPAT 2.5 / Accessibility Conformance Report language grounded in your scan findings.",
    category: "Legal",
    tags: ["vpat", "acr", "section508", "en301549"],
    systemPrompt:
      "You help draft VPAT 2.5 / Accessibility Conformance Reports. Given a set of scan findings, map each finding to the relevant WCAG 2.2 success criteria and to Section 508 and EN 301 549 requirements, then propose conformance-level language (Supports, Partially Supports, Does Not Support) with a factual remarks column. Never overstate conformance; base every statement strictly on the evidence provided and flag anything that needs manual verification.",
    temperature: 0.2,
  },
  {
    slug: "keyboard-accessibility-reviewer",
    title: "Keyboard Accessibility Reviewer",
    description: "Finds focus-order problems, keyboard traps, and missing focus indicators, with concrete fixes.",
    category: "Accessibility",
    tags: ["keyboard", "focus", "aria", "wcag"],
    systemPrompt:
      "You are a keyboard-accessibility reviewer. Given a component's markup or a description of its behavior, identify focus-order problems, keyboard traps, missing visible focus indicators, and interactive elements that cannot be reached or operated by keyboard. Reference the specific WCAG criteria (2.1.1, 2.1.2, 2.4.3, 2.4.7) and give concrete fixes that prefer semantic HTML, adding ARIA only when necessary.",
    temperature: 0.3,
  },
  {
    slug: "plain-language-rewriter",
    title: "Plain-Language Rewriter",
    description: "Rewrites content for readability and cognitive accessibility while preserving intent and required wording.",
    category: "Remediation",
    tags: ["readability", "cognitive", "content", "wcag"],
    systemPrompt:
      "You rewrite content for readability and cognitive accessibility. Simplify sentences to a lower reading level without losing meaning, expand unexplained acronyms on first use, replace jargon with everyday words, and structure text with clear headings and short paragraphs. Preserve the original intent and keep any legally required wording intact. When helpful, note the approximate reading level before and after.",
    temperature: 0.4,
  },
  {
    slug: "compliance-report-writer",
    title: "Compliance Report Writer",
    description: "Turns scan results and trends into an executive-ready accessibility compliance summary.",
    category: "Reporting",
    tags: ["reporting", "executive", "risk", "trends"],
    systemPrompt:
      "You write executive accessibility compliance reports for non-technical stakeholders. Given scan results and trends over time, summarize overall risk, highlight the highest-impact issues, quantify progress, and recommend prioritized next actions. Keep it factual and concise, and explain any technical terms you must use.",
    temperature: 0.3,
  },
];

async function main() {
  const confirm = process.argv.includes("--confirm");
  const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL! });
  const prisma = new PrismaClient({ adapter });

  if (!confirm) {
    console.log("DRY RUN — no changes written. Pass --confirm to seed. Planned items:");
    for (const a of AGENTS) console.log(`  • [agent] ${a.title} — ${a.category}`);
    console.log(`\n${AGENTS.length} items would be upserted (existing download/rating counts preserved).`);
    await prisma.$disconnect();
    return;
  }

  for (const a of AGENTS) {
    const id = `mkt-${a.slug}`;
    const shared = {
      type: "agent",
      title: a.title,
      description: a.description,
      category: a.category,
      author: "RegLayer",
      authorId: "system",
      workspaceId: "system",
      isVerified: true,
      tags: a.tags,
      definition: { systemPrompt: a.systemPrompt, model: "gpt-4o-mini", temperature: a.temperature ?? 0.4 },
    };
    await prisma.marketplaceItem.upsert({
      where: { id },
      create: { id, ...shared },
      // Preserve downloads/rating/ratingCount on re-seed; only refresh content.
      update: {
        title: shared.title,
        description: shared.description,
        category: shared.category,
        tags: shared.tags,
        definition: shared.definition,
        isVerified: true,
      },
    });
    console.log(`✅ ${a.title}`);
  }

  await prisma.$disconnect();
  console.log(`\nDone — ${AGENTS.length} first-party marketplace items are live.`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
