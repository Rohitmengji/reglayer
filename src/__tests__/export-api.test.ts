import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

vi.mock("next-auth", () => ({
  getServerSession: vi.fn(),
}));

vi.mock("@/lib/auth/config", () => ({
  authOptions: {},
}));

vi.mock("@/lib/database/prisma", () => ({
  prisma: {
    scan: {
      findUnique: vi.fn(),
    },
  },
}));

import { getServerSession } from "next-auth";
import { prisma } from "@/lib/database/prisma";
import { GET } from "@/app/api/scans/[id]/export/route";

function makeRequest(format?: string): NextRequest {
  const url = format
    ? `http://localhost:3000/api/scans/scan_123/export?format=${format}`
    : "http://localhost:3000/api/scans/scan_123/export";
  return new NextRequest(url, { method: "GET" });
}

const mockScan = {
  id: "scan_123",
  url: "https://example.com",
  score: 85,
  createdAt: new Date("2025-01-01"),
  totalViolations: 2,
  violations: [
    {
      ruleId: "color-contrast",
      impact: "serious",
      description: "Elements must meet contrast ratio",
      help: "Ensure contrast",
      helpUrl: "https://deque.com/rules/color-contrast",
      wcagCriteria: "1.4.3",
      wcagLevel: "AA",
      tags: ["wcag2aa", "wcag143"],
    },
    {
      ruleId: "image-alt",
      impact: "critical",
      description: "Images must have alt text",
      help: "Add alt text",
      helpUrl: "https://deque.com/rules/image-alt",
      wcagCriteria: "1.1.1",
      wcagLevel: "A",
      tags: ["wcag2a", "wcag111"],
    },
  ],
};

describe("GET /api/scans/[id]/export", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns 401 when not authenticated", async () => {
    vi.mocked(getServerSession).mockResolvedValue(null);

    const req = makeRequest();
    const res = await GET(req as any, { params: Promise.resolve({ id: "scan_123" }) });

    expect(res.status).toBe(401);
  });

  it("returns 404 when scan not found", async () => {
    vi.mocked(getServerSession).mockResolvedValue({
      user: { email: "user@test.com" },
    } as any);
    vi.mocked(prisma.scan.findUnique).mockResolvedValue(null);

    const req = makeRequest();
    const res = await GET(req as any, { params: Promise.resolve({ id: "nonexistent" }) });

    expect(res.status).toBe(404);
  });

  it("returns JSON export by default", async () => {
    vi.mocked(getServerSession).mockResolvedValue({
      user: { email: "user@test.com" },
    } as any);
    vi.mocked(prisma.scan.findUnique).mockResolvedValue(mockScan as any);

    const req = makeRequest();
    const res = await GET(req as any, { params: Promise.resolve({ id: "scan_123" }) });

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.scan.id).toBe("scan_123");
    expect(body.violations).toHaveLength(2);
    expect(body.violations[0].ruleId).toBe("color-contrast");
  });

  it("returns JSON export when format=json", async () => {
    vi.mocked(getServerSession).mockResolvedValue({
      user: { email: "user@test.com" },
    } as any);
    vi.mocked(prisma.scan.findUnique).mockResolvedValue(mockScan as any);

    const req = makeRequest("json");
    const res = await GET(req as any, { params: Promise.resolve({ id: "scan_123" }) });

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.scan.url).toBe("https://example.com");
  });

  it("returns CSV export when format=csv", async () => {
    vi.mocked(getServerSession).mockResolvedValue({
      user: { email: "user@test.com" },
    } as any);
    vi.mocked(prisma.scan.findUnique).mockResolvedValue(mockScan as any);

    const req = makeRequest("csv");
    const res = await GET(req as any, { params: Promise.resolve({ id: "scan_123" }) });

    expect(res.headers.get("Content-Type")).toBe("text/csv");
    expect(res.headers.get("Content-Disposition")).toContain("scan_123");

    const csv = await res.text();
    expect(csv).toContain("Rule ID");
    expect(csv).toContain("color-contrast");
    expect(csv).toContain("image-alt");
  });

  it("CSV has correct number of rows", async () => {
    vi.mocked(getServerSession).mockResolvedValue({
      user: { email: "user@test.com" },
    } as any);
    vi.mocked(prisma.scan.findUnique).mockResolvedValue(mockScan as any);

    const req = makeRequest("csv");
    const res = await GET(req as any, { params: Promise.resolve({ id: "scan_123" }) });

    const csv = await res.text();
    const lines = csv.trim().split("\n");
    // 1 header + 2 violation rows
    expect(lines).toHaveLength(3);
  });
});
