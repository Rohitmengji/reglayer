/**
 * RegLayer — Stripe Webhook Handler
 *
 * POST /api/webhooks/stripe — Handles Stripe subscription lifecycle events.
 * Verifies signature, updates workspace plan accordingly.
 */

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/database/prisma";
import { stripe, priceIdToPlan } from "@/lib/billing/stripe";
import { logger } from "@/lib/telemetry/logger";

const log = logger.withContext({ service: "stripe-webhook" });

export async function POST(request: NextRequest) {
  if (!stripe) {
    return NextResponse.json({ error: "Billing not configured" }, { status: 503 });
  }

  const body = await request.text();
  const signature = request.headers.get("stripe-signature");

  if (!signature || !process.env.STRIPE_WEBHOOK_SECRET) {
    return NextResponse.json({ error: "Missing signature" }, { status: 400 });
  }

  let event;
  try {
    event = stripe.webhooks.constructEvent(body, signature, process.env.STRIPE_WEBHOOK_SECRET);
  } catch (err) {
    log.error("Webhook signature verification failed", { action: "verify", error: err instanceof Error ? err.message : String(err) });
    return NextResponse.json({ error: "Invalid signature" }, { status: 400 });
  }

  try {
    switch (event.type) {
      case "checkout.session.completed": {
        const session = event.data.object;
        const workspaceId = session.metadata?.workspaceId;
        const subscriptionId = typeof session.subscription === "string" ? session.subscription : session.subscription?.toString();

        if (workspaceId && subscriptionId) {
          // Fetch the subscription to get price/plan
          const sub = await stripe.subscriptions.retrieve(subscriptionId);
          const priceId = sub.items.data[0]?.price.id;
          const plan = priceId ? priceIdToPlan(priceId) : null;

          await prisma.workspace.update({
            where: { id: workspaceId },
            data: {
              stripeSubscriptionId: subscriptionId,
              stripePriceId: priceId || null,
              plan: plan || "PRO",
              trialEndsAt: sub.trial_end ? new Date(sub.trial_end * 1000) : null,
            },
          });
        }
        break;
      }

      case "customer.subscription.updated": {
        const sub = event.data.object;
        const workspaceId = sub.metadata?.workspaceId;
        if (!workspaceId) break;

        const priceId = sub.items.data[0]?.price.id;
        const plan = priceId ? priceIdToPlan(priceId) : null;

        await prisma.workspace.update({
          where: { id: workspaceId },
          data: {
            stripePriceId: priceId || null,
            plan: plan || "FREE",
            trialEndsAt: sub.trial_end ? new Date(sub.trial_end * 1000) : null,
          },
        });
        break;
      }

      case "customer.subscription.deleted": {
        const sub = event.data.object;
        const workspaceId = sub.metadata?.workspaceId;
        if (!workspaceId) break;

        // Downgrade to FREE
        await prisma.workspace.update({
          where: { id: workspaceId },
          data: {
            plan: "FREE",
            stripeSubscriptionId: null,
            stripePriceId: null,
            trialEndsAt: null,
          },
        });
        break;
      }

      case "invoice.payment_failed": {
        const invoice = event.data.object;
        const customerId = typeof invoice.customer === "string" ? invoice.customer : null;
        if (customerId) {
          // Could send email notification here
          log.warn("Payment failed", { action: "invoice.payment_failed", customerId });
        }
        break;
      }
    }
  } catch (err) {
    log.error("Webhook handler error", { action: "handle", error: err instanceof Error ? err.message : String(err) });
    return NextResponse.json({ error: "Handler failed" }, { status: 500 });
  }

  return NextResponse.json({ received: true });
}
