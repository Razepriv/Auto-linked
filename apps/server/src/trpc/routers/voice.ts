import { z } from 'zod';
import { TRPCError } from '@trpc/server';
import { eq, desc } from 'drizzle-orm';
import { router, protectedProcedure } from '../trpc.js';
import { voiceProfiles } from '../../db/schema/voice-profiles.js';
import { getQueue, QUEUE_NAMES } from '../../workers/index.js';

const voiceProfileUpdateSchema = z.object({
  tone: z.string().optional(),
  avgPostLength: z.number().int().min(10).max(3000).optional(),
  emojiFrequency: z.string().optional(),
  hashtagStyle: z.string().optional(),
  formatting: z.string().optional(),
  lineBreakStyle: z.string().optional(),
  userNotes: z.string().max(2000).nullable().optional(),
});

export const voiceRouter = router({
  /**
   * Get the user's current (latest version) voice profile.
   */
  getProfile: protectedProcedure.query(async ({ ctx }) => {
    const [profile] = await ctx.db
      .select({
        id: voiceProfiles.id,
        versionNumber: voiceProfiles.versionNumber,
        tone: voiceProfiles.tone,
        avgPostLength: voiceProfiles.avgPostLength,
        emojiFrequency: voiceProfiles.emojiFrequency,
        hashtagStyle: voiceProfiles.hashtagStyle,
        formatting: voiceProfiles.formatting,
        lineBreakStyle: voiceProfiles.lineBreakStyle,
        analysisData: voiceProfiles.analysisData,
        analyzedPostCount: voiceProfiles.analyzedPostCount,
        analysisSource: voiceProfiles.analysisSource,
        userEdited: voiceProfiles.userEdited,
        userNotes: voiceProfiles.userNotes,
        createdAt: voiceProfiles.createdAt,
        updatedAt: voiceProfiles.updatedAt,
      })
      .from(voiceProfiles)
      .where(eq(voiceProfiles.userId, ctx.user.id))
      .orderBy(desc(voiceProfiles.versionNumber))
      .limit(1);

    if (!profile) {
      return null;
    }

    return profile;
  }),

  /**
   * Update the current voice profile.
   * Structural field changes create a new version; notes-only updates are in-place.
   */
  updateProfile: protectedProcedure
    .input(voiceProfileUpdateSchema)
    .mutation(async ({ ctx, input }) => {
      // Get current profile
      const [current] = await ctx.db
        .select()
        .from(voiceProfiles)
        .where(eq(voiceProfiles.userId, ctx.user.id))
        .orderBy(desc(voiceProfiles.versionNumber))
        .limit(1);

      const hasStructuralChange =
        (input.tone !== undefined && input.tone !== current?.tone) ||
        (input.avgPostLength !== undefined && input.avgPostLength !== current?.avgPostLength) ||
        (input.emojiFrequency !== undefined && input.emojiFrequency !== current?.emojiFrequency) ||
        (input.hashtagStyle !== undefined && input.hashtagStyle !== current?.hashtagStyle) ||
        (input.formatting !== undefined && input.formatting !== current?.formatting) ||
        (input.lineBreakStyle !== undefined && input.lineBreakStyle !== current?.lineBreakStyle);

      if (!current) {
        // Create first profile
        const [created] = await ctx.db
          .insert(voiceProfiles)
          .values({
            userId: ctx.user.id,
            versionNumber: 1,
            tone: input.tone ?? 'professional-casual',
            avgPostLength: input.avgPostLength ?? 200,
            emojiFrequency: input.emojiFrequency ?? 'light',
            hashtagStyle: input.hashtagStyle ?? 'minimal',
            formatting: input.formatting ?? 'spaced',
            lineBreakStyle: input.lineBreakStyle ?? 'double',
            userEdited: true,
            userNotes: input.userNotes ?? null,
            analysisSource: 'questionnaire',
          })
          .returning();

        return created;
      }

      if (hasStructuralChange) {
        // Create new version
        const [newVersion] = await ctx.db
          .insert(voiceProfiles)
          .values({
            userId: ctx.user.id,
            versionNumber: current.versionNumber + 1,
            tone: input.tone ?? current.tone,
            avgPostLength: input.avgPostLength ?? current.avgPostLength,
            emojiFrequency: input.emojiFrequency ?? current.emojiFrequency,
            hashtagStyle: input.hashtagStyle ?? current.hashtagStyle,
            formatting: input.formatting ?? current.formatting,
            lineBreakStyle: input.lineBreakStyle ?? current.lineBreakStyle,
            analysisData: current.analysisData,
            analyzedPostCount: current.analyzedPostCount,
            analysisSource: current.analysisSource,
            userEdited: true,
            userNotes: input.userNotes !== undefined ? input.userNotes : current.userNotes,
          })
          .returning();

        return newVersion;
      }

      // Notes-only in-place update
      const [updated] = await ctx.db
        .update(voiceProfiles)
        .set({
          userEdited: true,
          userNotes: input.userNotes !== undefined ? input.userNotes : current.userNotes,
          updatedAt: new Date(),
        })
        .where(eq(voiceProfiles.id, current.id))
        .returning();

      return updated;
    }),

  /**
   * Import raw LinkedIn post samples (pasted text or parsed CSV rows) and
   * immediately kick off the voice-analysis worker. This lets users refresh
   * their voice profile from the settings page without re-running onboarding.
   *
   * Samples are stored in Redis at the same key the analyze-voice worker
   * reads from (`onboarding:posts:${userId}`), so the existing pipeline can
   * consume them unchanged.
   */
  importSamples: protectedProcedure
    .input(
      z.object({
        posts: z
          .array(
            z.object({
              text: z.string().min(1),
              date: z.string().nullable(),
            }),
          )
          .min(1)
          .max(200),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const redisKey = `onboarding:posts:${ctx.user.id}`;
      await ctx.redis.set(
        redisKey,
        JSON.stringify(input.posts),
        'EX',
        60 * 60 * 24, // keep for 24h so re-analysis can reuse them
      );

      const queue = getQueue(QUEUE_NAMES.ANALYZE_VOICE, ctx.redis);
      const job = await queue.add('analyze-voice', {
        userId: ctx.user.id,
        userPublicId: ctx.user.publicId,
        source: 'linkedin_history',
      });

      return { jobId: job.id, postCount: input.posts.length };
    }),

  /**
   * Trigger a re-analysis of the user's voice.
   * Returns a job ID to poll for status.
   */
  reanalyze: protectedProcedure
    .input(
      z.object({
        source: z.enum(['linkedin_history', 'questionnaire', 'both']).default('linkedin_history'),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const queue = getQueue(QUEUE_NAMES.ANALYZE_VOICE, ctx.redis);

      const job = await queue.add('analyze-voice', {
        userId: ctx.user.id,
        userPublicId: ctx.user.publicId,
        source: input.source,
      });

      return { jobId: job.id };
    }),

  /**
   * Check the status of a voice analysis job.
   */
  analysisStatus: protectedProcedure
    .input(z.object({ jobId: z.string().min(1) }))
    .query(async ({ ctx, input }) => {
      const queue = getQueue(QUEUE_NAMES.ANALYZE_VOICE, ctx.redis);
      const job = await queue.getJob(input.jobId);

      if (!job) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Job not found.' });
      }

      const state = await job.getState();
      const progress = job.progress;

      return {
        jobId: input.jobId,
        state, // 'active' | 'waiting' | 'completed' | 'failed' | 'delayed'
        progress,
        failedReason: state === 'failed' ? job.failedReason : null,
      };
    }),
});
