/**
 * RegLayer — Billing Checkout API
 *
 * POST /api/billing/checkout — Create Stripe Checkout session for plan upgrade
 * POST /api/billing/portal — Create Stripe Billing Portal session for management
 * GET /api/billing/status — Current subscription status
 */

import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth/config";
import { prisma } from "@/lib/database/prisma";
import { stripe, planToPriceId } from "@/lib/billing/stripe";
import { z } from "zod";

const checkoutSchema = z.object({
  plan: z.enum(["PRO", "ENTERPRISE"]),
  interval: z.enum(["monthly", "annual"]).default("monthly"),
});

/**
 * POST — Create a Stripe Checkout session for upgrading.
 */
export async function POST(request: NextRequest) {
  if (!stripe) {
    return NextResponse.json({ error: "Billing not configured" }, { status: 503 });
  }

  const session = await getServerSession(authOptions);
  if (!session?.user?.email) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json();
  const parsed = checkoutSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten().fieldErrors }, { status: 400 });
  }

  const { plan, interval } = parsed.data;
  const priceId = planToPriceId(plan, interval);
  if (!priceId) {
    return NextResponse.json({ error: "Price not configured. Contact support." }, { status: 503 });
  }

  // Get user's workspace
  const user = await prisma.user.findUnique({
    where: { email: session.user.email },
    include: { memberships: { include: { workspace: true }, take: 1 } },
  });

  if (!user || !user.memberships[0]) {
    return NextResponse.json({ error: "No workspace found" }, { status: 404 });
  }

  const membership = user.memberships[0];
  // Billing changes (upgrade/trial/customer creation) are owner/admin-only — a
  // low-privilege MEMBER/VIEWER must not be able to start or alter the subscription.
  if (!["OWNER", "ADMIN"].includes(membership.role)) {
    return NextResponse.json({ error: "Only workspace owners and admins can manage billing" }, { status: 403 });
  }
  const workspace = membership.workspace;

  // Wrap every Stripe call: the `!stripe` guard above only catches an ABSENT key.
  // A present-but-invalid key (e.g. a placeholder) makes `stripe` truthy, so these
  // calls would throw and surface as an opaque 500. Return a clean 502 instead.
  try {
    // Re-use existing Stripe customer or create new
    let customerId = workspace.stripeCustomerId;
    if (!customerId) {
      const customer = await stripe.customers.create({
        email: session.user.email,
        name: workspace.name,
        metadata: { workspaceId: workspace.id, userId: user.id },
      });
      customerId = customer.id;
      await prisma.workspace.update({
        where: { id: workspace.id },
        data: { stripeCustomerId: customerId, billingEmail: session.user.email },
      });
    }

    // Create checkout session
    const baseUrl = process.env.NEXTAUTH_URL || "http://localhost:3000";
    const checkoutSession = await stripe.checkout.sessions.create({
      customer: customerId,
      mode: "subscription",
      line_items: [{ price: priceId, quantity: 1 }],
      success_url: `${baseUrl}/settings?tab=billing&status=success`,
      cancel_url: `${baseUrl}/pricing?status=cancelled`,
      subscription_data: {
        trial_period_days: workspace.plan === "FREE" ? 14 : undefined,
        metadata: { workspaceId: workspace.id },
      },
      metadata: { workspaceId: workspace.id, plan },
      allow_promotion_codes: true,
    });

    return NextResponse.json({ url: checkoutSession.url });
  } catch (err) {
    console.error("[billing/checkout] Stripe error:", err);
    return NextResponse.json(
      { error: "Could not start checkout. Billing is temporarily unavailable." },
      { status: 502 }
    );
  }
}

/**
 * GET — Return current billing status for the workspace.
 */
export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const user = await prisma.user.findUnique({
    where: { email: session.user.email },
    include: { memberships: { include: { workspace: true }, take: 1 } },
  });

  if (!user || !user.memberships[0]) {
    return NextResponse.json({ error: "No workspace" }, { status: 404 });
  }

  const workspace = user.memberships[0].workspace;

  // If Stripe is configured and workspace has a subscription, fetch details
  let subscription = null;
  if (stripe && workspace.stripeSubscriptionId) {
    try {
      const sub = await stripe.subscriptions.retrieve(workspace.stripeSubscriptionId);
      const periodEnd = (sub as unknown as { current_period_end: number }).current_period_end;
      const trialEnd = (sub as unknown as { trial_end: number | null }).trial_end;
      subscription = {
        status: sub.status,
        currentPeriodEnd: new Date(periodEnd * 1000).toISOString(),
        cancelAtPeriodEnd: sub.cancel_at_period_end,
        trialEnd: trialEnd ? new Date(trialEnd * 1000).toISOString() : null,
      };
    } catch {
      // Subscription may have been deleted
    }
  }

  return NextResponse.json({
    plan: workspace.plan,
    stripeCustomerId: workspace.stripeCustomerId,
    subscription,
    trialEndsAt: workspace.trialEndsAt,
  });
}
