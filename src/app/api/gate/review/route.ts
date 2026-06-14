/**
 * RegLayer — PR Review Gate API
 *
 * WHY: Teams want automated accessibility checks on pull requests.
 * WHAT: POST triggers a scan of the PR preview URL and reports status.
 * HOW: Scans the provided URL, compares with base branch scan, posts results as PR comment.
 */
import { NextRequest, NextResponse } from "next/server";
import { authenticateApiKey } from "@/lib/auth/api-key";
import { validateScanUrl } from "@/lib/validations/ssrf";
import { prisma } from "@/lib/database/prisma";
import { z } from "zod";
import { postPRReview, postIssueComments } from "@/lib/integrations/github-review";
import type { PRReviewViolation } from "@/lib/integrations/github-review";

/**
 * CI/CD Gate with PR Review Comments
 *
 * POST /api/gate/review
 *
 * Runs scan → generates AI fix suggestions → posts PR review
 * with inline code suggestions. Developers click "Apply suggestion"
 * to fix issues directly from the PR review UI.
 *
 * Request:
 *   {
 *     "url": "https://staging.your-site.com",
 *     "threshold": 80,
 *     "github": {
 *       "owner": "org",
 *       "repo": "repo",
 *       "token": "ghp_...",
 *       "prNumber": 42
 *     },
 *     "generateFixes": true
 *   }
 */

const reviewGateSchema = z.object({
  url: z.string().url(),
  threshold: z.number().min(0).max(100).default(80),
  failOn: z.enum(["score", "critical", "serious"]).default("score"),
  maxCritical: z.number().min(0).default(0),
  maxSerious: z.number().min(0).default(3),
  generateFixes: z.boolean().default(true),
  github: z.object({
    owner: z.string().min(1),
    repo: z.string().min(1),
    token: z.string().min(1),
    prNumber: z.number().int().positive(),
  }),
});

export async function POST(request: NextRequest) {
  // API key authentication
  const authHeader = request.headers.get("authorization");
  if (!authHeader?.replace("Bearer ", "")) {
    return NextResponse.json(
      { error: "Authorization required. Use: Authorization: Bearer <api-key>" },
      { status: 401 }
    );
  }

  const key = await authenticateApiKey(authHeader);
  if (!key) {
    return NextResponse.json({ error: "Invalid API key" }, { status: 403 });
  }

  await prisma.apiKey.update({
    where: { id: key.id },
    data: { lastUsedAt: new Date() },
  }).catch(() => {});

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const parsed = reviewGateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid request", details: parsed.error.flatten().fieldErrors },
      { status: 400 }
    );
  }

  const { url, threshold, failOn, maxCritical, maxSerious, generateFixes, github } = parsed.data;

  // SSRF protection
  const ssrfError = validateScanUrl(url);
  if (ssrfError) {
    return NextResponse.json({ error: ssrfError, passed: false }, { status: 400 });
  }

  // Scope this scan to the key's workspace/owner so the scan (and the billing it
  // accrues) is attributed to the correct tenant rather than persisted orphaned.
  let ownerEmail: string | undefined;
  if (key.userId) {
    const owner = await prisma.user.findUnique({
      where: { id: key.userId },
      select: { email: true },
    });
    ownerEmail = owner?.email;
  }

  try {
    // 1. Run the scan
    const { performScan } = await import("@/services/scanService");
    const result = await performScan({ url, userEmail: ownerEmail });

    const score = result.scan.summary.score;
    const critical = result.scan.summary.critical;
    const serious = result.scan.summary.serious;

    let passed = true;
    let reason = "";

    if (failOn === "score" && score < threshold) {
      passed = false;
      reason = `Score ${score} is below threshold ${threshold}`;
    } else if (failOn === "critical" && critical > maxCritical) {
      passed = false;
      reason = `${critical} critical violations exceeds max ${maxCritical}`;
    } else if (failOn === "serious" && serious > maxSerious) {
      passed = false;
      reason = `${serious} serious violations exceeds max ${maxSerious}`;
    }

    // 2. Generate AI fix suggestions if enabled and violations exist
    let violations: PRReviewViolation[] = result.scan.violations.map((v) => {
      const firstNode = v.nodes[0] || { html: "", target: [] };

      return {
        ruleId: v.id,
        impact: v.impact,
        help: v.help,
        description: v.description,
        helpUrl: v.helpUrl || null,
        tags: v.wcagTags || [],
        element: {
          html: firstNode.html || "",
          target: Array.isArray(firstNode.target)
            ? firstNode.target.join(" > ")
            : "",
        },
      };
    });

    // Generate AI fixes for top violations
    if (generateFixes && violations.length > 0) {
      const apiKeyOpenAI = process.env.OPENAI_API_KEY;
      if (apiKeyOpenAI) {
        violations = await enrichWithAIFixes(apiKeyOpenAI, violations.slice(0, 10), url);
      }
    }

    // 3. Post PR review with fix suggestions
    const reportUrl = `${request.nextUrl.origin}/report/${result.scan.id}`;
    let reviewResult;

    try {
      reviewResult = await postPRReview({
        config: { token: github.token, owner: github.owner, repo: github.repo },
        prNumber: github.prNumber,
        violations,
        score,
        threshold,
        scanUrl: url,
        reportUrl,
      });
    } catch {
      // Fall back to issue comments if PR review fails
      // (e.g., no commits in PR yet)
      reviewResult = await postIssueComments(
        { token: github.token, owner: github.owner, repo: github.repo },
        github.prNumber,
        violations,
        score,
        threshold,
        reportUrl
      );
    }

    return NextResponse.json({
      passed,
      reason: passed ? "All checks passed" : reason,
      score,
      threshold,
      scanId: result.scan.id,
      url,
      violations: {
        total: result.scan.summary.totalViolations,
        critical,
        serious,
        moderate: result.scan.summary.moderate,
        minor: result.scan.summary.minor,
      },
      review: reviewResult,
      reportUrl,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    return NextResponse.json(
      {
        passed: false,
        reason: "Scan failed",
        error: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}

// ─── AI Fix Generation ──────────────────────────────────────

async function enrichWithAIFixes(
  apiKey: string,
  violations: PRReviewViolation[],
  pageUrl: string
): Promise<PRReviewViolation[]> {
  const enriched = await Promise.all(
    violations.map(async (v) => {
      try {
        const fix = await generateFix(apiKey, v, pageUrl);
        return {
          ...v,
          fixStrategy: fix.fixStrategy,
          codeExample: fix.codeExample,
          effort: fix.effort,
          element: {
            ...v.element,
            suggestion: fix.suggestion,
          },
        };
      } catch {
        return v;
      }
    })
  );

  return enriched;
}

async function generateFix(
  apiKey: string,
  violation: PRReviewViolation,
  pageUrl: string
): Promise<{
  fixStrategy: string;
  codeExample: string;
  suggestion: string;
  effort: string;
}> {
  const prompt = `You are an accessibility expert. Generate an exact code fix for this violation.

Violation: ${violation.ruleId}
Impact: ${violation.impact}
Description: ${violation.help}
Page: ${pageUrl}
Current HTML:
${violation.element.html}

Respond in JSON format:
{
  "fixStrategy": "One-sentence fix instruction",
  "codeExample": "The corrected HTML element (just the fixed version, no explanation)",
  "suggestion": "The exact replacement HTML that fixes the issue",
  "effort": "trivial|easy|moderate|complex"
}

Rules:
- The suggestion must be valid HTML that directly replaces the current element
- Keep changes minimal — fix only the accessibility issue
- For missing alt text, generate a descriptive alt
- For missing labels, add aria-label or associated label
- For contrast issues, suggest a darker/lighter color
- For missing landmarks, wrap in appropriate landmark element`;

  const response = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "gpt-4o-mini",
      messages: [{ role: "user", content: prompt }],
      temperature: 0.2,
      response_format: { type: "json_object" },
    }),
  });

  if (!response.ok) {
    throw new Error(`OpenAI API error: ${response.status}`);
  }

  const data = await response.json();
  return JSON.parse(data.choices[0].message.content);
}
