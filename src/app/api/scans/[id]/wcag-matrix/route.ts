/**
 * RegLayer — WCAG Matrix API
 *
 * WHY: Compliance officers need to see pass/fail status for each WCAG criterion.
 * WHAT: GET returns a matrix of all WCAG 2.1 AA criteria with pass/fail per scan.
 * HOW: Maps scan violations to WCAG success criteria, marks each as pass/fail/not-applicable.
 */
import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth/config";
import { assertScanAccess } from "@/lib/auth/access";
import { prisma } from "@/lib/database/prisma";

/**
 * GET /api/scans/:id/wcag-matrix
 * 
 * Returns a WCAG compliance matrix showing pass/fail status
 * for each WCAG criterion based on scan violations.
 */
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) {
    return NextResponse.json({ error: "Authentication required" }, { status: 401 });
  }

  const { id } = await params;

  // IDOR guard: only the scan's owner/workspace may read its compliance matrix.
  const access = await assertScanAccess(id, session);
  if (!access.ok) {
    return NextResponse.json({ error: access.error }, { status: access.status });
  }

  const scan = await prisma.scan.findUnique({
    where: { id },
    include: { violations: { select: { tags: true, impact: true, ruleId: true, wcagCriteria: true, wcagLevel: true } } },
  });

  if (!scan) {
    return NextResponse.json({ error: "Scan not found" }, { status: 404 });
  }

  // Build matrix from WCAG 2.1 criteria
  const matrix = buildWcagMatrix(scan.violations);

  return NextResponse.json({
    scanId: id,
    url: scan.url,
    score: scan.score,
    matrix,
    summary: {
      total: matrix.length,
      passed: matrix.filter((c) => c.status === "pass").length,
      failed: matrix.filter((c) => c.status === "fail").length,
      notTested: matrix.filter((c) => c.status === "not-tested").length,
    },
  });
}

interface ViolationRow {
  tags: string[];
  impact: string;
  ruleId: string;
  wcagCriteria: string | null;
  wcagLevel: string | null;
}

interface MatrixEntry {
  criterion: string;
  level: string;
  principle: string;
  title: string;
  status: "pass" | "fail" | "not-tested";
  violations: string[];
  impact: string | null;
}

// WCAG 2.1 criteria with principles
const WCAG_CRITERIA: Array<{ criterion: string; level: string; principle: string; title: string }> = [
  // Perceivable
  { criterion: "1.1.1", level: "A", principle: "Perceivable", title: "Non-text Content" },
  { criterion: "1.2.1", level: "A", principle: "Perceivable", title: "Audio-only and Video-only" },
  { criterion: "1.2.2", level: "A", principle: "Perceivable", title: "Captions (Prerecorded)" },
  { criterion: "1.2.3", level: "A", principle: "Perceivable", title: "Audio Description or Media Alternative" },
  { criterion: "1.2.5", level: "AA", principle: "Perceivable", title: "Audio Description (Prerecorded)" },
  { criterion: "1.3.1", level: "A", principle: "Perceivable", title: "Info and Relationships" },
  { criterion: "1.3.2", level: "A", principle: "Perceivable", title: "Meaningful Sequence" },
  { criterion: "1.3.3", level: "A", principle: "Perceivable", title: "Sensory Characteristics" },
  { criterion: "1.3.4", level: "AA", principle: "Perceivable", title: "Orientation" },
  { criterion: "1.3.5", level: "AA", principle: "Perceivable", title: "Identify Input Purpose" },
  { criterion: "1.4.1", level: "A", principle: "Perceivable", title: "Use of Color" },
  { criterion: "1.4.2", level: "A", principle: "Perceivable", title: "Audio Control" },
  { criterion: "1.4.3", level: "AA", principle: "Perceivable", title: "Contrast (Minimum)" },
  { criterion: "1.4.4", level: "AA", principle: "Perceivable", title: "Resize Text" },
  { criterion: "1.4.5", level: "AA", principle: "Perceivable", title: "Images of Text" },
  { criterion: "1.4.10", level: "AA", principle: "Perceivable", title: "Reflow" },
  { criterion: "1.4.11", level: "AA", principle: "Perceivable", title: "Non-text Contrast" },
  { criterion: "1.4.12", level: "AA", principle: "Perceivable", title: "Text Spacing" },
  { criterion: "1.4.13", level: "AA", principle: "Perceivable", title: "Content on Hover or Focus" },
  // Operable
  { criterion: "2.1.1", level: "A", principle: "Operable", title: "Keyboard" },
  { criterion: "2.1.2", level: "A", principle: "Operable", title: "No Keyboard Trap" },
  { criterion: "2.1.4", level: "A", principle: "Operable", title: "Character Key Shortcuts" },
  { criterion: "2.2.1", level: "A", principle: "Operable", title: "Timing Adjustable" },
  { criterion: "2.2.2", level: "A", principle: "Operable", title: "Pause, Stop, Hide" },
  { criterion: "2.3.1", level: "A", principle: "Operable", title: "Three Flashes or Below" },
  { criterion: "2.4.1", level: "A", principle: "Operable", title: "Bypass Blocks" },
  { criterion: "2.4.2", level: "A", principle: "Operable", title: "Page Titled" },
  { criterion: "2.4.3", level: "A", principle: "Operable", title: "Focus Order" },
  { criterion: "2.4.4", level: "A", principle: "Operable", title: "Link Purpose (In Context)" },
  { criterion: "2.4.5", level: "AA", principle: "Operable", title: "Multiple Ways" },
  { criterion: "2.4.6", level: "AA", principle: "Operable", title: "Headings and Labels" },
  { criterion: "2.4.7", level: "AA", principle: "Operable", title: "Focus Visible" },
  { criterion: "2.5.1", level: "A", principle: "Operable", title: "Pointer Gestures" },
  { criterion: "2.5.2", level: "A", principle: "Operable", title: "Pointer Cancellation" },
  { criterion: "2.5.3", level: "A", principle: "Operable", title: "Label in Name" },
  { criterion: "2.5.4", level: "A", principle: "Operable", title: "Motion Actuation" },
  // Understandable
  { criterion: "3.1.1", level: "A", principle: "Understandable", title: "Language of Page" },
  { criterion: "3.1.2", level: "AA", principle: "Understandable", title: "Language of Parts" },
  { criterion: "3.2.1", level: "A", principle: "Understandable", title: "On Focus" },
  { criterion: "3.2.2", level: "A", principle: "Understandable", title: "On Input" },
  { criterion: "3.2.3", level: "AA", principle: "Understandable", title: "Consistent Navigation" },
  { criterion: "3.2.4", level: "AA", principle: "Understandable", title: "Consistent Identification" },
  { criterion: "3.3.1", level: "A", principle: "Understandable", title: "Error Identification" },
  { criterion: "3.3.2", level: "A", principle: "Understandable", title: "Labels or Instructions" },
  { criterion: "3.3.3", level: "AA", principle: "Understandable", title: "Error Suggestion" },
  { criterion: "3.3.4", level: "AA", principle: "Understandable", title: "Error Prevention (Legal, Financial, Data)" },
  // Robust
  { criterion: "4.1.1", level: "A", principle: "Robust", title: "Parsing" },
  { criterion: "4.1.2", level: "A", principle: "Robust", title: "Name, Role, Value" },
  { criterion: "4.1.3", level: "AA", principle: "Robust", title: "Status Messages" },
];

function buildWcagMatrix(violations: ViolationRow[]): MatrixEntry[] {
  // Map violations to criteria
  const failedCriteria = new Map<string, { rules: string[]; impact: string }>();

  for (const v of violations) {
    // Check wcagCriteria field first
    if (v.wcagCriteria) {
      const existing = failedCriteria.get(v.wcagCriteria);
      if (existing) {
        existing.rules.push(v.ruleId);
      } else {
        failedCriteria.set(v.wcagCriteria, { rules: [v.ruleId], impact: v.impact });
      }
    }

    // Also parse from tags (e.g., "wcag111", "wcag2a")
    for (const tag of v.tags) {
      const match = tag.match(/^wcag(\d)(\d)(\d+)$/);
      if (match) {
        const criterion = `${match[1]}.${match[2]}.${match[3]}`;
        const existing = failedCriteria.get(criterion);
        if (existing) {
          if (!existing.rules.includes(v.ruleId)) existing.rules.push(v.ruleId);
        } else {
          failedCriteria.set(criterion, { rules: [v.ruleId], impact: v.impact });
        }
      }
    }
  }

  // Determine which criteria were tested (have violations or are testable by axe)
  const testedCriteria = new Set([
    ...failedCriteria.keys(),
    // axe-core typically tests these
    "1.1.1", "1.3.1", "1.4.3", "2.1.1", "2.4.1", "2.4.2", "2.4.4", "2.4.6",
    "3.1.1", "3.3.1", "3.3.2", "4.1.1", "4.1.2", "1.4.4", "2.4.7",
    "1.3.5", "2.5.3", "4.1.3", "1.4.11", "1.4.12",
  ]);

  return WCAG_CRITERIA.map((c) => {
    const failed = failedCriteria.get(c.criterion);
    let status: "pass" | "fail" | "not-tested";

    if (failed) {
      status = "fail";
    } else if (testedCriteria.has(c.criterion)) {
      status = "pass";
    } else {
      status = "not-tested";
    }

    return {
      criterion: c.criterion,
      level: c.level,
      principle: c.principle,
      title: c.title,
      status,
      violations: failed?.rules || [],
      impact: failed?.impact || null,
    };
  });
}
