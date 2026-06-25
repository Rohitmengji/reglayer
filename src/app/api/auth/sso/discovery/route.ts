/**
 * POST /api/auth/sso/discovery — "is SSO available for this email?"
 *
 * Server-derived (review #14) + non-revealing (review #10): returns only a
 * boolean, never workspace/connection details, so it can't be used to enumerate
 * a customer's internal structure. Rate-limited against enumeration. The actual
 * SSO initiation (with the server-resolved tenant) happens in the authorize
 * route once the Jackson backend is wired — this just tells the login UI whether
 * to show "Continue with SSO".
 */
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/database/prisma";
import { applyRateLimit } from "@/lib/rate-limit-middleware";
import { domainFromEmail } from "@/lib/sso/routing";
import { isPublicDomain } from "@/lib/sso/guards";

const schema = z.object({ email: z.string().trim().email().max(200) });

export async function POST(request: NextRequest) {
  const blocked = await applyRateLimit(request, "api");
  if (blocked) return blocked;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ available: false });
  }
  const parsed = schema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ available: false });

  const domain = domainFromEmail(parsed.data.email);
  if (!domain || isPublicDomain(domain)) return NextResponse.json({ available: false });

  try {
    // VerifiedDomain is the single source of truth for "this domain → one workspace".
    const verified = await prisma.verifiedDomain.findUnique({
      where: { domain },
      select: { connection: { select: { disabledAt: true, deletedAt: true, rolloutStage: true } } },
    });

    const c = verified?.connection;
    const available = !!c && c.disabledAt === null && c.deletedAt === null && c.rolloutStage !== "DISABLED";
    return NextResponse.json({ available });
  } catch {
    // SSO not provisioned (e.g. tables not yet migrated) or a transient DB error
    // must NEVER 500 the public login page — degrade to "SSO not available".
    return NextResponse.json({ available: false });
  }
}
