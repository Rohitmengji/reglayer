import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth/config";
import { prisma } from "@/lib/database/prisma";
import { isContentEditor } from "@/lib/auth/roles";
import { complete } from "@/lib/ai/gateway";

interface RouteParams {
  params: Promise<{ slug: string }>;
}

/**
 * POST /api/blog/[slug]/ai-edit — AI-assisted content editing
 * 
 * Takes the current article content and an instruction,
 * returns AI-suggested edits while preserving structure.
 * Does NOT auto-save — returns the suggested content for review.
 */
export async function POST(request: Request, { params }: RouteParams) {
  const { slug } = await params;
  const session = await getServerSession(authOptions);
  if (!isContentEditor(session)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = await request.json().catch(() => null);
  if (!body?.instruction) {
    return NextResponse.json({ error: "instruction required" }, { status: 400 });
  }

  const article = await prisma.article.findUnique({ where: { slug } });
  if (!article) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const currentContent = article.content as { sections?: Array<{ id: string; title: string; paragraphs: string[] }> };

  try {
    const response = await complete({
      model: "gpt-4o-mini",
      temperature: 0.3,
      messages: [
        {
          role: "system",
          content: `You are a technical content editor for RegLayer, a web accessibility compliance platform. 
You edit blog articles about WCAG, ADA, EAA, Section 508, and accessibility law.

RULES:
- NEVER remove or overwrite existing factual content unless explicitly asked
- ONLY modify the specific parts the instruction targets
- Preserve all section IDs, structure, and formatting
- Keep technical accuracy — cite standards correctly
- Maintain the professional, practitioner-focused tone
- Return the FULL content JSON with edits applied (not just the diff)
- If adding new sections, append them — don't replace existing ones

Return ONLY valid JSON matching the exact schema of the input content.`,
        },
        {
          role: "user",
          content: `Current article: "${article.title}"
Current content structure:
${JSON.stringify(currentContent, null, 2)}

Instruction: ${body.instruction}

Return the updated content JSON:`,
        },
      ],
      jsonMode: true,
      metadata: { feature: "blog.aiEdit" },
    });

    const aiContent = response?.content;
    if (!aiContent) {
      return NextResponse.json({ error: "AI returned empty response" }, { status: 500 });
    }

    const parsed = JSON.parse(aiContent);

    // Validate structure — must have sections array
    if (!parsed.sections || !Array.isArray(parsed.sections)) {
      return NextResponse.json({ error: "AI returned invalid structure" }, { status: 500 });
    }

    // Return suggested content for review — NOT auto-applied
    return NextResponse.json({
      suggestion: parsed,
      original: currentContent,
      instruction: body.instruction,
      message: "Review the suggested changes. Call PATCH to apply.",
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "AI editing failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
