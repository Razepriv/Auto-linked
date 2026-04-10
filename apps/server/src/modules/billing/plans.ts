import type { Plan } from '@auto-linked/shared';

/**
 * Maps subscription plans to Stripe Price IDs.
 * These should be created in the Stripe Dashboard and set via env vars.
 * Fallback to empty strings — the checkout will fail gracefully in dev.
 */
export const STRIPE_PRICE_IDS: Record<Exclude<Plan, 'free'>, { monthly: string; yearly: string }> = {
  pro: {
    monthly: process.env['STRIPE_PRICE_PRO_MONTHLY'] ?? '',
    yearly: process.env['STRIPE_PRICE_PRO_YEARLY'] ?? '',
  },
  team: {
    monthly: process.env['STRIPE_PRICE_TEAM_MONTHLY'] ?? '',
    yearly: process.env['STRIPE_PRICE_TEAM_YEARLY'] ?? '',
  },
};

export const PLAN_FROM_PRICE_ID: Record<string, Plan> = {};

for (const [plan, prices] of Object.entries(STRIPE_PRICE_IDS)) {
  if (prices.monthly) PLAN_FROM_PRICE_ID[prices.monthly] = plan as Plan;
  if (prices.yearly) PLAN_FROM_PRICE_ID[prices.yearly] = plan as Plan;
}
