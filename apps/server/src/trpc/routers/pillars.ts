import { z } from 'zod';
import { TRPCError } from '@trpc/server';
import { eq, and, isNull, asc, sql } from 'drizzle-orm';
import { router, protectedProcedure } from '../trpc.js';
import { contentPillars } from '../../db/schema/content-pillars.js';

const MAX_ACTIVE_PILLARS = 10;

const createPillarSchema = z.object({
  name: z.string().min(1).max(100),
  description: z.string().max(500).nullable().optional(),
  weight: z.number().min(0).max(1).default(0.2),
  color: z
    .string()
    .regex(/^#[0-9a-fA-F]{6}$/, 'Must be a hex color (e.g. #6366f1)')
    .nullable()
    .optional(),
  sortOrder: z.number().int().min(0).default(0),
});

const updatePillarSchema = z.object({
  id: z.string().uuid(),
  name: z.string().min(1).max(100).optional(),
  description: z.string().max(500).nullable().optional(),
  weight: z.number().min(0).max(1).optional(),
  color: z
    .string()
    .regex(/^#[0-9a-fA-F]{6}$/)
    .nullable()
    .optional(),
  sortOrder: z.number().int().min(0).optional(),
});

export const pillarsRouter = router({
  /**
   * List all active content pillars for the authenticated user.
   */
  list: protectedProcedure.query(async ({ ctx }) => {
    const rows = await ctx.db
      .select({
        id: contentPillars.publicId,
        name: contentPillars.name,
        description: contentPillars.description,
        weight: contentPillars.weight,
        performanceScore: contentPillars.performanceScore,
        color: contentPillars.color,
        sortOrder: contentPillars.sortOrder,
        createdAt: contentPillars.createdAt,
      })
      .from(contentPillars)
      .where(
        and(
          eq(contentPillars.userId, ctx.user.id),
          isNull(contentPillars.deletedAt),
        ),
      )
      .orderBy(asc(contentPillars.sortOrder));

    return rows;
  }),

  /**
   * Create a new content pillar.
   */
  create: protectedProcedure
    .input(createPillarSchema)
    .mutation(async ({ ctx, input }) => {
      // Check max active pillars
      const countResult = await ctx.db
        .select({ count: sql<number>`count(*)::int` })
        .from(contentPillars)
        .where(
          and(
            eq(contentPillars.userId, ctx.user.id),
            isNull(contentPillars.deletedAt),
          ),
        );

      const activeCount = countResult[0]?.count ?? 0;
      if (activeCount >= MAX_ACTIVE_PILLARS) {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: `Maximum ${MAX_ACTIVE_PILLARS} active content pillars allowed.`,
        });
      }

      const [created] = await ctx.db
        .insert(contentPillars)
        .values({
          userId: ctx.user.id,
          name: input.name,
          description: input.description ?? null,
          weight: String(input.weight),
          color: input.color ?? null,
          sortOrder: input.sortOrder,
        })
        .returning({
          id: contentPillars.publicId,
          name: contentPillars.name,
          description: contentPillars.description,
          weight: contentPillars.weight,
          color: contentPillars.color,
          sortOrder: contentPillars.sortOrder,
          createdAt: contentPillars.createdAt,
        });

      return created;
    }),

  /**
   * Update an existing content pillar.
   */
  update: protectedProcedure
    .input(updatePillarSchema)
    .mutation(async ({ ctx, input }) => {
      const [pillar] = await ctx.db
        .select({ id: contentPillars.id })
        .from(contentPillars)
        .where(
          and(
            eq(contentPillars.publicId, input.id),
            eq(contentPillars.userId, ctx.user.id),
            isNull(contentPillars.deletedAt),
          ),
        )
        .limit(1);

      if (!pillar) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Content pillar not found.' });
      }

      const updateData: Record<string, unknown> = { updatedAt: new Date() };
      if (input.name !== undefined) updateData['name'] = input.name;
      if (input.description !== undefined) updateData['description'] = input.description;
      if (input.weight !== undefined) updateData['weight'] = String(input.weight);
      if (input.color !== undefined) updateData['color'] = input.color;
      if (input.sortOrder !== undefined) updateData['sortOrder'] = input.sortOrder;

      const [updated] = await ctx.db
        .update(contentPillars)
        .set(updateData)
        .where(eq(contentPillars.id, pillar.id))
        .returning({
          id: contentPillars.publicId,
          name: contentPillars.name,
          description: contentPillars.description,
          weight: contentPillars.weight,
          color: contentPillars.color,
          sortOrder: contentPillars.sortOrder,
          updatedAt: contentPillars.updatedAt,
        });

      return updated;
    }),

  /**
   * Soft-delete a content pillar.
   */
  delete: protectedProcedure
    .input(z.object({ id: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      const [pillar] = await ctx.db
        .select({ id: contentPillars.id })
        .from(contentPillars)
        .where(
          and(
            eq(contentPillars.publicId, input.id),
            eq(contentPillars.userId, ctx.user.id),
            isNull(contentPillars.deletedAt),
          ),
        )
        .limit(1);

      if (!pillar) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Content pillar not found.' });
      }

      await ctx.db
        .update(contentPillars)
        .set({ deletedAt: new Date(), updatedAt: new Date() })
        .where(eq(contentPillars.id, pillar.id));

      return { success: true };
    }),
});
