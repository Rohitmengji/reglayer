import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth/config";
import { prisma } from "@/lib/database/prisma";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    const scan = await prisma.scan.findUnique({
      where: { id },
      include: { violations: true },
    });

    if (!scan) {
      return NextResponse.json({ error: "Scan not found" }, { status: 404 });
    }

    return NextResponse.json({ scan });
  } catch {
    return NextResponse.json({ error: "Failed to load scan" }, { status: 500 });
  }
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getServerSession(authOptions);
  const role = (session?.user as unknown as { role?: string })?.role;

  if (!session || role !== "admin") {
    return NextResponse.json(
      { error: "Forbidden: only admins can delete scans" },
      { status: 403 }
    );
  }

  const { id } = await params;

  const scan = await prisma.scan.findUnique({ where: { id } });
  if (!scan) {
    return NextResponse.json({ error: "Scan not found" }, { status: 404 });
  }

  // Delete violations first, then the scan
  await prisma.violation.deleteMany({ where: { scanId: id } });
  await prisma.scan.delete({ where: { id } });

  return NextResponse.json({ deleted: true, id });
}
