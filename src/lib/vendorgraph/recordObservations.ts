/**
 * RegLayer — VALG observation recording (server-only, best-effort)
 *
 * Records one VendorObservation per detected vendor from a per-scan vendor-risk report.
 * BEST-EFFORT: never throws. If vendor_observations is absent (migration pending) or the
 * write fails, it swallows the error so the caller's vendor-risk response is unaffected.
 */

import "server-only";

import { prisma } from "@/lib/database/prisma";
import type { VendorRiskReport } from "@/lib/vendor/vendorRiskScanner";

export async function recordVendorObservations(report: VendorRiskReport): Promise<number> {
  try {
    if (!report.vendors.length) return 0;

    const scan = await prisma.scan.findUnique({
      where: { id: report.scanId },
      select: { workspaceId: true, siteId: true },
    });

    const observedAt = new Date();
    await prisma.vendorObservation.createMany({
      data: report.vendors.map((v) => ({
        workspaceId: scan?.workspaceId ?? null,
        siteId: scan?.siteId ?? null,
        scanId: report.scanId,
        vendor: v.vendor,
        category: v.category,
        violationCount: v.violationCount,
        riskScore: v.riskScore,
        observedAt,
      })),
    });
    return report.vendors.length;
  } catch {
    // Migration pending or transient failure — never disrupt the caller's response.
    return 0;
  }
}
