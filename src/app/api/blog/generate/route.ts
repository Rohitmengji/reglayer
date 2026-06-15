import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth/config";
import OpenAI from "openai";

// Lazy: `new OpenAI()` reads OPENAI_API_KEY and throws if absent. At module
// top-level that crashes `next build` page-data collection (the key is a RUNTIME
// secret, not present at build time). Construct it per-request instead.
function getOpenAI() {
  return new OpenAI();
}

/**
 * POST /api/blog/generate — AI full article generation
 *
 * Takes a topic, category, and tone; generates a complete article
 * with structured sections for review before publishing.
 */
export async function POST(request: Request) {
  const session = await getServerSession(authOptions);
  const isAdmin = session?.user?.isMasterAdmin || session?.user?.role === "admin" || session?.user?.role === "owner";
  if (!isAdmin) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = await request.json().catch(() => null);
  if (!body?.topic) {
    return NextResponse.json({ error: "topic required" }, { status: 400 });
  }

  const openai = getOpenAI();

  const { topic, category = "Technical", tone = "practitioner" } = body;

  const toneMap: Record<string, string> = {
    practitioner: "Write for experienced developers and compliance professionals. Be direct, data-driven, and specific. Include code examples where relevant. No fluff.",
    executive: "Write for CTOs, VPs, and decision-makers. Focus on business impact, risk, and ROI. Keep it concise with clear takeaways.",
    tutorial: "Write as a step-by-step guide. Include code examples, screenshots descriptions, and clear instructions. Assume intermediate developer skill level.",
  };
  const toneGuide = toneMap[tone] || toneMap.practitioner;

  try {
    const response = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      temperature: 0.7,
      messages: [
        {
          role: "system",
          content: `You are a technical content writer for RegLayer, a web accessibility compliance platform.
You write blog articles about WCAG, ADA, EAA, Section 508, accessibility law, and development best practices.

${toneGuide}

Category: ${category}

Generate a complete blog article with this exact JSON structure:
{
  "title": "Article Title",
  "slug": "url-slug-from-title",
  "excerpt": "1-2 sentence description for listing pages",
  "sections": [
    {
      "id": "section-slug",
      "title": "Section Heading",
      "paragraphs": ["Paragraph 1 text", "Paragraph 2 text"],
      "code": "optional code block content",
      "list": ["optional", "bullet", "points"]
    }
  ]
}

Requirements:
- Generate 4-6 sections with substantive content
- Each section should have 2-4 paragraphs
- Include code examples in at least one section (if technical)
- Include bullet lists where appropriate
- Be factually accurate about accessibility standards
- Reference specific WCAG success criteria by number
- Include actionable advice, not just theory
- Slug should be lowercase, hyphen-separated, max 60 chars

Return ONLY valid JSON. No markdown, no explanations.`,
        },
        {
          role: "user",
          content: `Write a complete article about: ${topic}`,
        },
      ],
      response_format: { type: "json_object" },
    });

    const content = response.choices[0]?.message?.content;
    if (!content) {
      return NextResponse.json({ error: "AI returned empty response" }, { status: 500 });
    }

    const article = JSON.parse(content);

    // Validate structure
    if (!article.title || !article.sections || !Array.isArray(article.sections)) {
      return NextResponse.json({ error: "AI returned invalid structure" }, { status: 500 });
    }

    // Ensure slug exists
    if (!article.slug) {
      article.slug = article.title
        .toLowerCase()
        .replace(/[^a-z0-9\s-]/g, "")
        .replace(/\s+/g, "-")
        .slice(0, 60);
    }

    return NextResponse.json({ article });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Generation failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
