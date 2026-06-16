/**
 * ---------------------------------------------------------
 * RegLayer — Resource Access Assertions
 * ---------------------------------------------------------
 *
 * WHY: Several routes loaded a Scan/Site by a URL- or body-supplied id and
 *      trusted it without verifying the caller's workspace owns it — enabling
 *      cross-tenant reads and (for the proof vault) forged compliance evidence
 *      bound to another tenant's scan. The correct ownership pattern existed in
 *      one place (sites/[siteId]/trends) but was never shared.
 *
 * WHAT: Single source of truth for "can this session access this scan/site?".
 *       Master admins bypass; otherwise access requires workspace membership
 *       (or, for legacy workspace-less scans, ownership by userId).
 *
 * HOW: Returns a discriminated result so callers can map denials to the right
 *      HTTP status without throwing. Resolve the session user once, then check
 *      the resource's workspaceId against the user's memberships.
 * ---------------------------------------------------------
 */

import { prisma } from "@/lib/database/prisma";
import type { Session } from "next-auth";

export type AccessOk = {
  ok: true;
  userId: string;
  isMasterAdmin: boolean;
  /** The resource's workspace. Null only for legacy workspace-less scans owned by userId. */
  workspaceId: string | null;
};

export type AccessDenied = {
  ok: false;
  status: 401 | 403 | 404;
  error: string;
};

export type AccessResult = AccessOk | AccessDenied;

async function resolveUser(session: Session | null) {
  const email = session?.user?.email;
  if (!email) return null;
  return prisma.user.findUnique({
    where: { email },
    select: {
      id: true,
      isMasterAdmin: true,
      memberships: { select: { workspaceId: true } },
    },
  });
}

/**
 * Assert the session may access the given scan. Access is granted when the
 * caller is a master admin, a member of the scan's workspace, or (for legacy
 * scans with no workspace) the scan's owning user.
 */
export async function assertScanAccess(
  scanId: string,
  session: Session | null
): Promise<AccessResult> {
  const user = await resolveUser(session);
  if (!user) return { ok: false, status: 401, error: "Authentication required" };

  const scan = await prisma.scan.findUnique({
    where: { id: scanId },
    select: { id: true, workspaceId: true, userId: true },
  });
  if (!scan) return { ok: false, status: 404, error: "Scan not found" };

  if (user.isMasterAdmin) {
    return { ok: true, userId: user.id, isMasterAdmin: true, workspaceId: scan.workspaceId };
  }

  const workspaceIds = user.memberships.map((m) => m.workspaceId);
  const ownsByWorkspace = scan.workspaceId !== null && workspaceIds.includes(scan.workspaceId);
  const ownsByUser = scan.userId !== null && scan.userId === user.id;

  if (ownsByWorkspace || ownsByUser) {
    return { ok: true, userId: user.id, isMasterAdmin: false, workspaceId: scan.workspaceId };
  }
  return { ok: false, status: 403, error: "You do not have access to this scan" };
}

/**
 * Assert the session may access the given crawl job. Mirrors assertScanAccess:
 * master admin bypass, else workspace membership, else legacy userId ownership.
 *
 * `fallbackOwner` lets the caller pass the in-memory job's owner (job.config)
 * so the hot poll path can authorize WITHOUT a durable-record lookup while the
 * crawl is live; the record is only read when no fallback owner is available.
 */
export async function assertCrawlJobAccess(
  jobId: string,
  session: Session | null,
  fallbackOwner?: { workspaceId?: string | null; userId?: string | null }
): Promise<AccessResult> {
  const user = await resolveUser(session);
  if (!user) return { ok: false, status: 401, error: "Authentication required" };

  let owner: { workspaceId: string | null; userId: string | null } | null = null;
  if (fallbackOwner && (fallbackOwner.workspaceId != null || fallbackOwner.userId != null)) {
    owner = { workspaceId: fallbackOwner.workspaceId ?? null, userId: fallbackOwner.userId ?? null };
  } else {
    const record = await prisma.crawlJobRecord.findUnique({
      where: { id: jobId },
      select: { workspaceId: true, userId: true },
    });
    owner = record ? { workspaceId: record.workspaceId, userId: record.userId } : null;
  }
  if (!owner) return { ok: false, status: 404, error: "Job not found" };

  if (user.isMasterAdmin) {
    return { ok: true, userId: user.id, isMasterAdmin: true, workspaceId: owner.workspaceId };
  }
  const workspaceIds = user.memberships.map((m) => m.workspaceId);
  const ownsByWorkspace = owner.workspaceId !== null && workspaceIds.includes(owner.workspaceId);
  const ownsByUser = owner.userId !== null && owner.userId === user.id;
  if (ownsByWorkspace || ownsByUser) {
    return { ok: true, userId: user.id, isMasterAdmin: false, workspaceId: owner.workspaceId };
  }
  return { ok: false, status: 403, error: "You do not have access to this audit" };
}

/**
 * Assert the session may access the given site (always workspace-scoped).
 */
export async function assertSiteAccess(
  siteId: string,
  session: Session | null
): Promise<AccessResult> {
  const user = await resolveUser(session);
  if (!user) return { ok: false, status: 401, error: "Authentication required" };

  const site = await prisma.site.findUnique({
    where: { id: siteId },
    select: { id: true, workspaceId: true },
  });
  if (!site) return { ok: false, status: 404, error: "Site not found" };

  if (user.isMasterAdmin) {
    return { ok: true, userId: user.id, isMasterAdmin: true, workspaceId: site.workspaceId };
  }

  const workspaceIds = user.memberships.map((m) => m.workspaceId);
  if (workspaceIds.includes(site.workspaceId)) {
    return { ok: true, userId: user.id, isMasterAdmin: false, workspaceId: site.workspaceId };
  }
  return { ok: false, status: 403, error: "You do not have access to this site" };
}
