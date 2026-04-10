import { z } from 'zod';
import { TRPCError } from '@trpc/server';
import { eq, and, isNull, desc, gte, lte, sql } from 'drizzle-orm';
import { router, protectedProcedure } from '../trpc.js';
import { posts } from '../../db/schema/posts.js';
import { postAnalytics } from '../../db/schema/post-analytics.js';
import { contentPillars } from '../../db/schema/content-pillars.js';

const timeRangeSchema = z.object({
  from: z.string().datetime(),
  to: z.string().datetime(),
});

export const analyticsRouter = router({
  /**
   * Get detailed metrics for a single post (all snapshots).
   */
  postMetrics: protectedProcedure
    .input(z.object({ postId: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      // Verify post ownership
      const [post] = await ctx.db
        .select({ id: posts.id })
        .from(posts)
        .where(
          and(
            eq(posts.publicId, input.postId),
            eq(posts.userId, ctx.user.id),
            isNull(posts.deletedAt),
          ),
        )
        .limit(1);

      if (!post) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Post not found.' });
      }

      const snapshots = await ctx.db
        .select({
          impressions: postAnalytics.impressions,
          reactions: postAnalytics.reactions,
          comments: postAnalytics.comments,
          reposts: postAnalytics.reposts,
          clicks: postAnalytics.clicks,
          engagementRate: postAnalytics.engagementRate,
          snapshotAt: postAnalytics.snapshotAt,
        })
        .from(postAnalytics)
        .where(eq(postAnalytics.postId, post.id))
        .orderBy(desc(postAnalytics.snapshotAt));

      // Latest snapshot is the "current" metrics
      const latest = snapshots[0] ?? null;

      return { snapshots, latest };
    }),

  /**
   * Get aggregate dashboard metrics for the authenticated user.
   */
  dashboard: protectedProcedure
    .input(z.object({ range: timeRangeSchema.optional() }))
    .query(async ({ ctx, input }) => {
      const from = input.range?.from
        ? new Date(input.range.from)
        : new Date(Date.now() - 30 * 24 * 60 * 60 * 1000); // last 30 days
      const to = input.range?.to ? new Date(input.range.to) : new Date();

      // Aggregate latest analytics for each published post in range
      const metrics = await ctx.db
        .select({
          totalImpressions: sql<number>`coalesce(sum(${postAnalytics.impressions}), 0)::int`,
          totalReactions: sql<number>`coalesce(sum(${postAnalytics.reactions}), 0)::int`,
          totalComments: sql<number>`coalesce(sum(${postAnalytics.comments}), 0)::int`,
          totalReposts: sql<number>`coalesce(sum(${postAnalytics.reposts}), 0)::int`,
          totalClicks: sql<number>`coalesce(sum(${postAnalytics.clicks}), 0)::int`,
          avgEngagement: sql<number>`coalesce(avg(${postAnalytics.engagementRate}::numeric), 0)::float`,
          postCount: sql<number>`count(distinct ${postAnalytics.postId})::int`,
        })
        .from(postAnalytics)
        .where(
          and(
            eq(postAnalytics.userId, ctx.user.id),
            gte(postAnalytics.snapshotAt, from),
            lte(postAnalytics.snapshotAt, to),
          ),
        );

      // Post status breakdown
      const statusCounts = await ctx.db
        .select({
          status: posts.status,
          count: sql<number>`count(*)::int`,
        })
        .from(posts)
        .where(
          and(
            eq(posts.userId, ctx.user.id),
            isNull(posts.deletedAt),
          ),
        )
        .groupBy(posts.status);

      const statusBreakdown: Record<string, number> = {};
      for (const row of statusCounts) {
        statusBreakdown[row.status] = row.count;
      }

      return {
        ...metrics[0],
        statusBreakdown,
        period: { from: from.toISOString(), to: to.toISOString() },
      };
    }),

  /**
   * Get performance breakdown by content pillar.
   */
  pillarPerformance: protectedProcedure
    .input(z.object({ range: timeRangeSchema.optional() }))
    .query(async ({ ctx, input }) => {
      const from = input.range?.from
        ? new Date(input.range.from)
        : new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
      const to = input.range?.to ? new Date(input.range.to) : new Date();

      const rows = await ctx.db
        .select({
          pillarId: contentPillars.publicId,
          pillarName: contentPillars.name,
          pillarColor: contentPillars.color,
          postCount: sql<number>`count(distinct ${posts.id})::int`,
          totalImpressions: sql<number>`coalesce(sum(${postAnalytics.impressions}), 0)::int`,
          totalReactions: sql<number>`coalesce(sum(${postAnalytics.reactions}), 0)::int`,
          avgEngagement: sql<number>`coalesce(avg(${postAnalytics.engagementRate}::numeric), 0)::float`,
        })
        .from(contentPillars)
        .leftJoin(posts, and(
          eq(posts.pillarId, contentPillars.id),
          eq(posts.status, 'published'),
          isNull(posts.deletedAt),
        ))
        .leftJoin(postAnalytics, and(
          eq(postAnalytics.postId, posts.id),
          gte(postAnalytics.snapshotAt, from),
          lte(postAnalytics.snapshotAt, to),
        ))
        .where(
          and(
            eq(contentPillars.userId, ctx.user.id),
            isNull(contentPillars.deletedAt),
          ),
        )
        .groupBy(contentPillars.publicId, contentPillars.name, contentPillars.color);

      return rows;
    }),

  /**
   * Get a weekly report summary.
   */
  weeklyReport: protectedProcedure
    .input(z.object({ weekOf: z.string().datetime().optional() }))
    .query(async ({ ctx, input }) => {
      const weekStart = input.weekOf
        ? getWeekStart(new Date(input.weekOf))
        : getWeekStart(new Date());
      const weekEnd = new Date(weekStart.getTime() + 7 * 24 * 60 * 60 * 1000);
      const prevWeekStart = new Date(weekStart.getTime() - 7 * 24 * 60 * 60 * 1000);

      // This week's published posts
      const thisWeekPosts = await ctx.db
        .select({
          id: posts.publicId,
          content: posts.content,
          hook: posts.hook,
          publishedAt: posts.publishedAt,
          pillarName: contentPillars.name,
        })
        .from(posts)
        .leftJoin(contentPillars, eq(posts.pillarId, contentPillars.id))
        .where(
          and(
            eq(posts.userId, ctx.user.id),
            eq(posts.status, 'published'),
            gte(posts.publishedAt, weekStart),
            lte(posts.publishedAt, weekEnd),
            isNull(posts.deletedAt),
          ),
        )
        .orderBy(desc(posts.publishedAt));

      // Aggregate engagement this week
      const thisWeekMetrics = await ctx.db
        .select({
          totalImpressions: sql<number>`coalesce(sum(${postAnalytics.impressions}), 0)::int`,
          totalReactions: sql<number>`coalesce(sum(${postAnalytics.reactions}), 0)::int`,
          totalComments: sql<number>`coalesce(sum(${postAnalytics.comments}), 0)::int`,
          avgEngagement: sql<number>`coalesce(avg(${postAnalytics.engagementRate}::numeric), 0)::float`,
        })
        .from(postAnalytics)
        .where(
          and(
            eq(postAnalytics.userId, ctx.user.id),
            gte(postAnalytics.snapshotAt, weekStart),
            lte(postAnalytics.snapshotAt, weekEnd),
          ),
        );

      // Previous week metrics for comparison
      const prevWeekMetrics = await ctx.db
        .select({
          totalImpressions: sql<number>`coalesce(sum(${postAnalytics.impressions}), 0)::int`,
          totalReactions: sql<number>`coalesce(sum(${postAnalytics.reactions}), 0)::int`,
          postCount: sql<number>`count(distinct ${postAnalytics.postId})::int`,
        })
        .from(postAnalytics)
        .where(
          and(
            eq(postAnalytics.userId, ctx.user.id),
            gte(postAnalytics.snapshotAt, prevWeekStart),
            lte(postAnalytics.snapshotAt, weekStart),
          ),
        );

      return {
        weekOf: weekStart.toISOString(),
        postsPublished: thisWeekPosts.length,
        posts: thisWeekPosts,
        metrics: thisWeekMetrics[0],
        previousWeek: prevWeekMetrics[0],
      };
    }),
});

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function getWeekStart(date: Date): Date {
  const d = new Date(date);
  const day = d.getDay();
  d.setDate(d.getDate() - day); // Sunday = start of week
  d.setHours(0, 0, 0, 0);
  return d;
}
