/**
 * RegLayer — Scan Export API
 *
 * WHY: Users need to export scan results for external tools or reporting.
 * WHAT: GET returns scan data as CSV or JSON (format query param).
 * HOW: Serializes scan violations into requested format with proper Content-Type headers.
 */
import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth/config";
import { assertScanAccess } from "@/lib/auth/access";
import { prisma } from "@/lib/database/prisma";

/**
 * GET /api/scans/:id/export
 * 
 * Export scan violations in CSV or JSON format.
 * Query: ?format=csv|json (default: json)
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) {
    return NextResponse.json({ error: "Authentication required" }, { status: 401 });
  }

  const { id } = await params;
  const format = request.nextUrl.searchParams.get("format") || "json";

  // IDOR guard: only the scan's owner/workspace may export its data.
  const access = await assertScanAccess(id, session);
  if (!access.ok) {
    return NextResponse.json({ error: access.error }, { status: access.status });
  }

  const scan = await prisma.scan.findUnique({
    where: { id },
    include: {
      violations: {
        select: {
          ruleId: true,
          impact: true,
          description: true,
          help: true,
          helpUrl: true,
          wcagCriteria: true,
          wcagLevel: true,
          tags: true,
        },
      },
    },
  });

  if (!scan) {
    return NextResponse.json({ error: "Scan not found" }, { status: 404 });
  }

  const headers = ["Rule ID", "Impact", "Description", "WCAG Criteria", "WCAG Level", "Help URL", "Tags"];
  const rows = scan.violations.map((v) => [
    v.ruleId,
    v.impact || "",
    (v.description || "").replace(/[\r\n]+/g, " "),
    v.wcagCriteria || "",
    v.wcagLevel || "",
    v.helpUrl || "",
    (v.tags || []).join("; "),
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
      ...rows.map((r) => r.map(escapeCsv).join(",")),
    ].join("\n");

    return new NextResponse(csv, {
      headers: {
        "Content-Type": "text/csv",
        "Content-Disposition": `attachment; filename="reglayer-${id}-violations.csv"`,
      },
    });
  }

  if (format === "xlsx") {
    const xlsx = generateMinimalXlsx(headers, rows);
    return new Response(xlsx, {
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename="reglayer-${id}-violations.xlsx"`,
      },
    });
  }

  // JSON format (default)
  return NextResponse.json({
    scan: {
      id: scan.id,
      url: scan.url,
      score: scan.score,
      scannedAt: scan.createdAt,
      totalViolations: scan.totalViolations,
    },
    violations: scan.violations,
  });
}

// ─── Minimal XLSX (inline, no deps) ───────────────────────────

function generateMinimalXlsx(headers: string[], rows: string[][]): Uint8Array<ArrayBuffer> {
  const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  const col = (i: number): string => { let r = "", n = i; while (n >= 0) { r = String.fromCharCode(65 + (n % 26)) + r; n = Math.floor(n / 26) - 1; } return r; };

  const allVals = [...headers, ...rows.flat()];
  const uniq = [...new Set(allVals)];
  const idx = new Map(uniq.map((s, i) => [s, i]));

  const ss = `<?xml version="1.0" encoding="UTF-8"?><sst xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" count="${allVals.length}" uniqueCount="${uniq.length}">${uniq.map(s => `<si><t>${esc(s)}</t></si>`).join("")}</sst>`;

  let sd = `<row r="1">${headers.map((h, c) => `<c r="${col(c)}1" t="s"><v>${idx.get(h)}</v></c>`).join("")}</row>`;
  rows.forEach((row, r) => { sd += `<row r="${r+2}">${row.map((v, c) => `<c r="${col(c)}${r+2}" t="s"><v>${idx.get(v)}</v></c>`).join("")}</row>`; });

  const ws = `<?xml version="1.0" encoding="UTF-8"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData>${sd}</sheetData></worksheet>`;
  const wb = `<?xml version="1.0" encoding="UTF-8"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="Violations" sheetId="1" r:id="rId1"/></sheets></workbook>`;
  const wbr = `<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/sharedStrings" Target="sharedStrings.xml"/></Relationships>`;
  const ct = `<?xml version="1.0" encoding="UTF-8"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/><Override PartName="/xl/sharedStrings.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sharedStrings+xml"/></Types>`;
  const rels = `<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>`;

  return buildZipBuffer([
    { path: "[Content_Types].xml", data: ct },
    { path: "_rels/.rels", data: rels },
    { path: "xl/workbook.xml", data: wb },
    { path: "xl/_rels/workbook.xml.rels", data: wbr },
    { path: "xl/worksheets/sheet1.xml", data: ws },
    { path: "xl/sharedStrings.xml", data: ss },
  ]);
}

function buildZipBuffer(entries: { path: string; data: string }[]): Uint8Array<ArrayBuffer> {
  const enc = new TextEncoder();
  const parts: Uint8Array[] = [];
  const cds: Uint8Array[] = [];
  let off = 0;

  for (const e of entries) {
    const fd = enc.encode(e.data);
    const fn = enc.encode(e.path);
    const crc = crc32b(fd);
    const lh = new Uint8Array(30 + fn.length);
    const lv = new DataView(lh.buffer);
    lv.setUint32(0, 0x04034b50, true);
    lv.setUint16(4, 20, true);
    lv.setUint16(8, 0, true);
    lv.setUint32(14, crc, true);
    lv.setUint32(18, fd.length, true);
    lv.setUint32(22, fd.length, true);
    lv.setUint16(26, fn.length, true);
    lh.set(fn, 30);
    parts.push(lh, fd);

    const cd = new Uint8Array(46 + fn.length);
    const cv = new DataView(cd.buffer);
    cv.setUint32(0, 0x02014b50, true);
    cv.setUint16(4, 20, true);
    cv.setUint16(6, 20, true);
    cv.setUint16(10, 0, true);
    cv.setUint32(16, crc, true);
    cv.setUint32(20, fd.length, true);
    cv.setUint32(24, fd.length, true);
    cv.setUint16(28, fn.length, true);
    cv.setUint32(42, off, true);
    cd.set(fn, 46);
    cds.push(cd);
    off += lh.length + fd.length;
  }

  let cdSize = 0;
  for (const cd of cds) { parts.push(cd); cdSize += cd.length; }
  const eocd = new Uint8Array(22);
  const ev = new DataView(eocd.buffer);
  ev.setUint32(0, 0x06054b50, true);
  ev.setUint16(8, entries.length, true);
  ev.setUint16(10, entries.length, true);
  ev.setUint32(12, cdSize, true);
  ev.setUint32(16, off, true);
  parts.push(eocd);

  const total = parts.reduce((s, p) => s + p.length, 0);
  const buf = new Uint8Array(total);
  let pos = 0;
  for (const p of parts) { buf.set(p, pos); pos += p.length; }
  return buf;
}

function crc32b(data: Uint8Array): number {
  let crc = 0xffffffff;
  for (let i = 0; i < data.length; i++) {
    crc ^= data[i];
    for (let j = 0; j < 8; j++) crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0);
  }
  return (crc ^ 0xffffffff) >>> 0;
}
