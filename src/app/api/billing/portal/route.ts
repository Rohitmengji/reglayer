/**
 * RegLayer — Stripe Customer Portal API
 *
 * POST /api/billing/portal — Create portal session for managing subscription
 */

import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth/config";
import { prisma } from "@/lib/database/prisma";
import { stripe } from "@/lib/billing/stripe";

export async function POST() {
  if (!stripe) {
    return NextResponse.json({ error: "Billing not configured" }, { status: 503 });
  }

  const session = await getServerSession(authOptions);
  if (!session?.user?.email) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const user = await prisma.user.findUnique({
    where: { email: session.user.email },
    include: { memberships: { include: { workspace: true }, take: 1 } },
  });

  if (!user?.memberships[0]?.workspace.stripeCustomerId) {
    return NextResponse.json({ error: "No billing account" }, { status: 404 });
  }

  const baseUrl = process.env.NEXTAUTH_URL || "http://localhost:3000";
  const portalSession = await stripe.billingPortal.sessions.create({
    customer: user.memberships[0].workspace.stripeCustomerId,
    return_url: `${baseUrl}/settings?tab=billing`,
  });

  return NextResponse.json({ url: portalSession.url });
}
