/**
 * RegLayer — Knowledge Base API
 *
 * GET    /api/knowledge         — List documents in workspace
 * POST   /api/knowledge         — Upload text content (create + process)
 * DELETE /api/knowledge?id=X    — Delete a document + its chunks
 */

import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth/config";
import { requireWorkspacePermission } from "@/lib/auth/api-guard";
import { createDocument, listDocuments, deleteDocument, processDocument } from "@/lib/ai/knowledge/service";
import { z } from "zod";

const uploadSchema = z.object({
  title: z.string().min(1).max(200),
  content: z.string().min(10).max(500_000), // ~125K tokens max
  source: z.string().max(500).default("manual-upload"),
  mimeType: z.string().max(100).default("text/plain"),
});

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const perm = await requireWorkspacePermission("settings.manage");
  if (!perm.ok) return perm.response;

  if (!perm.ctx.workspaceId) return NextResponse.json({ documents: [] });

  const documents = await listDocuments(perm.ctx.workspaceId);
  return NextResponse.json({ documents });
}

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

  const parsed = uploadSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten().fieldErrors }, { status: 400 });
  }

  const { title, content, source, mimeType } = parsed.data;

  // Create the document record
  const doc = await createDocument({
    title,
    source,
    mimeType,
    sizeBytes: new Blob([content]).size,
    workspaceId: perm.ctx.workspaceId,
    uploadedBy: perm.ctx.userId,
  });

  // Process async (chunk + embed) — best-effort, don't block the response
  processDocument(doc.id, content).catch(() => {
    // Processing failure is recorded on the document record (status: FAILED)
  });

  return NextResponse.json({ document: doc }, { status: 201 });
}

export async function DELETE(request: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const perm = await requireWorkspacePermission("settings.manage");
  if (!perm.ok) return perm.response;

  if (!perm.ctx.workspaceId) {
    return NextResponse.json({ error: "Workspace not found" }, { status: 404 });
  }

  const url = new URL(request.url);
  const id = url.searchParams.get("id");
  if (!id) return NextResponse.json({ error: "Missing id" }, { status: 400 });

  const deleted = await deleteDocument(id, perm.ctx.workspaceId);
  if (!deleted) return NextResponse.json({ error: "Not found" }, { status: 404 });

  return NextResponse.json({ deleted: true });
}
