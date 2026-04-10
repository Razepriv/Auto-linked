import { z } from 'zod';
import { eq } from 'drizzle-orm';
import { router, protectedProcedure } from '../trpc.js';
import { users } from '../../db/schema/users.js';
import { contentPillars } from '../../db/schema/content-pillars.js';
import { logger } from '../../lib/logger.js';

const PILLAR_COLORS = [
  '#6366f1', '#8b5cf6', '#ec4899', '#f43f5e',
  '#f97316', '#eab308', '#22c55e', '#14b8a6',
  '#06b6d4', '#3b82f6',
];

export const onboardingRouter = router({
  /**
   * Save the user's profile info from step 1 (headline, industry, topics, audience).
   * Creates initial content pillars from the topics list.
   */
  saveProfile: protectedProcedure
    .input(
      z.object({
        headline: z.string().max(500).optional(),
        industry: z.string().max(100).optional(),
        topics: z.array(z.string().min(1).max(100)).max(10).optional(),
        audience: z.string().max(500).optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      // Update onboarding step
      await ctx.db
        .update(users)
        .set({
          onboardingStep: 'profile_saved',
          updatedAt: new Date(),
        })
        .where(eq(users.id, ctx.user.id));

      // Create content pillars from topics
      if (input.topics && input.topics.length > 0) {
        const pillarValues = input.topics.map((topic, i) => ({
          userId: ctx.user.id,
          name: topic.trim(),
          description: input.audience
            ? `Content about ${topic.trim()} for ${input.audience}`
            : `Content about ${topic.trim()}`,
          weight: (1 / input.topics!.length).toFixed(3),
          color: PILLAR_COLORS[i % PILLAR_COLORS.length],
          sortOrder: i,
        }));

        await ctx.db.insert(contentPillars).values(pillarValues);
      }

      logger.info(
        { userId: ctx.user.id, topicCount: input.topics?.length ?? 0 },
        'Onboarding profile saved',
      );

      return { success: true };
    }),

  /**
   * Save imported posts as raw text for voice analysis.
   * Stores them temporarily and kicks off voice analysis.
   */
  importPosts: protectedProcedure
    .input(
      z.object({
        posts: z.array(
          z.object({
            text: z.string().min(1),
            date: z.string().nullable(),
          }),
        ).min(1).max(200),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      // Store posts in Redis temporarily for the analysis worker
      const key = `onboarding:posts:${ctx.user.id}`;
      await ctx.redis.set(key, JSON.stringify(input.posts), 'EX', 3600);

      // Update onboarding step
      await ctx.db
        .update(users)
        .set({
          onboardingStep: 'posts_imported',
          updatedAt: new Date(),
        })
        .where(eq(users.id, ctx.user.id));

      logger.info(
        { userId: ctx.user.id, postCount: input.posts.length },
        'Onboarding posts imported',
      );

      return { success: true, postCount: input.posts.length };
    }),

  /**
   * Mark onboarding as complete.
   */
  complete: protectedProcedure.mutation(async ({ ctx }) => {
    await ctx.db
      .update(users)
      .set({
        onboardingCompletedAt: new Date(),
        onboardingStep: 'complete',
        updatedAt: new Date(),
      })
      .where(eq(users.id, ctx.user.id));

    logger.info({ userId: ctx.user.id }, 'Onboarding completed');

    return { success: true };
  }),
});
