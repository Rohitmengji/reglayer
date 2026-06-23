/**
 * RegLayer — Custom Compliance Rules API (collection)
 *
 * GET  /api/rules — list the active workspace's custom rules
 * POST /api/rules — create a custom rule (OWNER/ADMIN)
 *
 * Gated by the Enterprise "customRules" feature. Operates on the requireFeature-
 * resolved active workspace, so no client-supplied workspaceId (no IDOR surface).
 */
import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { z } from "zod";
import { authOptions } from "@/lib/auth/config";
import { prisma } from "@/lib/database/prisma";
import { requireFeature } from "@/lib/features/require-feature";
import { applyRateLimit } from "@/lib/rate-limit-middleware";

const RULE_TYPES = ["THRESHOLD", "RULE_REQUIRED", "IMPACT_BUDGET", "CRITERION_REQUIRED"] as const;
const IMPACTS = ["critical", "serious", "moderate", "minor"] as const;

const envelopeSchema = z.object({
  name: z.string().trim().min(1).max(100),
  description: z.string().trim().max(500).optional(),
  enabled: z.boolean().default(true),
  type: z.enum(RULE_TYPES),
  severity: z.enum(IMPACTS).default("serious"),
  config: z.record(z.string(), z.unknown()).default({}),
});

// Per-type config validators — parsed separately so the stored JSON is clean.
const configSchemas = {
  THRESHOLD: z.object({ minScore: z.number().min(0).max(100) }),
  RULE_REQUIRED: z.object({ axeRuleId: z.string().trim().min(1).max(100) }),
  IMPACT_BUDGET: z.object({ impact: z.enum(IMPACTS), maxCount: z.number().int().min(0).max(100000) }),
  CRITERION_REQUIRED: z.object({ criterion: z.string().trim().regex(/^\d\.\d\.\d+$/, "Use a WCAG id like 1.4.3") }),
} as const;

export function parseRuleConfig(type: (typeof RULE_TYPES)[number], raw: unknown) {
  return configSchemas[type].safeParse(raw);
}

/** Resolve the acting user's id and confirm OWNER/ADMIN in the workspace. */
async function requireWorkspaceAdmin(email: string, workspaceId: string): Promise<string | null> {
  const member = await prisma.workspaceMember.findFirst({
    where: { workspaceId, user: { email }, role: { in: ["OWNER", "ADMIN"] } },
    select: { userId: true },
  });
  return member?.userId ?? null;
}

export async function GET() {
  const guard = await requireFeature("customRules");
  if (!guard.allowed) return guard.response;

  const rules = await prisma.complianceRule.findMany({
    where: { workspaceId: guard.workspaceId },
    orderBy: { createdAt: "desc" },
  });
  return NextResponse.json({ rules });
}

export async function POST(request: NextRequest) {
  const blocked = await applyRateLimit(request, "api");
  if (blocked) return blocked;

  const guard = await requireFeature("customRules");
  if (!guard.allowed) return guard.response;

  const session = await getServerSession(authOptions);
  if (!session?.user?.email) {
    return NextResponse.json({ error: "Authentication required" }, { status: 401 });
  }
  const actorId = await requireWorkspaceAdmin(session.user.email, guard.workspaceId);
  if (!actorId) {
    return NextResponse.json({ error: "Admin access required" }, { status: 403 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const parsed = envelopeSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten().fieldErrors }, { status: 400 });
  }
  const cfg = parseRuleConfig(parsed.data.type, parsed.data.config);
  if (!cfg.success) {
    return NextResponse.json({ error: { config: cfg.error.issues.map((i) => i.message) } }, { status: 400 });
  }

  const rule = await prisma.complianceRule.create({
    data: {
      workspaceId: guard.workspaceId,
      name: parsed.data.name,
      description: parsed.data.description,
      enabled: parsed.data.enabled,
      type: parsed.data.type,
      severity: parsed.data.severity,
      config: cfg.data,
      createdBy: actorId,
    },
  });

  await prisma.auditLog.create({
    data: {
      action: "compliance_rule.created",
      actor: actorId,
      target: rule.id,
      workspaceId: guard.workspaceId,
      metadata: { name: rule.name, type: rule.type },
    },
  });

  return NextResponse.json({ rule }, { status: 201 });
}
