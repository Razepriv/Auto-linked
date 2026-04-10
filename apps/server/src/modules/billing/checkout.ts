import { getStripe } from './stripe-client.js';
import { STRIPE_PRICE_IDS } from './plans.js';
import { eq } from 'drizzle-orm';
import { users } from '../../db/schema/users.js';
import type { Database } from '../../db/client.js';
import type { Plan } from '@auto-linked/shared';
import { logger } from '../../lib/logger.js';

interface CreateCheckoutParams {
  userId: number;
  userEmail: string;
  plan: Exclude<Plan, 'free'>;
  interval: 'monthly' | 'yearly';
  successUrl: string;
  cancelUrl: string;
}

export async function createCheckoutSession(
  db: Database,
  params: CreateCheckoutParams,
): Promise<{ url: string }> {
  const priceId = STRIPE_PRICE_IDS[params.plan][params.interval];

  if (!priceId) {
    throw new Error(`No Stripe price configured for ${params.plan}/${params.interval}`);
  }

  // Get or create Stripe customer
  const [user] = await db
    .select({ stripeCustomerId: users.stripeCustomerId })
    .from(users)
    .where(eq(users.id, params.userId))
    .limit(1);

  let customerId = user?.stripeCustomerId;

  if (!customerId) {
    const customer = await getStripe().customers.create({
      email: params.userEmail,
      metadata: { userId: String(params.userId) },
    });
    customerId = customer.id;

    await db
      .update(users)
      .set({ stripeCustomerId: customerId, updatedAt: new Date() })
      .where(eq(users.id, params.userId));
  }

  const session = await getStripe().checkout.sessions.create({
    customer: customerId,
    mode: 'subscription',
    line_items: [{ price: priceId, quantity: 1 }],
    success_url: params.successUrl,
    cancel_url: params.cancelUrl,
    subscription_data: {
      metadata: {
        userId: String(params.userId),
        plan: params.plan,
      },
    },
    allow_promotion_codes: true,
  });

  logger.info(
    { userId: params.userId, plan: params.plan, interval: params.interval, sessionId: session.id },
    'Stripe checkout session created',
  );

  return { url: session.url ?? params.cancelUrl };
}

export async function createBillingPortalSession(
  db: Database,
  userId: number,
  returnUrl: string,
): Promise<{ url: string }> {
  const [user] = await db
    .select({ stripeCustomerId: users.stripeCustomerId })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);

  if (!user?.stripeCustomerId) {
    throw new Error('No Stripe customer found. Please subscribe first.');
  }

  const session = await getStripe().billingPortal.sessions.create({
    customer: user.stripeCustomerId,
    return_url: returnUrl,
  });

  return { url: session.url };
}
