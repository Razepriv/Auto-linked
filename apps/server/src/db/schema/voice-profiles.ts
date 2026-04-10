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
} from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';
import { users } from './users.js';

export const voiceProfiles = pgTable(
  'voice_profiles',
  {
    id: bigint('id', { mode: 'number' }).primaryKey().generatedAlwaysAsIdentity(),
    userId: bigint('user_id', { mode: 'number' })
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    versionNumber: integer('version_number').notNull().default(1),

    // Structured fields for querying / displaying in UI
    tone: text('tone').notNull().default('professional-casual'),
    avgPostLength: integer('avg_post_length').notNull().default(200),
    emojiFrequency: text('emoji_frequency').notNull().default('light'),
    hashtagStyle: text('hashtag_style').notNull().default('minimal'),
    formatting: text('formatting').notNull().default('spaced'),
    lineBreakStyle: text('line_break_style').notNull().default('double'),

    // Rich analysis stored as jsonb
    analysisData: jsonb('analysis_data').notNull().default({}),

    // Source info
    analyzedPostCount: integer('analyzed_post_count').notNull().default(0),
    analysisSource: text('analysis_source').notNull().default('questionnaire'),

    // User overrides
    userEdited: boolean('user_edited').notNull().default(false),
    userNotes: text('user_notes'),

    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex('idx_voice_profiles_user_version').on(table.userId, table.versionNumber),
    index('idx_voice_profiles_user_current').on(table.userId, table.id),
  ],
);

export type VoiceProfile = typeof voiceProfiles.$inferSelect;
export type NewVoiceProfile = typeof voiceProfiles.$inferInsert;
