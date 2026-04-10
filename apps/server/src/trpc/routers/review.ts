import { z } from 'zod';
import { TRPCError } from '@trpc/server';
import { eq, and, isNull, desc, asc, inArray, sql } from 'drizzle-orm';
import { router, protectedProcedure } from '../trpc.js';
import { posts } from '../../db/schema/posts.js';
import { contentPillars } from '../../db/schema/content-pillars.js';

export const reviewRouter = router({
  /**
   * Get the next batch of pending (draft) posts for review.
   */
  getPending: protectedProcedure
    .input(
      z.object({
        limit: z.number().int().min(1).max(20).default(5),
        cursor: z.number().int().min(0).default(0),
      }),
    )
    .query(async ({ ctx, input }) => {
      const rows = await ctx.db
        .select({
          id: posts.publicId,
          content: posts.content,
          hook: posts.hook,
          hashtags: posts.hashtags,
          format: posts.format,
          status: posts.status,
          scheduledAt: posts.scheduledAt,
          createdAt: posts.createdAt,
          pillarName: contentPillars.name,
          pillarId: posts.pillarId,
          regenerationCount: posts.regenerationCount,
        })
        .from(posts)
        .leftJoin(contentPillars, eq(posts.pillarId, contentPillars.id))
        .where(
          and(
            eq(posts.userId, ctx.user.id),
            eq(posts.status, 'draft'),
            isNull(posts.deletedAt),
          ),
        )
        .orderBy(asc(posts.scheduledAt), asc(posts.createdAt))
        .limit(input.limit)
        .offset(input.cursor);

      // Get total count for pagination
      const countResult = await ctx.db
        .select({ count: sql<number>`count(*)::int` })
        .from(posts)
        .where(
          and(
            eq(posts.userId, ctx.user.id),
            eq(posts.status, 'draft'),
            isNull(posts.deletedAt),
          ),
        );

      const total = countResult[0]?.count ?? 0;

      return {
        items: rows,
        total,
        hasMore: input.cursor + input.limit < total,
      };
    }),

  /**
   * Approve a post (moves from draft -> approved).
   */
  approve: protectedProcedure
    .input(
      z.object({
        postId: z.string().uuid(),
        scheduledAt: z.string().datetime().optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const post = await findOwnedDraftPost(ctx, input.postId);

      const [updated] = await ctx.db
        .update(posts)
        .set({
          status: 'approved',
          approvedAt: new Date(),
          scheduledAt: input.scheduledAt ? new Date(input.scheduledAt) : post.scheduledAt,
          updatedAt: new Date(),
        })
        .where(eq(posts.id, post.id))
        .returning({ publicId: posts.publicId, status: posts.status });

      return updated;
    }),

  /**
   * Approve a post with edits (user modifies content before approving).
   */
  approveWithEdit: protectedProcedure
    .input(
      z.object({
        postId: z.string().uuid(),
        content: z.string().min(1).max(3200),
        hook: z.string().max(500).nullable().optional(),
        hashtags: z.array(z.string().max(100)).max(30).optional(),
        scheduledAt: z.string().datetime().optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const post = await findOwnedDraftPost(ctx, input.postId);

      const [updated] = await ctx.db
        .update(posts)
        .set({
          content: input.content,
          hook: input.hook ?? post.hook,
          hashtags: input.hashtags ?? post.hashtags,
          status: 'approved',
          approvedAt: new Date(),
          scheduledAt: input.scheduledAt ? new Date(input.scheduledAt) : post.scheduledAt,
          updatedAt: new Date(),
        })
        .where(eq(posts.id, post.id))
        .returning({
          publicId: posts.publicId,
          content: posts.content,
          status: posts.status,
        });

      return updated;
    }),

  /**
   * Skip a post (will not be published).
   */
  skip: protectedProcedure
    .input(
      z.object({
        postId: z.string().uuid(),
        reason: z.string().max(500).optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const post = await findOwnedDraftPost(ctx, input.postId);

      const [updated] = await ctx.db
        .update(posts)
        .set({
          status: 'skipped',
          updatedAt: new Date(),
        })
        .where(eq(posts.id, post.id))
        .returning({ publicId: posts.publicId, status: posts.status });

      return updated;
    }),

  /**
   * Get history of reviewed posts (approved, skipped, published, failed).
   */
  getHistory: protectedProcedure
    .input(
      z.object({
        status: z
          .enum(['approved', 'published', 'skipped', 'failed'])
          .optional(),
        limit: z.number().int().min(1).max(50).default(20),
        cursor: z.number().int().min(0).default(0),
      }),
    )
    .query(async ({ ctx, input }) => {
      const statusFilter = input.status
        ? eq(posts.status, input.status)
        : inArray(posts.status, ['approved', 'published', 'skipped', 'failed']);

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
          pillarName: contentPillars.name,
          createdAt: posts.createdAt,
          updatedAt: posts.updatedAt,
        })
        .from(posts)
        .leftJoin(contentPillars, eq(posts.pillarId, contentPillars.id))
        .where(
          and(
            eq(posts.userId, ctx.user.id),
            statusFilter,
            isNull(posts.deletedAt),
          ),
        )
        .orderBy(desc(posts.updatedAt))
        .limit(input.limit)
        .offset(input.cursor);

      const countResult = await ctx.db
        .select({ count: sql<number>`count(*)::int` })
        .from(posts)
        .where(
          and(
            eq(posts.userId, ctx.user.id),
            statusFilter,
            isNull(posts.deletedAt),
          ),
        );

      const total = countResult[0]?.count ?? 0;

      return {
        items: rows,
        total,
        hasMore: input.cursor + input.limit < total,
      };
    }),
});

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

interface ReviewContext {
  db: import('../../db/client.js').Database;
  user: { id: number };
}

async function findOwnedDraftPost(ctx: ReviewContext, publicId: string) {
  const [post] = await ctx.db
    .select()
    .from(posts)
    .where(
      and(
        eq(posts.publicId, publicId),
        eq(posts.userId, ctx.user.id),
        eq(posts.status, 'draft'),
        isNull(posts.deletedAt),
      ),
    )
    .limit(1);

  if (!post) {
    throw new TRPCError({
      code: 'NOT_FOUND',
      message: 'Post not found, not in draft status, or not owned by you.',
    });
  }

  return post;
}
