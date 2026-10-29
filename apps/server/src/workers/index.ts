import { Worker, Queue } from 'bullmq';
import type { Redis } from 'ioredis';
import { eq, desc } from 'drizzle-orm';
import { logger } from '../lib/logger.js';
import { db } from '../db/client.js';
import { publishPost } from '../modules/publish/linkedin-publisher.js';
import { generateBatch, regeneratePost } from '../modules/content/index.js';
import { analyzeVoice } from '../modules/voice/index.js';
import { refreshAnalytics } from '../modules/analytics/index.js';
import { refreshLinkedInTokens } from '../modules/auth/refresh-linkedin-tokens.js';
import { voiceProfiles } from '../db/schema/voice-profiles.js';
import { linkedinOauthTokens } from '../db/schema/oauth-tokens.js';
import { gt } from 'drizzle-orm';

// -- Queue Names --

export const QUEUE_NAMES = {
  PUBLISH_POST: 'publish-post',
  GENERATE_CONTENT: 'generate-content',
  ANALYZE_VOICE: 'analyze-voice',
  FETCH_ANALYTICS: 'fetch-analytics',
  REFRESH_TOKENS: 'refresh-tokens',
} as const;

export type QueueName = (typeof QUEUE_NAMES)[keyof typeof QUEUE_NAMES];

// -- Queue Instances --

const queues = new Map<string, Queue>();

export function getQueue(name: QueueName, connection: Redis): Queue {
  const existing = queues.get(name);
  if (existing) {
    return existing;
  }
  const queue = new Queue(name, { connection });
  queues.set(name, queue);
  return queue;
}

// -- Worker Registration --

export function registerWorkers(connection: Redis): Worker[] {
  const workers: Worker[] = [];

  // Publish Post Worker
  const publishPostWorker = new Worker(
    QUEUE_NAMES.PUBLISH_POST,
    async (job) => {
      const workerLogger = logger.child({ worker: QUEUE_NAMES.PUBLISH_POST, jobId: job.id });
      workerLogger.info({ data: job.data }, 'Processing publish-post job');

      const { postId } = job.data as { postId: number };
      const result = await publishPost(db, postId);

      if (!result.success) {
        workerLogger.error({ error: result.error }, 'Publish failed');
        throw new Error(result.error ?? 'Publish failed');
      }

      workerLogger.info({ linkedinPostId: result.linkedinPostId }, 'Published to LinkedIn');
    },
    {
      connection,
      concurrency: 5,
      limiter: { max: 10, duration: 60_000 }, // LinkedIn API rate limit safety
    },
  );
  workers.push(publishPostWorker);

  // Generate Content Worker
  const generateContentWorker = new Worker(
    QUEUE_NAMES.GENERATE_CONTENT,
    async (job) => {
      const workerLogger = logger.child({ worker: QUEUE_NAMES.GENERATE_CONTENT, jobId: job.id });
      workerLogger.info({ name: job.name, data: job.data }, 'Processing generate-content job');

      if (job.name === 'generate-batch') {
        const { userId, count } = job.data as { userId: number; count?: number };
        if (typeof userId !== 'number') {
          throw new Error('generate-batch: userId missing from job data');
        }

        await job.updateProgress({ stage: 'starting', completed: 0, total: count ?? 0 });

        const results = await generateBatch(String(userId), count);

        const successful = results.filter((r) => r.error === null).length;
        await job.updateProgress({
          stage: 'complete',
          completed: successful,
          total: results.length,
        });

        workerLogger.info(
          { total: results.length, successful },
          'Batch generation finished',
        );

        return { total: results.length, successful, results };
      }

      if (job.name === 'regenerate-single') {
        const { publicId, instructions } = job.data as {
          publicId: string;
          instructions?: string;
        };
        if (!publicId) {
          throw new Error('regenerate-single: publicId missing from job data');
        }

        await job.updateProgress({ stage: 'regenerating' });
        const result = await regeneratePost(publicId, instructions);

        await job.updateProgress({ stage: 'complete' });
        workerLogger.info(
          { publicId: result.postId, qualityScore: result.qualityScore },
          'Regeneration finished',
        );

        return result;
      }

      workerLogger.warn({ jobName: job.name }, 'Unknown generate-content job type');
    },
    {
      connection,
      concurrency: 3,
    },
  );
  workers.push(generateContentWorker);

  // Analyze Voice Worker
  const analyzeVoiceWorker = new Worker(
    QUEUE_NAMES.ANALYZE_VOICE,
    async (job) => {
      const workerLogger = logger.child({ worker: QUEUE_NAMES.ANALYZE_VOICE, jobId: job.id });
      workerLogger.info({ data: job.data }, 'Processing analyze-voice job');

      const { userId } = job.data as { userId: number };
      if (typeof userId !== 'number') {
        throw new Error('analyze-voice: userId missing from job data');
      }

      await job.updateProgress({ stage: 'loading-posts' });

      // Load posts that the user imported during onboarding (stored by
      // onboarding.importPosts in Redis at `onboarding:posts:${userId}`).
      const redisKey = `onboarding:posts:${userId}`;
      const rawPosts = await connection.get(redisKey);

      let pastedText: string | undefined;
      if (rawPosts) {
        try {
          const parsed = JSON.parse(rawPosts) as Array<{ text: string; date: string | null }>;
          if (Array.isArray(parsed) && parsed.length > 0) {
            pastedText = parsed.map((p) => p.text).join('\n---\n');
          }
        } catch (err) {
          workerLogger.warn(
            { err: err instanceof Error ? err.message : 'unknown' },
            'Failed to parse imported posts from Redis',
          );
        }
      }

      await job.updateProgress({ stage: 'analyzing' });

      const result = await analyzeVoice({
        pastedText,
        // Provide minimal questionnaire so we always get *some* profile.
        questionnaire: {
          preferredTone: 'professional',
        },
      });

      await job.updateProgress({ stage: 'persisting' });

      // Upsert a new voice profile version with the analysis result.
      const [current] = await db
        .select()
        .from(voiceProfiles)
        .where(eq(voiceProfiles.userId, userId))
        .orderBy(desc(voiceProfiles.versionNumber))
        .limit(1);

      const toneValue =
        typeof result.profile.tone === 'object' && result.profile.tone !== null
          ? (result.profile.tone as { value?: string }).value ?? 'professional'
          : 'professional';

      const emojiFrequency =
        typeof result.profile.emoji === 'object' && result.profile.emoji !== null
          ? (result.profile.emoji as { frequency?: string }).frequency ?? 'minimal'
          : 'minimal';

      const hashtagStyle =
        typeof result.profile.hashtags === 'object' && result.profile.hashtags !== null
          ? (result.profile.hashtags as { style?: string }).style ?? 'minimal'
          : 'minimal';

      const formattingStyle =
        typeof result.profile.formatting === 'object' && result.profile.formatting !== null
          ? (result.profile.formatting as { style?: string }).style ?? 'scannable'
          : 'scannable';

      const lineBreakStyle =
        typeof result.profile.formatting === 'object' && result.profile.formatting !== null
          ? (result.profile.formatting as { lineBreaks?: string }).lineBreaks ?? 'double'
          : 'double';

      const avgPostLength =
        typeof result.profile.formatting === 'object' && result.profile.formatting !== null
          ? (result.profile.formatting as { avgPostLength?: number }).avgPostLength ?? 200
          : 200;

      const nextVersion = (current?.versionNumber ?? 0) + 1;

      await db.insert(voiceProfiles).values({
        userId,
        versionNumber: nextVersion,
        tone: toneValue,
        avgPostLength,
        emojiFrequency,
        hashtagStyle,
        formatting: formattingStyle,
        lineBreakStyle,
        analysisData: result.profile as unknown as Record<string, unknown>,
        analyzedPostCount: result.stats.postsAnalyzed,
        analysisSource: pastedText ? 'imported_posts' : 'questionnaire',
      });

      await job.updateProgress({ stage: 'complete' });

      workerLogger.info(
        { userId, version: nextVersion, postsAnalyzed: result.stats.postsAnalyzed },
        'Voice analysis complete',
      );

      return {
        versionNumber: nextVersion,
        postsAnalyzed: result.stats.postsAnalyzed,
        warnings: result.warnings,
      };
    },
    {
      connection,
      concurrency: 2,
    },
  );
  workers.push(analyzeVoiceWorker);

  // Fetch Analytics Worker
  const fetchAnalyticsWorker = new Worker(
    QUEUE_NAMES.FETCH_ANALYTICS,
    async (job) => {
      const workerLogger = logger.child({ worker: QUEUE_NAMES.FETCH_ANALYTICS, jobId: job.id });
      workerLogger.info({ name: job.name, data: job.data }, 'Processing fetch-analytics job');

      // Job payload shapes:
      //   refresh-user: { userId: number }
      //   refresh-post: { userId: number, postId: number }
      //   refresh-all:  {} — sweep all users with active tokens
      if (job.name === 'refresh-all') {
        // Sweep every user with an unexpired LinkedIn token.
        const users = await db
          .select({ userId: linkedinOauthTokens.userId })
          .from(linkedinOauthTokens)
          .where(gt(linkedinOauthTokens.expiresAt, new Date()));
        let totalRefreshed = 0;
        for (const { userId } of users) {
          const result = await refreshAnalytics(db, { userId });
          totalRefreshed += result.snapshotsInserted;
        }
        return { userCount: users.length, snapshotsInserted: totalRefreshed };
      }

      const { userId, postId } = job.data as { userId: number; postId?: number };
      if (typeof userId !== 'number') {
        throw new Error('fetch-analytics: userId missing from job data');
      }

      await job.updateProgress({ stage: 'fetching' });
      const result = await refreshAnalytics(db, postId !== undefined ? { userId, postId } : { userId });
      await job.updateProgress({ stage: 'complete' });

      workerLogger.info(
        { postsRefreshed: result.postsRefreshed, snapshots: result.snapshotsInserted, errors: result.errors.length },
        'Analytics refresh finished',
      );

      return result;
    },
    {
      connection,
      concurrency: 5,
      limiter: { max: 20, duration: 60_000 },
    },
  );
  workers.push(fetchAnalyticsWorker);

  // Refresh Tokens Worker
  const refreshTokensWorker = new Worker(
    QUEUE_NAMES.REFRESH_TOKENS,
    async (job) => {
      const workerLogger = logger.child({ worker: QUEUE_NAMES.REFRESH_TOKENS, jobId: job.id });
      workerLogger.info({ name: job.name, data: job.data }, 'Processing refresh-tokens job');

      // Job payload shapes:
      //   refresh-all:   {} — sweep all tokens expiring within 24h
      //   refresh-user:  { userId: number } — refresh a specific user's token
      if (job.name === 'refresh-user') {
        const { userId } = job.data as { userId: number };
        if (typeof userId !== 'number') {
          throw new Error('refresh-user: userId missing from job data');
        }
        await job.updateProgress({ stage: 'refreshing' });
        const result = await refreshLinkedInTokens(db, { userId });
        await job.updateProgress({ stage: 'complete' });
        return result;
      }

      // Default: refresh-all
      await job.updateProgress({ stage: 'refreshing' });
      const result = await refreshLinkedInTokens(db);
      await job.updateProgress({ stage: 'complete' });

      workerLogger.info(
        { checked: result.checked, refreshed: result.refreshed, failed: result.failed },
        'Token refresh sweep finished',
      );

      return result;
    },
    {
      connection,
      concurrency: 2,
    },
  );
  workers.push(refreshTokensWorker);

  // -- Event Handlers --

  for (const worker of workers) {
    worker.on('completed', (job) => {
      logger.info({ worker: worker.name, jobId: job?.id }, 'Job completed');
    });

    worker.on('failed', (job, err) => {
      logger.error(
        { worker: worker.name, jobId: job?.id, error: err.message },
        'Job failed',
      );
    });

    worker.on('error', (err) => {
      logger.error({ worker: worker.name, error: err.message }, 'Worker error');
    });
  }

  logger.info(
    { workers: workers.map((w) => w.name) },
    'All BullMQ workers registered',
  );

  return workers;
}

/**
 * Register repeatable (cron-like) jobs for background maintenance work.
 *
 * - fetch-analytics `refresh-all` — every hour, fetch LinkedIn analytics for
 *   every user with an active token.
 * - refresh-tokens  `refresh-all` — every 6 hours, refresh any LinkedIn OAuth
 *   token that expires within the next 24 hours.
 *
 * BullMQ dedupes repeatable jobs by key, so calling this on every boot is safe.
 */
export async function registerRepeatableJobs(connection: Redis): Promise<void> {
  const analyticsQueue = getQueue(QUEUE_NAMES.FETCH_ANALYTICS, connection);
  const tokensQueue = getQueue(QUEUE_NAMES.REFRESH_TOKENS, connection);

  await analyticsQueue.add(
    'refresh-all',
    {},
    {
      repeat: { pattern: '0 * * * *' }, // top of every hour
      jobId: 'analytics-refresh-all',
      removeOnComplete: { count: 50 },
      removeOnFail: { count: 50 },
    },
  );

  await tokensQueue.add(
    'refresh-all',
    {},
    {
      repeat: { pattern: '0 */6 * * *' }, // every 6 hours
      jobId: 'tokens-refresh-all',
      removeOnComplete: { count: 50 },
      removeOnFail: { count: 50 },
    },
  );

  logger.info(
    { jobs: ['analytics-refresh-all', 'tokens-refresh-all'] },
    'Repeatable jobs registered',
  );
}

export async function closeQueues(): Promise<void> {
  const closePromises = Array.from(queues.values()).map((q) => q.close());
  await Promise.all(closePromises);
  queues.clear();
  logger.info('All BullMQ queues closed');
}
