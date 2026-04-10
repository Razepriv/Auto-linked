import {
  bigint,
  boolean,
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';

export const users = pgTable(
  'users',
  {
    id: bigint('id', { mode: 'number' }).primaryKey().generatedAlwaysAsIdentity(),
    publicId: uuid('public_id').notNull().defaultRandom().unique(),

    // Identity
    email: text('email').notNull().unique(),
    name: text('name').notNull(),
    avatarUrl: text('avatar_url'),

    // LinkedIn identity
    linkedinId: text('linkedin_id').unique(),
    linkedinVanityUrl: text('linkedin_vanity_url'),

    // Subscription
    subscriptionTier: text('subscription_tier').notNull().default('free'),
    subscriptionExpiresAt: timestamp('subscription_expires_at', { withTimezone: true }),
    stripeCustomerId: text('stripe_customer_id'),

    // Posting preferences
    postingSchedule: jsonb('posting_schedule'),

    timezone: text('timezone').notNull().default('UTC'),

    // Onboarding
    onboardingCompletedAt: timestamp('onboarding_completed_at', { withTimezone: true }),
    onboardingStep: text('onboarding_step').default('start'),

    // Feature flags
    autoPublish: boolean('auto_publish').notNull().default(false),
    autoPublishWindowHours: integer('auto_publish_window_hours').notNull().default(24),
    emailNotifications: boolean('email_notifications').notNull().default(true),

    // Soft delete
    deletedAt: timestamp('deleted_at', { withTimezone: true }),

    // Audit
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('idx_users_email').on(table.email).where(sql`${table.deletedAt} IS NULL`),
    index('idx_users_linkedin_id').on(table.linkedinId).where(sql`${table.linkedinId} IS NOT NULL`),
    index('idx_users_subscription').on(table.subscriptionTier, table.subscriptionExpiresAt)
      .where(sql`${table.deletedAt} IS NULL`),
  ],
);

export type User = typeof users.$inferSelect;
export type NewUser = typeof users.$inferInsert;
