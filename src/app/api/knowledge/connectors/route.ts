/**
 * RegLayer — Knowledge Connectors API
 *
 * POST /api/knowledge/connectors — Trigger a connector sync (GitHub, Notion, URL)
 */

import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth/config";
import { requireWorkspacePermission } from "@/lib/auth/api-guard";
import { syncGitHub, syncNotion, syncURL } from "@/lib/ai/knowledge/connectors";
import { rateLimit, RATE_LIMITS, rateLimitHeaders } from "@/lib/rate-limit";
import { z } from "zod";

const githubSchema = z.object({
  type: z.literal("github"),
  owner: z.string().min(1).max(100),
  repo: z.string().min(1).max(100),
  token: z.string().min(1).max(500),
  branch: z.string().max(100).optional(),
  paths: z.array(z.string().max(200)).max(20).optional(),
});

const notionSchema = z.object({
  type: z.literal("notion"),
  token: z.string().min(1).max(500),
  pageIds: z.array(z.string().max(100)).max(30).optional(),
  databaseId: z.string().max(100).optional(),
});

const urlSchema = z.object({
  type: z.literal("url"),
  urls: z.array(z.string().url().max(2000)).min(1).max(10),
});

const connectorSchema = z.discriminatedUnion("type", [githubSchema, notionSchema, urlSchema]);

export async function POST(request: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Connector syncs fan out to many outbound requests (GitHub/Notion/URL) plus
  // embedding generation — expensive. Use the tight `integration` bucket.
  const rl = await rateLimit(session.user.email, RATE_LIMITS.integration, "knowledge-connectors");
  if (!rl.success) {
    return NextResponse.json({ error: "Too many requests" }, { status: 429, headers: rateLimitHeaders(rl) });
  }

  const perm = await requireWorkspacePermission("settings.manage");
  if (!perm.ok) return perm.response;
  if (!perm.ctx.workspaceId || !perm.ctx.userId) {
    return NextResponse.json({ error: "Workspace not found" }, { status: 404 });
  }

  let body: unknown;
  try { body = await request.json(); } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const parsed = connectorSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten().fieldErrors }, { status: 400 });
  }

  const data = parsed.data;
  const { workspaceId, userId } = perm.ctx;

  let result;
  switch (data.type) {
    case "github":
      result = await syncGitHub({
        owner: data.owner,
        repo: data.repo,
        token: data.token,
        branch: data.branch,
        paths: data.paths,
        workspaceId,
        userId,
      });
      break;
    case "notion":
      result = await syncNotion({
        token: data.token,
        pageIds: data.pageIds,
        databaseId: data.databaseId,
        workspaceId,
        userId,
      });
      break;
    case "url":
      result = await syncURL({ urls: data.urls, workspaceId, userId });
      break;
  }

  return NextResponse.json({
    result,
    success: result.errors.length === 0,
  }, { status: result.errors.length === 0 ? 200 : 207 });
}
