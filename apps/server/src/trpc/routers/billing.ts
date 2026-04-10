import { z } from 'zod';
import { TRPCError } from '@trpc/server';
import { router, protectedProcedure } from '../trpc.js';
import { createCheckoutSession, createBillingPortalSession } from '../../modules/billing/index.js';
import { isStripeConfigured } from '../../modules/billing/stripe-client.js';
import { isSelfHosted } from '@auto-linked/shared';

const APP_URL = process.env['APP_URL'] ?? 'http://localhost:3000';

export const billingRouter = router({
  createCheckout: protectedProcedure
    .input(
      z.object({
        plan: z.enum(['pro', 'team']),
        interval: z.enum(['monthly', 'yearly']).default('monthly'),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      if (!isStripeConfigured()) {
        throw new TRPCError({
          code: 'PRECONDITION_FAILED',
          message: 'Billing is disabled in self-hosted mode. All features are already unlocked.',
        });
      }

      const result = await createCheckoutSession(ctx.db, {
        userId: ctx.user.id,
        userEmail: ctx.user.email,
        plan: input.plan,
        interval: input.interval,
        successUrl: `${APP_URL}/settings/billing?success=true`,
        cancelUrl: `${APP_URL}/settings/billing?cancelled=true`,
      });

      return result;
    }),

  createPortalSession: protectedProcedure.mutation(async ({ ctx }) => {
    if (!isStripeConfigured()) {
      throw new TRPCError({
        code: 'PRECONDITION_FAILED',
        message: 'Billing is disabled in self-hosted mode.',
      });
    }

    try {
      const result = await createBillingPortalSession(
        ctx.db,
        ctx.user.id,
        `${APP_URL}/settings/billing`,
      );
      return result;
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      throw new TRPCError({
        code: 'BAD_REQUEST',
        message,
      });
    }
  }),

  status: protectedProcedure.query(async ({ ctx }) => {
    // In self-hosted mode, everyone gets the self-hosted plan (everything unlimited)
    if (isSelfHosted()) {
      return { plan: 'self-hosted' as const, billingEnabled: false };
    }

    return {
      plan: ctx.user.subscriptionTier,
      billingEnabled: isStripeConfigured(),
    };
  }),
});
