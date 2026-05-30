/**
 * RegLayer — Litigation Weight Seeder
 *
 * WHY: Risk score engine needs base weights from public lawsuit data.
 * WHAT: Seeds LitigationWeight table with default values.
 * HOW: Idempotent upsert — safe to run multiple times.
 */

import { prisma } from "@/lib/database/prisma";
import { LITIGATION_WEIGHTS } from "@/lib/risk/legalRiskEngine";

/**
 * Seeds the LitigationWeight table with default values.
 * Idempotent — existing records are updated, not duplicated.
 */
export async function seedLitigationWeights() {
  for (const [ruleId, data] of Object.entries(LITIGATION_WEIGHTS)) {
    await prisma.litigationWeight.upsert({
      where: { ruleId },
      create: {
        ruleId,
        weight: data.weight,
        frequency: data.frequency,
        avgSettlement: data.avgSettlement,
      },
      update: {
        weight: data.weight,
        frequency: data.frequency,
        avgSettlement: data.avgSettlement,
      },
    });
  }

  console.log(`[seed] Seeded ${Object.keys(LITIGATION_WEIGHTS).length} litigation weights`);
}
