import type { Request, Response } from 'express';
import Stripe from 'stripe';
import { getStripe, isStripeConfigured } from './stripe-client.js';
import { PLAN_FROM_PRICE_ID } from './plans.js';
import { eq } from 'drizzle-orm';
import { users } from '../../db/schema/users.js';
import { db } from '../../db/client.js';
import { config } from '../../lib/config.js';
import { logger } from '../../lib/logger.js';
import { sendEmail, welcomeEmail } from '../email/index.js';

export async function handleStripeWebhook(req: Request, res: Response): Promise<void> {
  if (!isStripeConfigured()) {
    res.status(200).json({ received: true, message: 'Stripe disabled (self-hosted mode)' });
    return;
  }

  const signature = req.headers['stripe-signature'] as string;

  let event: Stripe.Event;
  try {
    event = getStripe().webhooks.constructEvent(
      req.body as Buffer,
      signature,
      config.STRIPE_WEBHOOK_SECRET,
    );
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    logger.error({ error: message }, 'Stripe webhook signature verification failed');
    res.status(400).json({ error: 'Invalid signature' });
    return;
  }

  logger.info({ type: event.type, id: event.id }, 'Stripe webhook received');

  switch (event.type) {
    case 'checkout.session.completed': {
      const session = event.data.object as Stripe.Checkout.Session;
      await handleCheckoutComplete(session);
      break;
    }

    case 'invoice.paid': {
      const invoice = event.data.object as Stripe.Invoice;
      await handleInvoicePaid(invoice);
      break;
    }

    case 'customer.subscription.updated': {
      const subscription = event.data.object as Stripe.Subscription;
      await handleSubscriptionUpdated(subscription);
      break;
    }

    case 'customer.subscription.deleted': {
      const subscription = event.data.object as Stripe.Subscription;
      await handleSubscriptionDeleted(subscription);
      break;
    }

    default:
      logger.debug({ type: event.type }, 'Unhandled Stripe event type');
  }

  res.json({ received: true });
}

async function handleCheckoutComplete(session: Stripe.Checkout.Session): Promise<void> {
  const userId = session.subscription
    ? (await stripe.subscriptions.retrieve(session.subscription as string)).metadata['userId']
    : session.metadata?.['userId'];

  if (!userId) {
    logger.warn({ sessionId: session.id }, 'Checkout session missing userId metadata');
    return;
  }

  const subscriptionId = session.subscription as string;
  if (!subscriptionId) return;

  const subscription = await stripe.subscriptions.retrieve(subscriptionId);
  const priceId = subscription.items.data[0]?.price.id ?? '';
  const plan = PLAN_FROM_PRICE_ID[priceId] ?? 'pro';

  await db
    .update(users)
    .set({
      subscriptionTier: plan,
      stripeCustomerId: session.customer as string,
      subscriptionExpiresAt: new Date(subscription.current_period_end * 1000),
      updatedAt: new Date(),
    })
    .where(eq(users.id, Number(userId)));

  logger.info({ userId, plan, subscriptionId }, 'User subscription activated via checkout');
}

async function handleInvoicePaid(invoice: Stripe.Invoice): Promise<void> {
  const subscriptionId = invoice.subscription as string;
  if (!subscriptionId) return;

  const subscription = await stripe.subscriptions.retrieve(subscriptionId);
  const userId = subscription.metadata['userId'];
  if (!userId) return;

  await db
    .update(users)
    .set({
      subscriptionExpiresAt: new Date(subscription.current_period_end * 1000),
      updatedAt: new Date(),
    })
    .where(eq(users.id, Number(userId)));

  logger.info({ userId, subscriptionId }, 'Subscription renewed via invoice payment');
}

async function handleSubscriptionUpdated(subscription: Stripe.Subscription): Promise<void> {
  const userId = subscription.metadata['userId'];
  if (!userId) return;

  const priceId = subscription.items.data[0]?.price.id ?? '';
  const plan = PLAN_FROM_PRICE_ID[priceId] ?? 'free';

  await db
    .update(users)
    .set({
      subscriptionTier: plan,
      subscriptionExpiresAt: new Date(subscription.current_period_end * 1000),
      updatedAt: new Date(),
    })
    .where(eq(users.id, Number(userId)));

  logger.info({ userId, plan, subscriptionId: subscription.id }, 'Subscription updated');
}

async function handleSubscriptionDeleted(subscription: Stripe.Subscription): Promise<void> {
  const userId = subscription.metadata['userId'];
  if (!userId) return;

  await db
    .update(users)
    .set({
      subscriptionTier: 'free',
      subscriptionExpiresAt: null,
      updatedAt: new Date(),
    })
    .where(eq(users.id, Number(userId)));

  logger.info({ userId, subscriptionId: subscription.id }, 'Subscription cancelled — reverted to free');
}
