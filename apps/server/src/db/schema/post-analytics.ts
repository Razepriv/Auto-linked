import {
  bigint,
  index,
  jsonb,
  numeric,
  pgTable,
  timestamp,
  uniqueIndex,
} from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';
import { users } from './users.js';
import { posts } from './posts.js';

export const postAnalytics = pgTable(
  'post_analytics',
  {
    id: bigint('id', { mode: 'number' }).primaryKey().generatedAlwaysAsIdentity(),
    postId: bigint('post_id', { mode: 'number' })
      .notNull()
      .references(() => posts.id, { onDelete: 'cascade' }),
    userId: bigint('user_id', { mode: 'number' })
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),

    // LinkedIn organic metrics at snapshot time
    impressions: bigint('impressions', { mode: 'number' }).notNull().default(0),
    reactions: bigint('reactions', { mode: 'number' }).notNull().default(0),
    comments: bigint('comments', { mode: 'number' }).notNull().default(0),
    reposts: bigint('reposts', { mode: 'number' }).notNull().default(0),
    clicks: bigint('clicks', { mode: 'number' }).notNull().default(0),

    // Derived at snapshot time
    engagementRate: numeric('engagement_rate', { precision: 6, scale: 4 }),

    // Raw LinkedIn API response (for debugging)
    rawResponse: jsonb('raw_response'),

    snapshotAt: timestamp('snapshot_at', { withTimezone: true }).notNull().defaultNow(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex('idx_post_analytics_post_snapshot')
      .on(table.postId)
      .where(sql`date_trunc('hour', ${table.snapshotAt}) IS NOT NULL`),
    index('idx_post_analytics_post_id')
      .on(table.postId, table.snapshotAt),
    index('idx_post_analytics_user_snapshot')
      .on(table.userId, table.snapshotAt),
    index('idx_post_analytics_user_engagement')
      .on(table.userId, table.engagementRate, table.snapshotAt),
  ],
);

export type PostAnalytic = typeof postAnalytics.$inferSelect;
export type NewPostAnalytic = typeof postAnalytics.$inferInsert;
