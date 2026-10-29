import { z } from 'zod';
import { TRPCError } from '@trpc/server';
import { eq, and, isNull, desc, asc, sql, gte, lte, isNotNull, or } from 'drizzle-orm';
import { router, protectedProcedure } from '../trpc.js';
import { posts } from '../../db/schema/posts.js';
import { contentPillars } from '../../db/schema/content-pillars.js';
import { getQueue, QUEUE_NAMES } from '../../workers/index.js';

const postFormatEnum = z.enum(['text', 'image', 'carousel', 'poll']);
const postStatusEnum = z.enum([
  'draft',
  'approved',
  'scheduled',
  'published',
  'skipped',
  'failed',
]);

const listPostsSchema = z.object({
  status: postStatusEnum.optional(),
  pillarId: z.string().uuid().optional(),
  cursor: z.number().int().min(0).default(0),
  limit: z.number().int().min(1).max(50).default(20),
  sortBy: z.enum(['scheduledAt', 'createdAt', 'publishedAt']).default('createdAt'),
  sortOrder: z.enum(['asc', 'desc']).default('desc'),
});

const generateBatchSchema = z.object({
  count: z.number().int().min(1).max(7).default(7),
  pillarIds: z.array(z.string().uuid()).optional(),
  scheduledDates: z.array(z.string().datetime()).optional(),
  formats: z.array(postFormatEnum).optional(),
});

const updatePostSchema = z.object({
  id: z.string().uuid(),
  content: z.string().min(1).max(3200).optional(),
  hook: z.string().max(500).nullable().optional(),
  hashtags: z.array(z.string().max(100)).max(30).optional(),
  format: postFormatEnum.optional(),
  scheduledAt: z.string().datetime().nullable().optional(),
  pillarId: z.string().uuid().nullable().optional(),
});

const SORT_COLUMN_MAP = {
  scheduledAt: posts.scheduledAt,
  createdAt: posts.createdAt,
  publishedAt: posts.publishedAt,
} as const;

export const postsRouter = router({
  /**
   * List posts with filtering, pagination, and sorting.
   */
  list: protectedProcedure
    .input(listPostsSchema)
    .query(async ({ ctx, input }) => {
      const conditions = [
        eq(posts.userId, ctx.user.id),
        isNull(posts.deletedAt),
      ];

      if (input.status) {
        conditions.push(eq(posts.status, input.status));
      }

      // If pillarId provided, resolve from public ID to internal ID
      if (input.pillarId) {
        const [pillar] = await ctx.db
          .select({ id: contentPillars.id })
          .from(contentPillars)
          .where(
            and(
              eq(contentPillars.publicId, input.pillarId),
              eq(contentPillars.userId, ctx.user.id),
            ),
          )
          .limit(1);

        if (pillar) {
          conditions.push(eq(posts.pillarId, pillar.id));
        }
      }

      const sortCol = SORT_COLUMN_MAP[input.sortBy];
      const orderFn = input.sortOrder === 'asc' ? asc : desc;

      const rows = await ctx.db
        .select({
          id: posts.publicId,
          content: posts.content,
          hook: posts.hook,
          hashtags: posts.hashtags,
          format: posts.format,
          status: posts.status,
          scheduledAt: posts.scheduledAt,
          approvedAt: posts.approvedAt,
          publishedAt: posts.publishedAt,
          linkedinPostUrl: posts.linkedinPostUrl,
          regenerationCount: posts.regenerationCount,
          pillarName: contentPillars.name,
          createdAt: posts.createdAt,
          updatedAt: posts.updatedAt,
        })
        .from(posts)
        .leftJoin(contentPillars, eq(posts.pillarId, contentPillars.id))
        .where(and(...conditions))
        .orderBy(orderFn(sortCol))
        .limit(input.limit)
        .offset(input.cursor);

      const countResult = await ctx.db
        .select({ count: sql<number>`count(*)::int` })
        .from(posts)
        .where(and(...conditions));

      const total = countResult[0]?.count ?? 0;

      return {
        items: rows,
        total,
        hasMore: input.cursor + input.limit < total,
      };
    }),

  /**
   * List scheduled + published posts within a date window, for the calendar view.
   *
   * Returns minimal fields: id, hook/title, content preview, status, scheduledAt,
   * publishedAt, pillarName, pillarColor.
   */
  calendar: protectedProcedure
    .input(
      z.object({
        from: z.string().datetime(),
        to: z.string().datetime(),
      }),
    )
    .query(async ({ ctx, input }) => {
      const from = new Date(input.from);
      const to = new Date(input.to);

      const rows = await ctx.db
        .select({
          id: posts.publicId,
          content: posts.content,
          hook: posts.hook,
          status: posts.status,
          format: posts.format,
          scheduledAt: posts.scheduledAt,
          publishedAt: posts.publishedAt,
          pillarName: contentPillars.name,
          pillarColor: contentPillars.color,
        })
        .from(posts)
        .leftJoin(contentPillars, eq(posts.pillarId, contentPillars.id))
        .where(
          and(
            eq(posts.userId, ctx.user.id),
            isNull(posts.deletedAt),
            or(
              and(
                isNotNull(posts.scheduledAt),
                gte(posts.scheduledAt, from),
                lte(posts.scheduledAt, to),
              ),
              and(
                isNotNull(posts.publishedAt),
                gte(posts.publishedAt, from),
                lte(posts.publishedAt, to),
              ),
            ),
          ),
        )
        .orderBy(asc(posts.scheduledAt));

      return { items: rows };
    }),

  /**
   * Get a single post by its public ID.
   */
  getById: protectedProcedure
    .input(z.object({ id: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      const [post] = await ctx.db
        .select({
          id: posts.publicId,
          content: posts.content,
          hook: posts.hook,
          hashtags: posts.hashtags,
          format: posts.format,
          status: posts.status,
          aiModel: posts.aiModel,
          regenerationCount: posts.regenerationCount,
          scheduledAt: posts.scheduledAt,
          approvedAt: posts.approvedAt,
          publishedAt: posts.publishedAt,
          linkedinPostId: posts.linkedinPostId,
          linkedinPostUrl: posts.linkedinPostUrl,
          publishAttemptCount: posts.publishAttemptCount,
          lastPublishError: posts.lastPublishError,
          pillarName: contentPillars.name,
          createdAt: posts.createdAt,
          updatedAt: posts.updatedAt,
        })
        .from(posts)
        .leftJoin(contentPillars, eq(posts.pillarId, contentPillars.id))
        .where(
          and(
            eq(posts.publicId, input.id),
            eq(posts.userId, ctx.user.id),
            isNull(posts.deletedAt),
          ),
        )
        .limit(1);

      if (!post) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Post not found.' });
      }

      return post;
    }),

  /**
   * Generate a batch of AI-written posts.
   * Returns a job ID for polling progress.
   */
  generateBatch: protectedProcedure
    .input(generateBatchSchema)
    .mutation(async ({ ctx, input }) => {
      const queue = getQueue(QUEUE_NAMES.GENERATE_CONTENT, ctx.redis);

      const job = await queue.add('generate-batch', {
        userId: ctx.user.id,
        userPublicId: ctx.user.publicId,
        count: input.count,
        pillarIds: input.pillarIds,
        scheduledDates: input.scheduledDates,
        formats: input.formats,
      });

      return { jobId: job.id, count: input.count };
    }),

  /**
   * Poll the status of a generate-content job (batch or regenerate).
   */
  generateStatus: protectedProcedure
    .input(z.object({ jobId: z.string().min(1) }))
    .query(async ({ ctx, input }) => {
      const queue = getQueue(QUEUE_NAMES.GENERATE_CONTENT, ctx.redis);
      const job = await queue.getJob(input.jobId);

      if (!job) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Job not found.' });
      }

      const state = await job.getState();

      return {
        jobId: input.jobId,
        state, // 'active' | 'waiting' | 'completed' | 'failed' | 'delayed'
        progress: job.progress,
        returnValue: state === 'completed' ? job.returnvalue : null,
        failedReason: state === 'failed' ? job.failedReason : null,
      };
    }),

  /**
   * Regenerate a single post (increment regeneration_count).
   */
  regenerate: protectedProcedure
    .input(
      z.object({
        id: z.string().uuid(),
        instructions: z.string().max(1000).optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const [post] = await ctx.db
        .select()
        .from(posts)
        .where(
          and(
            eq(posts.publicId, input.id),
            eq(posts.userId, ctx.user.id),
            isNull(posts.deletedAt),
          ),
        )
        .limit(1);

      if (!post) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Post not found.' });
      }

      if (post.status !== 'draft') {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: 'Only draft posts can be regenerated.',
        });
      }

      // Increment regeneration count
      await ctx.db
        .update(posts)
        .set({
          regenerationCount: post.regenerationCount + 1,
          updatedAt: new Date(),
        })
        .where(eq(posts.id, post.id));

      const queue = getQueue(QUEUE_NAMES.GENERATE_CONTENT, ctx.redis);

      const job = await queue.add('regenerate-single', {
        userId: ctx.user.id,
        postId: post.id,
        publicId: post.publicId,
        instructions: input.instructions,
      });

      return { jobId: job.id };
    }),

  /**
   * Update a post's content or metadata.
   */
  update: protectedProcedure
    .input(updatePostSchema)
    .mutation(async ({ ctx, input }) => {
      const [post] = await ctx.db
        .select()
        .from(posts)
        .where(
          and(
            eq(posts.publicId, input.id),
            eq(posts.userId, ctx.user.id),
            isNull(posts.deletedAt),
          ),
        )
        .limit(1);

      if (!post) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Post not found.' });
      }

      if (post.status !== 'draft' && post.status !== 'approved') {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: 'Only draft or approved posts can be edited.',
        });
      }

      const updateData: Record<string, unknown> = { updatedAt: new Date() };

      if (input.content !== undefined) updateData['content'] = input.content;
      if (input.hook !== undefined) updateData['hook'] = input.hook;
      if (input.hashtags !== undefined) updateData['hashtags'] = input.hashtags;
      if (input.format !== undefined) updateData['format'] = input.format;
      if (input.scheduledAt !== undefined) {
        updateData['scheduledAt'] = input.scheduledAt ? new Date(input.scheduledAt) : null;
      }

      const [updated] = await ctx.db
        .update(posts)
        .set(updateData)
        .where(eq(posts.id, post.id))
        .returning({
          id: posts.publicId,
          content: posts.content,
          status: posts.status,
          updatedAt: posts.updatedAt,
        });

      return updated;
    }),

  /**
   * Soft-delete a post.
   */
  delete: protectedProcedure
    .input(z.object({ id: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      const [post] = await ctx.db
        .select({ id: posts.id, status: posts.status })
        .from(posts)
        .where(
          and(
            eq(posts.publicId, input.id),
            eq(posts.userId, ctx.user.id),
            isNull(posts.deletedAt),
          ),
        )
        .limit(1);

      if (!post) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Post not found.' });
      }

      await ctx.db
        .update(posts)
        .set({ deletedAt: new Date(), updatedAt: new Date() })
        .where(eq(posts.id, post.id));

      return { success: true };
    }),
});
