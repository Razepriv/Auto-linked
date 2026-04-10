import {
  bigint,
  index,
  integer,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
} from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';
import { users } from './users.js';

export const linkedinOauthTokens = pgTable(
  'linkedin_oauth_tokens',
  {
    id: bigint('id', { mode: 'number' }).primaryKey().generatedAlwaysAsIdentity(),
    userId: bigint('user_id', { mode: 'number' })
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' })
      .unique(),

    // Ciphertext of tokens (encrypted at application layer with AES-256-GCM)
    accessTokenEnc: text('access_token_enc').notNull(),
    refreshTokenEnc: text('refresh_token_enc'),

    // Token metadata (not sensitive, stored plaintext)
    scopes: text('scopes')
      .array()
      .notNull()
      .default(sql`'{}'::text[]`),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    refreshExpiresAt: timestamp('refresh_expires_at', { withTimezone: true }),

    // Rotation tracking
    issuedAt: timestamp('issued_at', { withTimezone: true }).notNull().defaultNow(),
    lastRefreshedAt: timestamp('last_refreshed_at', { withTimezone: true }),
    refreshFailureCount: integer('refresh_failure_count').notNull().default(0),

    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('idx_linkedin_tokens_expires').on(table.expiresAt)
      .where(sql`${table.expiresAt} > now() - INTERVAL '7 days'`),
  ],
);

export type LinkedinOauthToken = typeof linkedinOauthTokens.$inferSelect;
export type NewLinkedinOauthToken = typeof linkedinOauthTokens.$inferInsert;
