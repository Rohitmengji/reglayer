/**
 * ---------------------------------------------------------
 * RegLayer — PDF Report Generation API
 * ---------------------------------------------------------
 *
 * Purpose:
 * Generates downloadable PDF compliance reports from scan data.
 *
 * Why this exists:
 * Enterprise compliance requires shareable, printable reports
 * for auditors, legal teams, and stakeholders who don't use
 * the platform directly.
 *
 * Engineering Notes:
 * - Accepts scan result as POST body (client sends stored data)
 * - Generates PDF server-side using jsPDF
 * - Returns PDF as downloadable binary response
 * ---------------------------------------------------------
 */

import { NextRequest, NextResponse } from "next/server";
import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";
import type { ScanResult, ComplianceReport } from "@/lib/types";

interface ReportRequest {
  scan: ScanResult;
  compliance: ComplianceReport;
}

export async function POST(request: NextRequest) {
  try {
    const body: ReportRequest = await request.json();
    const { scan, compliance } = body;

    const doc = new jsPDF();

    // Header
    doc.setFontSize(20);
    doc.setFont("helvetica", "bold");
    doc.text("RegLayer Compliance Report", 20, 25);

    doc.setFontSize(10);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(100);
    doc.text("Developer-native compliance infrastructure", 20, 32);

    // Scan Info
    doc.setDrawColor(200);
    doc.line(20, 38, 190, 38);

    doc.setFontSize(11);
    doc.setTextColor(0);
    doc.setFont("helvetica", "bold");
    doc.text("Scan Summary", 20, 48);

    doc.setFont("helvetica", "normal");
    doc.setFontSize(9);
    const info = [
      `URL: ${scan.url}`,
      `Page Title: ${scan.metadata.pageTitle}`,
      `Scan Date: ${new Date(scan.timestamp).toLocaleString()}`,
      `Duration: ${scan.metadata.scanDuration}ms`,
      `Compliance Score: ${scan.summary.score}/100`,
      `Overall Compliance: ${compliance.overallCompliance}%`,
    ];
    info.forEach((line, i) => {
      doc.text(line, 20, 56 + i * 6);
    });

    // Severity Summary
    doc.setFont("helvetica", "bold");
    doc.setFontSize(11);
    doc.text("Violation Summary", 20, 98);

    autoTable(doc, {
      startY: 104,
      head: [["Severity", "Count"]],
      body: [
        ["Critical", String(scan.summary.critical)],
        ["Serious", String(scan.summary.serious)],
        ["Moderate", String(scan.summary.moderate)],
        ["Minor", String(scan.summary.minor)],
        ["Total", String(scan.summary.totalViolations)],
      ],
      theme: "grid",
      headStyles: { fillColor: [23, 23, 23] },
      margin: { left: 20 },
    });

    // Compliance Rules
    const rulesY = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 15;
    doc.setFont("helvetica", "bold");
    doc.setFontSize(11);
    doc.text("Compliance Rules", 20, rulesY);

    autoTable(doc, {
      startY: rulesY + 6,
      head: [["Rule", "Regulation", "Status"]],
      body: compliance.ruleResults.map((r) => [
        r.rule.name,
        r.rule.regulation,
        r.passed ? "PASS" : "FAIL",
      ]),
      theme: "grid",
      headStyles: { fillColor: [23, 23, 23] },
      margin: { left: 20 },
      bodyStyles: { fontSize: 8 },
    });

    // Violations Detail
    if (scan.violations.length > 0) {
      doc.addPage();
      doc.setFont("helvetica", "bold");
      doc.setFontSize(11);
      doc.text("Violation Details", 20, 25);

      autoTable(doc, {
        startY: 32,
        head: [["ID", "Impact", "Description", "Elements"]],
        body: scan.violations.map((v) => [
          v.id,
          v.impact,
          v.help,
          String(v.nodes.length),
        ]),
        theme: "grid",
        headStyles: { fillColor: [23, 23, 23] },
        margin: { left: 20 },
        bodyStyles: { fontSize: 7 },
        columnStyles: {
          2: { cellWidth: 80 },
        },
      });
    }

    // Footer
    const pageCount = doc.getNumberOfPages();
    for (let i = 1; i <= pageCount; i++) {
      doc.setPage(i);
      doc.setFontSize(8);
      doc.setTextColor(150);
      doc.text(
        `RegLayer Accessibility Scanner — Page ${i} of ${pageCount}`,
        20,
        doc.internal.pageSize.height - 10
      );
      doc.text(
        `Generated: ${new Date().toISOString()}`,
        120,
        doc.internal.pageSize.height - 10
      );
    }

    const pdfBuffer = Buffer.from(doc.output("arraybuffer"));

    return new NextResponse(pdfBuffer, {
      status: 200,
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="reglayer-report-${scan.id}.pdf"`,
      },
    });
  } catch {
    return NextResponse.json(
      { error: "Failed to generate report" },
      { status: 500 }
    );
  }
}
