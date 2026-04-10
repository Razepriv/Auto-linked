import Stripe from 'stripe';
import { config } from '../../lib/config.js';
import { logger } from '../../lib/logger.js';

let stripe: Stripe | null = null;

if (config.STRIPE_SECRET_KEY) {
  stripe = new Stripe(config.STRIPE_SECRET_KEY, {
    apiVersion: '2025-03-31.basil',
    typescript: true,
  });
} else {
  logger.warn('STRIPE_SECRET_KEY not set — Stripe billing disabled (self-hosted mode)');
}

export function getStripe(): Stripe {
  if (!stripe) {
    throw new Error('Stripe is not configured. Set STRIPE_SECRET_KEY or enable SELF_HOSTED=true.');
  }
  return stripe;
}

export function isStripeConfigured(): boolean {
  return stripe !== null;
}
