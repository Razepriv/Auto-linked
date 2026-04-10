// ---------------------------------------------------------------------------
// Post Zod validation schemas
// ---------------------------------------------------------------------------

import { z } from 'zod';
import {
  POST_MAX_LENGTH,
  HOOK_MAX_LENGTH,
  HASHTAG_MAX_COUNT,
  HASHTAG_MAX_LENGTH,
} from '../constants/index.js';

// ---- Reusable field schemas ------------------------------------------------

const postStatusSchema = z.enum([
  'draft',
  'approved',
  'scheduled',
  'publishing',
  'published',
  'failed',
  'skipped',
]);

const postFormatSchema = z.enum(['text', 'image', 'carousel', 'poll']);

const hashtagSchema = z
  .string()
  .min(1, 'Hashtag cannot be empty')
  .max(HASHTAG_MAX_LENGTH, `Hashtag must be at most ${HASHTAG_MAX_LENGTH} characters`)
  .regex(/^#?[\w]+$/, 'Hashtag must contain only alphanumeric characters and underscores');

const hashtagsArraySchema = z
  .array(hashtagSchema)
  .max(HASHTAG_MAX_COUNT, `At most ${HASHTAG_MAX_COUNT} hashtags allowed`)
  .default([]);

const isoDateTimeSchema = z.string().datetime({ message: 'Must be a valid ISO-8601 datetime' });

// ---- Create post -----------------------------------------------------------

export const postCreateSchema = z.object({
  pillarId: z.string().uuid('Invalid pillar ID').nullish(),
  content: z
    .string()
    .min(1, 'Post content is required')
    .max(POST_MAX_LENGTH, `Post content must be at most ${POST_MAX_LENGTH} characters`),
  hook: z
    .string()
    .max(HOOK_MAX_LENGTH, `Hook must be at most ${HOOK_MAX_LENGTH} characters`)
    .nullish(),
  hashtags: hashtagsArraySchema.optional(),
  format: postFormatSchema.default('text'),
  mediaUrl: z.string().url('Invalid media URL').nullish(),
  strategyNote: z.string().max(500, 'Strategy note must be at most 500 characters').nullish(),
  scheduledAt: isoDateTimeSchema.nullish(),
});

export type PostCreateInput = z.infer<typeof postCreateSchema>;

// ---- Update post -----------------------------------------------------------

export const postUpdateSchema = z.object({
  pillarId: z.string().uuid('Invalid pillar ID').nullish(),
  content: z
    .string()
    .min(1, 'Post content cannot be empty')
    .max(POST_MAX_LENGTH, `Post content must be at most ${POST_MAX_LENGTH} characters`)
    .optional(),
  hook: z
    .string()
    .max(HOOK_MAX_LENGTH, `Hook must be at most ${HOOK_MAX_LENGTH} characters`)
    .nullish(),
  hashtags: hashtagsArraySchema.optional(),
  format: postFormatSchema.optional(),
  mediaUrl: z.string().url('Invalid media URL').nullish(),
  strategyNote: z.string().max(500, 'Strategy note must be at most 500 characters').nullish(),
  scheduledAt: isoDateTimeSchema.nullish(),
});

export type PostUpdateInput = z.infer<typeof postUpdateSchema>;

// ---- Approve post ----------------------------------------------------------

export const postApproveSchema = z.object({
  postId: z.string().uuid('Invalid post ID'),
  /** Optional edits to apply when approving. */
  content: z
    .string()
    .min(1, 'Post content cannot be empty')
    .max(POST_MAX_LENGTH, `Post content must be at most ${POST_MAX_LENGTH} characters`)
    .optional(),
  hook: z
    .string()
    .max(HOOK_MAX_LENGTH, `Hook must be at most ${HOOK_MAX_LENGTH} characters`)
    .nullish(),
  hashtags: hashtagsArraySchema.optional(),
  scheduledAt: isoDateTimeSchema.nullish(),
});

export type PostApproveInput = z.infer<typeof postApproveSchema>;

// ---- Reschedule post -------------------------------------------------------

export const postRescheduleSchema = z.object({
  postId: z.string().uuid('Invalid post ID'),
  scheduledAt: isoDateTimeSchema,
});

export type PostRescheduleInput = z.infer<typeof postRescheduleSchema>;

// ---- Exported field schemas (for composition elsewhere) --------------------

export {
  postStatusSchema,
  postFormatSchema,
  hashtagSchema,
  hashtagsArraySchema,
  isoDateTimeSchema,
};
