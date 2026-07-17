/**
 * RegLayer — Knowledge Base File Upload API
 *
 * POST /api/knowledge/upload — Upload PDF/text files for knowledge base processing
 *
 * Supports: PDF, TXT, MD, CSV
 * Max size: 10MB
 */

import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth/config";
import { requireWorkspacePermission } from "@/lib/auth/api-guard";
import { createDocument, processDocument } from "@/lib/ai/knowledge/service";
import { PDFParse } from "pdf-parse";

const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB
const ALLOWED_TYPES = new Set([
  "application/pdf",
  "text/plain",
  "text/markdown",
  "text/csv",
]);

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

  let formData: FormData;
  try {
    formData = await request.formData();
  } catch {
    return NextResponse.json({ error: "Invalid form data" }, { status: 400 });
  }

  const file = formData.get("file") as File | null;
  if (!file) {
    return NextResponse.json({ error: "No file provided" }, { status: 400 });
  }

  // Validate file size
  if (file.size > MAX_FILE_SIZE) {
    return NextResponse.json({ error: "File too large (max 10MB)" }, { status: 400 });
  }

  // Validate MIME type
  const mimeType = file.type || "application/octet-stream";
  if (!ALLOWED_TYPES.has(mimeType)) {
    return NextResponse.json(
      { error: `Unsupported file type: ${mimeType}. Supported: PDF, TXT, MD, CSV` },
      { status: 400 },
    );
  }

  // Extract text content based on file type
  let textContent: string;
  try {
    const buffer = Buffer.from(await file.arrayBuffer());

    if (mimeType === "application/pdf") {
      const pdf = new PDFParse({ data: buffer });
      const pdfData = await pdf.getText();
      textContent = pdfData.text;
    } else {
      // Text-based files (TXT, MD, CSV)
      textContent = buffer.toString("utf-8");
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to parse file";
    return NextResponse.json({ error: `File parsing failed: ${message}` }, { status: 422 });
  }

  if (!textContent.trim() || textContent.trim().length < 10) {
    return NextResponse.json({ error: "File contains no extractable text" }, { status: 422 });
  }

  // Determine title from filename or form field
  const title = (formData.get("title") as string)?.trim() || file.name.replace(/\.[^.]+$/, "");

  // Create document record
  const doc = await createDocument({
    title,
    source: `file-upload:${file.name}`,
    mimeType,
    sizeBytes: file.size,
    workspaceId: perm.ctx.workspaceId,
    uploadedBy: perm.ctx.userId,
  });

  // Process async (chunk + embed)
  processDocument(doc.id, textContent).catch(() => {
    // Processing failure is recorded on the document record
  });

  return NextResponse.json({
    document: doc,
    extractedLength: textContent.length,
    estimatedTokens: Math.ceil(textContent.length / 4),
  }, { status: 201 });
}
