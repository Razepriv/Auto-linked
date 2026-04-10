import {
  bigint,
  index,
  integer,
  numeric,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';
import { users } from './users.js';

export const contentPillars = pgTable(
  'content_pillars',
  {
    id: bigint('id', { mode: 'number' }).primaryKey().generatedAlwaysAsIdentity(),
    publicId: uuid('public_id').notNull().defaultRandom().unique(),
    userId: bigint('user_id', { mode: 'number' })
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),

    name: text('name').notNull(),
    description: text('description'),

    // Scheduling weight (0.000 - 1.000)
    weight: numeric('weight', { precision: 4, scale: 3 }).notNull().default('0.200'),

    // Rolling performance
    performanceScore: numeric('performance_score', { precision: 5, scale: 3 }),

    // Display
    color: text('color'),
    sortOrder: integer('sort_order').notNull().default(0),

    // Soft delete
    deletedAt: timestamp('deleted_at', { withTimezone: true }),

    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex('idx_content_pillars_user_name')
      .on(table.userId, table.name)
      .where(sql`${table.deletedAt} IS NULL`),
    index('idx_content_pillars_user_active')
      .on(table.userId, table.sortOrder)
      .where(sql`${table.deletedAt} IS NULL`),
  ],
);

export type ContentPillar = typeof contentPillars.$inferSelect;
export type NewContentPillar = typeof contentPillars.$inferInsert;
