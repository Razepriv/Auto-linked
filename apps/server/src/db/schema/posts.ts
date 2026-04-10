import {
  bigint,
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
import { users } from './users.js';
import { contentPillars } from './content-pillars.js';

export const posts = pgTable(
  'posts',
  {
    id: bigint('id', { mode: 'number' }).primaryKey().generatedAlwaysAsIdentity(),
    publicId: uuid('public_id').notNull().defaultRandom().unique(),
    userId: bigint('user_id', { mode: 'number' })
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    pillarId: bigint('pillar_id', { mode: 'number' })
      .references(() => contentPillars.id, { onDelete: 'set null' }),

    // Content
    content: text('content').notNull(),
    hook: text('hook'),
    hashtags: text('hashtags')
      .array()
      .notNull()
      .default(sql`'{}'::text[]`),
    format: text('format').notNull().default('text'),

    // Generation metadata
    aiModel: text('ai_model'),
    generationPrompt: text('generation_prompt'),
    generationContext: jsonb('generation_context'),
    regenerationCount: integer('regeneration_count').notNull().default(0),

    // Status workflow: draft -> approved -> scheduled -> published
    //                  draft -> skipped
    //                  approved/scheduled -> failed
    status: text('status').notNull().default('draft'),

    // Scheduling
    scheduledAt: timestamp('scheduled_at', { withTimezone: true }),
    approvedAt: timestamp('approved_at', { withTimezone: true }),
    publishedAt: timestamp('published_at', { withTimezone: true }),

    // LinkedIn identifiers (populated after publish)
    linkedinPostId: text('linkedin_post_id'),
    linkedinPostUrl: text('linkedin_post_url'),

    // Publishing error tracking
    publishAttemptCount: integer('publish_attempt_count').notNull().default(0),
    lastPublishError: text('last_publish_error'),
    lastPublishAttemptAt: timestamp('last_publish_attempt_at', { withTimezone: true }),

    // Media (denormalized primary asset URL)
    primaryMediaUrl: text('primary_media_url'),

    // Soft delete
    deletedAt: timestamp('deleted_at', { withTimezone: true }),

    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex('idx_posts_linkedin_post_id')
      .on(table.linkedinPostId)
      .where(sql`${table.linkedinPostId} IS NOT NULL`),
    index('idx_posts_user_status')
      .on(table.userId, table.status, table.scheduledAt)
      .where(sql`${table.deletedAt} IS NULL`),
    index('idx_posts_pillar_id')
      .on(table.pillarId)
      .where(sql`${table.pillarId} IS NOT NULL AND ${table.deletedAt} IS NULL`),
    index('idx_posts_scheduled_queue')
      .on(table.scheduledAt, table.status)
      .where(sql`${table.status} IN ('approved', 'scheduled') AND ${table.deletedAt} IS NULL`),
    index('idx_posts_published_recent')
      .on(table.userId, table.publishedAt)
      .where(sql`${table.status} = 'published' AND ${table.deletedAt} IS NULL`),
  ],
);

export type Post = typeof posts.$inferSelect;
export type NewPost = typeof posts.$inferInsert;
