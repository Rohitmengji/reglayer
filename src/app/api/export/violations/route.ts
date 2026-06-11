/**
 * RegLayer — Bulk Violations Export API
 *
 * WHY: Users need to export all violations across scans for compliance reports,
 *      executive reviews, and external tooling (Excel, Sheets, Jira import).
 * WHAT: GET /api/export/violations — Exports violations as CSV, JSON, or XLSX.
 * HOW: Queries violations with filters, serializes to requested format.
 *      XLSX uses minimal Office Open XML (no external dependency).
 */

import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth/config";
import { prisma } from "@/lib/database/prisma";
import { applyRateLimit } from "@/lib/rate-limit-middleware";

/**
 * GET /api/export/violations
 *
 * Query params:
 *   format: csv | json | xlsx (default: csv)
 *   impact: critical | serious | moderate | minor (optional filter)
 *   status: open | fixed | ignored | in_progress (optional filter)
 *   scanId: specific scan ID (optional)
 *   from: ISO date string — filter scans after this date
 *   to: ISO date string — filter scans before this date
 *   limit: max rows (default: 5000, max: 10000)
 */
export async function GET(request: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) {
    return NextResponse.json({ error: "Authentication required" }, { status: 401 });
  }

  const blocked = await applyRateLimit(request, "api");
  if (blocked) return blocked;

  const url = request.nextUrl;
  const format = url.searchParams.get("format") || "csv";
  const impact = url.searchParams.get("impact");
  const status = url.searchParams.get("status");
  const scanId = url.searchParams.get("scanId");
  const from = url.searchParams.get("from");
  const to = url.searchParams.get("to");
  const limit = Math.min(parseInt(url.searchParams.get("limit") || "5000"), 10000);

  if (!["csv", "json", "xlsx"].includes(format)) {
    return NextResponse.json({ error: "format must be csv, json, or xlsx" }, { status: 400 });
  }

  // Get user's workspace
  const user = await prisma.user.findUnique({
    where: { email: session.user.email },
    select: { id: true, isMasterAdmin: true, memberships: { select: { workspaceId: true }, take: 1 } },
  });

  if (!user) {
    return NextResponse.json({ error: "User not found" }, { status: 404 });
  }

  const workspaceId = user.memberships[0]?.workspaceId;

  // Scope: users see only their own scans; master admins see all workspace scans
  const scanScope = user.isMasterAdmin && workspaceId
    ? { workspaceId }
    : { userId: user.id };

  // Build where clause
  const where: Record<string, unknown> = {
    scan: scanScope,
  };

  if (impact) where.impact = impact;
  if (status) where.status = status;
  if (scanId) where.scanId = scanId;
  if (from || to) {
    const scanDateFilter: Record<string, unknown> = {};
    if (from) scanDateFilter.gte = new Date(from);
    if (to) scanDateFilter.lte = new Date(to);
    where.scan = { ...((where.scan as Record<string, unknown>) || {}), createdAt: scanDateFilter };
  }

  const violations = await prisma.violation.findMany({
    where,
    include: {
      scan: {
        select: { url: true, id: true, createdAt: true, score: true },
      },
    },
    orderBy: { scan: { createdAt: "desc" } },
    take: limit,
  });

  const timestamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);

  if (format === "json") {
    return NextResponse.json({
      exportedAt: new Date().toISOString(),
      total: violations.length,
      filters: { impact, status, scanId, from, to },
      violations: violations.map((v) => ({
        ruleId: v.ruleId,
        impact: v.impact,
        description: v.description,
        help: v.help,
        helpUrl: v.helpUrl,
        wcagCriteria: v.wcagCriteria,
        wcagLevel: v.wcagLevel,
        status: v.status,
        scanUrl: v.scan.url,
        scanId: v.scan.id,
        scanScore: v.scan.score,
        scanDate: v.scan.createdAt,
      })),
    });
  }

  // CSV & XLSX share the same row data
  const headers = [
    "Rule ID",
    "Impact",
    "WCAG Criteria",
    "WCAG Level",
    "Description",
    "Help",
    "Help URL",
    "Status",
    "Scan URL",
    "Scan Score",
    "Scan Date",
  ];

  const rows = violations.map((v) => [
    v.ruleId,
    v.impact || "",
    v.wcagCriteria || "",
    v.wcagLevel || "",
    (v.description || "").replace(/[\r\n]+/g, " "),
    (v.help || "").replace(/[\r\n]+/g, " "),
    v.helpUrl || "",
    v.status || "OPEN",
    v.scan.url,
    String(v.scan.score ?? ""),
    v.scan.createdAt ? new Date(v.scan.createdAt).toISOString().slice(0, 10) : "",
  ]);

  if (format === "csv") {
    const escapeCsv = (val: string) => {
      if (val.includes(",") || val.includes('"') || val.includes("\n")) {
        return `"${val.replace(/"/g, '""')}"`;
      }
      return val;
    };

    const csv = [
      headers.map(escapeCsv).join(","),
      ...rows.map((row) => row.map(escapeCsv).join(",")),
    ].join("\n");

    return new NextResponse(csv, {
      headers: {
        "Content-Type": "text/csv",
        "Content-Disposition": `attachment; filename="reglayer-violations-${timestamp}.csv"`,
      },
    });
  }

  // XLSX format — minimal Office Open XML
  if (format === "xlsx") {
    const xlsx = generateXlsx(headers, rows);
    return new Response(xlsx, {
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename="reglayer-violations-${timestamp}.xlsx"`,
      },
    });
  }

  return NextResponse.json({ error: "Unsupported format" }, { status: 400 });
}

// ─── Minimal XLSX Generator (No Dependencies) ─────────────────

function generateXlsx(headers: string[], rows: string[][]): Uint8Array<ArrayBuffer> {
  const escapeXml = (s: string) =>
    s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

  // Build shared strings (unique values for compression)
  const allValues = [...headers, ...rows.flat()];
  const uniqueStrings = [...new Set(allValues)];
  const stringIndex = new Map(uniqueStrings.map((s, i) => [s, i]));

  // Shared strings XML
  const sharedStringsXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<sst xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" count="${allValues.length}" uniqueCount="${uniqueStrings.length}">
${uniqueStrings.map((s) => `<si><t>${escapeXml(s)}</t></si>`).join("\n")}
</sst>`;

  // Sheet data with shared string references
  let sheetData = "";
  // Header row
  sheetData += "<row r=\"1\">";
  for (let c = 0; c < headers.length; c++) {
    const ref = colRef(c) + "1";
    sheetData += `<c r="${ref}" t="s"><v>${stringIndex.get(headers[c])}</v></c>`;
  }
  sheetData += "</row>";
  // Data rows
  for (let r = 0; r < rows.length; r++) {
    const rowNum = r + 2;
    sheetData += `<row r="${rowNum}">`;
    for (let c = 0; c < rows[r].length; c++) {
      const ref = colRef(c) + rowNum;
      sheetData += `<c r="${ref}" t="s"><v>${stringIndex.get(rows[r][c])}</v></c>`;
    }
    sheetData += "</row>";
  }

  const sheet1Xml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
<sheetData>${sheetData}</sheetData>
</worksheet>`;

  const workbookXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
<sheets><sheet name="Violations" sheetId="1" r:id="rId1"/></sheets>
</workbook>`;

  const workbookRelsXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/>
<Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/sharedStrings" Target="sharedStrings.xml"/>
</Relationships>`;

  const contentTypesXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
<Default Extension="xml" ContentType="application/xml"/>
<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>
<Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>
<Override PartName="/xl/sharedStrings.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sharedStrings+xml"/>
</Types>`;

  const relsXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>
</Relationships>`;

  // Build ZIP file (minimal implementation for XLSX)
  return buildZip([
    { path: "[Content_Types].xml", data: contentTypesXml },
    { path: "_rels/.rels", data: relsXml },
    { path: "xl/workbook.xml", data: workbookXml },
    { path: "xl/_rels/workbook.xml.rels", data: workbookRelsXml },
    { path: "xl/worksheets/sheet1.xml", data: sheet1Xml },
    { path: "xl/sharedStrings.xml", data: sharedStringsXml },
  ]);
}

function colRef(index: number): string {
  let result = "";
  let n = index;
  while (n >= 0) {
    result = String.fromCharCode(65 + (n % 26)) + result;
    n = Math.floor(n / 26) - 1;
  }
  return result;
}

// ─── Minimal ZIP Builder (Store method, no compression) ────────

interface ZipEntry {
  path: string;
  data: string;
}

function buildZip(entries: ZipEntry[]): Uint8Array<ArrayBuffer> {
  const textEncoder = new TextEncoder();
  const parts: Uint8Array[] = [];
  const centralDir: Uint8Array[] = [];
  let offset = 0;

  for (const entry of entries) {
    const fileData = textEncoder.encode(entry.data);
    const fileName = textEncoder.encode(entry.path);
    const crc = crc32(fileData);

    // Local file header
    const localHeader = new Uint8Array(30 + fileName.length);
    const lhView = new DataView(localHeader.buffer);
    lhView.setUint32(0, 0x04034b50, true); // Local file header signature
    lhView.setUint16(4, 20, true); // Version needed
    lhView.setUint16(6, 0, true); // Flags
    lhView.setUint16(8, 0, true); // Compression (store)
    lhView.setUint16(10, 0, true); // Mod time
    lhView.setUint16(12, 0, true); // Mod date
    lhView.setUint32(14, crc, true); // CRC-32
    lhView.setUint32(18, fileData.length, true); // Compressed size
    lhView.setUint32(22, fileData.length, true); // Uncompressed size
    lhView.setUint16(26, fileName.length, true); // File name length
    lhView.setUint16(28, 0, true); // Extra field length
    localHeader.set(fileName, 30);

    parts.push(localHeader);
    parts.push(fileData);

    // Central directory entry
    const cdEntry = new Uint8Array(46 + fileName.length);
    const cdView = new DataView(cdEntry.buffer);
    cdView.setUint32(0, 0x02014b50, true); // Central dir signature
    cdView.setUint16(4, 20, true); // Version made by
    cdView.setUint16(6, 20, true); // Version needed
    cdView.setUint16(8, 0, true); // Flags
    cdView.setUint16(10, 0, true); // Compression
    cdView.setUint16(12, 0, true); // Mod time
    cdView.setUint16(14, 0, true); // Mod date
    cdView.setUint32(16, crc, true); // CRC-32
    cdView.setUint32(20, fileData.length, true); // Compressed size
    cdView.setUint32(24, fileData.length, true); // Uncompressed size
    cdView.setUint16(28, fileName.length, true); // File name length
    cdView.setUint16(30, 0, true); // Extra field length
    cdView.setUint16(32, 0, true); // Comment length
    cdView.setUint16(34, 0, true); // Disk number start
    cdView.setUint16(36, 0, true); // Internal attributes
    cdView.setUint32(38, 0, true); // External attributes
    cdView.setUint32(42, offset, true); // Offset to local header
    cdEntry.set(fileName, 46);

    centralDir.push(cdEntry);
    offset += localHeader.length + fileData.length;
  }

  // Append central directory
  const cdOffset = offset;
  let cdSize = 0;
  for (const cd of centralDir) {
    parts.push(cd);
    cdSize += cd.length;
  }

  // End of central directory
  const eocd = new Uint8Array(22);
  const eocdView = new DataView(eocd.buffer);
  eocdView.setUint32(0, 0x06054b50, true); // EOCD signature
  eocdView.setUint16(4, 0, true); // Disk number
  eocdView.setUint16(6, 0, true); // Disk with CD
  eocdView.setUint16(8, entries.length, true); // Entries on disk
  eocdView.setUint16(10, entries.length, true); // Total entries
  eocdView.setUint32(12, cdSize, true); // CD size
  eocdView.setUint32(16, cdOffset, true); // CD offset
  eocdView.setUint16(20, 0, true); // Comment length
  parts.push(eocd);

  // Concatenate all parts
  const totalLength = parts.reduce((sum, p) => sum + p.length, 0);
  const result = new Uint8Array(totalLength);
  let pos = 0;
  for (const part of parts) {
    result.set(part, pos);
    pos += part.length;
  }

  return result;
}

// CRC-32 (standard polynomial)
function crc32(data: Uint8Array): number {
  let crc = 0xffffffff;
  for (let i = 0; i < data.length; i++) {
    crc ^= data[i];
    for (let j = 0; j < 8; j++) {
      crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0);
    }
  }
  return (crc ^ 0xffffffff) >>> 0;
}
