/**
 * RegLayer — Stripe Billing Configuration
 *
 * Maps internal plan IDs to Stripe Price IDs.
 * All values come from env vars — no hardcoded keys.
 */

import Stripe from "stripe";

if (!process.env.STRIPE_SECRET_KEY) {
  console.warn("[billing] STRIPE_SECRET_KEY not set — billing disabled");
}

export const stripe = process.env.STRIPE_SECRET_KEY
  ? new Stripe(process.env.STRIPE_SECRET_KEY)
  : null;

/**
 * Price IDs from Stripe Dashboard.
 * Set these in .env after creating products in Stripe.
 */
export const STRIPE_PRICES = {
  PRO_MONTHLY: process.env.STRIPE_PRICE_PRO_MONTHLY || "",
  PRO_ANNUAL: process.env.STRIPE_PRICE_PRO_ANNUAL || "",
  ENTERPRISE_MONTHLY: process.env.STRIPE_PRICE_ENTERPRISE_MONTHLY || "",
  ENTERPRISE_ANNUAL: process.env.STRIPE_PRICE_ENTERPRISE_ANNUAL || "",
} as const;

/**
 * Map Stripe Price ID back to internal plan.
 */
export function priceIdToPlan(priceId: string): "PRO" | "ENTERPRISE" | null {
  if (priceId === STRIPE_PRICES.PRO_MONTHLY || priceId === STRIPE_PRICES.PRO_ANNUAL) return "PRO";
  if (priceId === STRIPE_PRICES.ENTERPRISE_MONTHLY || priceId === STRIPE_PRICES.ENTERPRISE_ANNUAL) return "ENTERPRISE";
  return null;
}

/**
 * Map internal plan + billing interval to Stripe Price ID.
 */
export function planToPriceId(plan: "PRO" | "ENTERPRISE", interval: "monthly" | "annual"): string {
  if (plan === "PRO") return interval === "annual" ? STRIPE_PRICES.PRO_ANNUAL : STRIPE_PRICES.PRO_MONTHLY;
  return interval === "annual" ? STRIPE_PRICES.ENTERPRISE_ANNUAL : STRIPE_PRICES.ENTERPRISE_MONTHLY;
}
