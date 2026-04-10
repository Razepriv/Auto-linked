// ---------------------------------------------------------------------------
// Content Pillar Zod validation schemas
// ---------------------------------------------------------------------------

import { z } from 'zod';
import {
  PILLAR_NAME_MAX_LENGTH,
  PILLAR_DESCRIPTION_MAX_LENGTH,
  PILLAR_MAX_EXAMPLE_TOPICS,
} from '../constants/index.js';

// ---- Reusable field schemas ------------------------------------------------

const colorSchema = z
  .string()
  .regex(/^#[0-9a-fA-F]{6}$/, 'Color must be a valid hex color (e.g. #FF5733)')
  .default('#6366F1');

const exampleTopicsSchema = z
  .array(
    z.string().min(1, 'Topic cannot be empty').max(200, 'Topic must be at most 200 characters'),
  )
  .max(PILLAR_MAX_EXAMPLE_TOPICS, `At most ${PILLAR_MAX_EXAMPLE_TOPICS} example topics allowed`)
  .default([]);

// ---- Create pillar ---------------------------------------------------------

export const pillarCreateSchema = z.object({
  name: z
    .string()
    .min(1, 'Pillar name is required')
    .max(PILLAR_NAME_MAX_LENGTH, `Name must be at most ${PILLAR_NAME_MAX_LENGTH} characters`),
  description: z
    .string()
    .min(1, 'Pillar description is required')
    .max(
      PILLAR_DESCRIPTION_MAX_LENGTH,
      `Description must be at most ${PILLAR_DESCRIPTION_MAX_LENGTH} characters`,
    ),
  color: colorSchema.optional(),
  targetPercentage: z
    .number()
    .int('Must be a whole number')
    .min(0, 'Percentage must be at least 0')
    .max(100, 'Percentage must be at most 100')
    .default(25),
  exampleTopics: exampleTopicsSchema.optional(),
  isActive: z.boolean().default(true),
  sortOrder: z.number().int('Must be a whole number').min(0).default(0),
});

export type PillarCreateInput = z.infer<typeof pillarCreateSchema>;

// ---- Update pillar ---------------------------------------------------------

export const pillarUpdateSchema = z.object({
  name: z
    .string()
    .min(1, 'Pillar name cannot be empty')
    .max(PILLAR_NAME_MAX_LENGTH, `Name must be at most ${PILLAR_NAME_MAX_LENGTH} characters`)
    .optional(),
  description: z
    .string()
    .min(1, 'Pillar description cannot be empty')
    .max(
      PILLAR_DESCRIPTION_MAX_LENGTH,
      `Description must be at most ${PILLAR_DESCRIPTION_MAX_LENGTH} characters`,
    )
    .optional(),
  color: colorSchema.optional(),
  targetPercentage: z
    .number()
    .int('Must be a whole number')
    .min(0, 'Percentage must be at least 0')
    .max(100, 'Percentage must be at most 100')
    .optional(),
  exampleTopics: exampleTopicsSchema.optional(),
  isActive: z.boolean().optional(),
  sortOrder: z.number().int('Must be a whole number').min(0).optional(),
});

export type PillarUpdateInput = z.infer<typeof pillarUpdateSchema>;

// ---- Reorder pillars -------------------------------------------------------

export const pillarReorderSchema = z.object({
  /** Array of pillar IDs in the desired order. */
  pillarIds: z
    .array(z.string().uuid('Invalid pillar ID'))
    .min(1, 'At least one pillar ID is required'),
});

export type PillarReorderInput = z.infer<typeof pillarReorderSchema>;

// ---- Exported field schemas ------------------------------------------------

export { colorSchema, exampleTopicsSchema };
