/**
 * RegLayer — Marketplace API
 *
 * GET  /api/marketplace           — Browse/search marketplace items
 * POST /api/marketplace           — Publish an item to the marketplace
 */

import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth/config";
import { prisma } from "@/lib/database/prisma";
import { requireWorkspacePermission } from "@/lib/auth/api-guard";
import { z } from "zod";

export async function GET(request: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const url = new URL(request.url);
  const q = url.searchParams.get("q") || "";
  const type = url.searchParams.get("type") || "";
  const category = url.searchParams.get("category") || "";
  const sort = url.searchParams.get("sort") || "downloads";
  const limit = Math.min(parseInt(url.searchParams.get("limit") || "30"), 100);

  const where: Record<string, unknown> = {};
  if (type) where.type = type;
  if (category) where.category = category;
  if (q) {
    where.OR = [
      { title: { contains: q, mode: "insensitive" } },
      { description: { contains: q, mode: "insensitive" } },
      { tags: { has: q.toLowerCase() } },
    ];
  }

  const orderBy: Record<string, string> = {};
  if (sort === "downloads") orderBy.downloads = "desc";
  else if (sort === "rating") orderBy.rating = "desc";
  else orderBy.createdAt = "desc";

  const items = await prisma.marketplaceItem.findMany({
    where,
    orderBy,
    take: limit,
    select: {
      id: true,
      type: true,
      title: true,
      description: true,
      category: true,
      author: true,
      downloads: true,
      rating: true,
      ratingCount: true,
      tags: true,
      isVerified: true,
      createdAt: true,
    },
  });

  return NextResponse.json({ items, total: items.length });
}

const publishSchema = z.object({
  type: z.enum(["workflow", "rule", "agent", "template"]),
  title: z.string().min(3).max(200),
  description: z.string().min(10).max(2000),
  category: z.string().min(1).max(100),
  tags: z.array(z.string().max(50)).max(10).default([]),
  definition: z.record(z.string(), z.unknown()), // the actual content
});

export async function POST(request: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
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

  const parsed = publishSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten().fieldErrors }, { status: 400 });
  }

  const { type, title, description, category, tags, definition } = parsed.data;

  const item = await prisma.marketplaceItem.create({
    data: {
      type,
      title,
      description,
      category,
      author: session.user.name || session.user.email.split("@")[0],
      authorId: perm.ctx.userId,
      workspaceId: perm.ctx.workspaceId,
      tags: tags.map((t) => t.toLowerCase()),
      definition: JSON.parse(JSON.stringify(definition)),
    },
  });

  return NextResponse.json({ item: { id: item.id, title: item.title } }, { status: 201 });
}
