// ---------------------------------------------------------------------------
// Content Generation Pipeline — Public API
// ---------------------------------------------------------------------------
//
// Exports the three main entry points:
//   - runPipeline     — Generate a single post for a calendar slot
//   - generateBatch   — Generate a full week of content
//   - regeneratePost  — Regenerate a post with optional user feedback
// ---------------------------------------------------------------------------

import { randomUUID } from 'node:crypto';
import { eq, desc, and, isNull } from 'drizzle-orm';
import { db } from '../../db/client.js';
import { posts, contentPillars, users, voiceProfiles } from '../../db/schema/index.js';
import { logger } from '../../lib/logger.js';
import type { PostFormat } from '@auto-linked/shared';
import type { AngleType, CalendarSlot, HookType, PillarSnapshot, VoiceProfileSnapshot } from './types.js';
import { generateWeeklyTemplate } from './calendar.js';
import { runPipeline } from './pipeline.js';
import { generatePost } from './generator.js';
import { checkQuality } from './quality-check.js';

// Re-export the pipeline runner.
export { runPipeline } from './pipeline.js';

// Re-export types that consumers may need.
export type {
  CalendarSlot,
  GeneratedPost,
  GenerationContext,
  QualityReport,
  TopicCandidate,
  HookType,
  AngleType,
} from './types.js';

// ---------------------------------------------------------------------------
// generateBatch
// ---------------------------------------------------------------------------

/**
 * Generate a batch of posts for a user's upcoming week.
 *
 * Creates a weekly template from the user's pillars and posting frequency,
 * then runs the pipeline for each slot sequentially.
 *
 * @param userId - The user's internal ID (numeric, as string).
 * @param count  - Optional override for number of posts. Defaults to user's
 *                 configured frequency or 5.
 * @returns An array of pipeline results for each generated post.
 */
export async function generateBatch(
  userId: string,
  count?: number,
): Promise<readonly BatchResult[]> {
  const log = logger.child({ module: 'batch-generate', userId });
  const numericUserId = parseInt(userId, 10);

  log.info({ requestedCount: count }, 'Starting batch generation');

  // Fetch user and pillars.
  const userRecord = await db
    .select()
    .from(users)
    .where(and(eq(users.id, numericUserId), isNull(users.deletedAt)))
    .limit(1)
    .then((rows) => rows[0]);

  if (!userRecord) {
    throw new Error(`User not found: ${userId}`);
  }

  const activePillars = await db
    .select()
    .from(contentPillars)
    .where(and(eq(contentPillars.userId, numericUserId), isNull(contentPillars.deletedAt)))
    .orderBy(contentPillars.sortOrder);

  const pillarSnapshots: PillarSnapshot[] = activePillars.map((p) => ({
    id: String(p.id),
    name: p.name,
    description: p.description ?? '',
    weight: parseFloat(p.weight),
    exampleTopics: [],
  }));

  // Determine posting frequency.
  const frequency = count ?? extractFrequency(userRecord.postingSchedule) ?? 5;

  // Generate the weekly calendar template.
  const slots = generateWeeklyTemplate(userId, pillarSnapshots, frequency);

  log.info({ slotCount: slots.length }, 'Generated weekly template');

  // Run the pipeline for each slot.
  const results: BatchResult[] = [];

  for (const slot of slots) {
    try {
      const result = await runPipeline(slot, userId);
      results.push({
        slotId: slot.id,
        postId: result.postId,
        publicId: result.publicId,
        qualityScore: result.qualityScore,
        qualityPassed: result.qualityPassed,
        error: null,
      });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Unknown error';
      log.error({ slotId: slot.id, err: message }, 'Pipeline failed for slot');
      results.push({
        slotId: slot.id,
        postId: null,
        publicId: null,
        qualityScore: null,
        qualityPassed: false,
        error: message,
      });
    }
  }

  const successCount = results.filter((r) => r.error === null).length;
  log.info(
    { total: results.length, success: successCount, failed: results.length - successCount },
    'Batch generation complete',
  );

  return results;
}

/** Result for a single slot in a batch generation run. */
interface BatchResult {
  readonly slotId: string;
  readonly postId: number | null;
  readonly publicId: string | null;
  readonly qualityScore: number | null;
  readonly qualityPassed: boolean;
  readonly error: string | null;
}

// ---------------------------------------------------------------------------
// regeneratePost
// ---------------------------------------------------------------------------

/**
 * Regenerate an existing post, optionally incorporating user feedback.
 *
 * The original post is updated in-place with new content, and the
 * regeneration counter is incremented. Maximum 3 regenerations per post.
 *
 * @param postId   - The public UUID of the post to regenerate.
 * @param feedback - Optional user feedback (e.g. "make it shorter", "more personal").
 * @returns The updated post's pipeline result.
 */
export async function regeneratePost(
  postId: string,
  feedback?: string,
): Promise<RegenerateResult> {
  const log = logger.child({ module: 'regenerate', postId });

  log.info({ hasFeedback: !!feedback }, 'Starting post regeneration');

  // Fetch the existing post.
  const existingPost = await db
    .select()
    .from(posts)
    .where(and(eq(posts.publicId, postId), isNull(posts.deletedAt)))
    .limit(1)
    .then((rows) => rows[0]);

  if (!existingPost) {
    throw new Error(`Post not found: ${postId}`);
  }

  if (existingPost.regenerationCount >= 3) {
    throw new Error('Maximum regeneration limit (3) reached for this post.');
  }

  if (existingPost.status !== 'draft') {
    throw new Error(`Cannot regenerate a post in "${existingPost.status}" status. Only drafts can be regenerated.`);
  }

  // Retrieve the original generation context.
  const originalContext = (existingPost.generationContext ?? {}) as Record<string, unknown>;

  // Build a calendar slot from the existing post data.
  const slot: CalendarSlot = {
    id: randomUUID(),
    userId: String(existingPost.userId),
    dayOfWeek: existingPost.scheduledAt
      ? (existingPost.scheduledAt.getUTCDay() as CalendarSlot['dayOfWeek'])
      : 1,
    pillarId: existingPost.pillarId !== null ? String(existingPost.pillarId) : null,
    format: (existingPost.format as PostFormat) ?? 'text',
    angle: (originalContext['angle'] as AngleType) ?? 'opinion',
    scheduledTime: existingPost.scheduledAt
      ? `${String(existingPost.scheduledAt.getUTCHours()).padStart(2, '0')}:${String(existingPost.scheduledAt.getUTCMinutes()).padStart(2, '0')}`
      : '09:00',
    isActive: true,
  };

  // Run the pipeline for the new slot. The pipeline will insert a new row.
  // Instead, we'll run generation + quality check manually and update in-place.
  const result = await runRegenerationPipeline(existingPost, slot, feedback);

  log.info(
    { qualityScore: result.qualityScore, regenerationCount: existingPost.regenerationCount + 1 },
    'Regeneration complete',
  );

  return result;
}

/** Result of a regeneration operation. */
interface RegenerateResult {
  readonly postId: string;
  readonly content: string;
  readonly qualityScore: number;
  readonly qualityPassed: boolean;
  readonly regenerationCount: number;
}

// ---------------------------------------------------------------------------
// Internal regeneration pipeline
// ---------------------------------------------------------------------------

async function runRegenerationPipeline(
  existingPost: typeof posts.$inferSelect,
  slot: CalendarSlot,
  feedback: string | undefined,
): Promise<RegenerateResult> {
  const numericUserId = existingPost.userId;

  // Fetch voice profile for context.
  const voiceProfileRow = await db
    .select()
    .from(voiceProfiles)
    .where(eq(voiceProfiles.userId, numericUserId))
    .orderBy(desc(voiceProfiles.versionNumber))
    .limit(1)
    .then((rows) => rows[0]);

  // Fetch user record.
  const userRecord = await db
    .select()
    .from(users)
    .where(eq(users.id, numericUserId))
    .limit(1)
    .then((rows) => rows[0]);

  if (!userRecord) {
    throw new Error(`User not found: ${numericUserId}`);
  }

  // Build minimal voice snapshot.
  const voiceSnapshot = buildVoiceSnapshotFromRow(voiceProfileRow);

  // Fetch recent posts for quality check.
  const recentPostRows = await db
    .select()
    .from(posts)
    .where(and(eq(posts.userId, numericUserId), isNull(posts.deletedAt)))
    .orderBy(desc(posts.createdAt))
    .limit(10);

  const recentContents = recentPostRows
    .filter((p) => p.id !== existingPost.id)
    .slice(0, 5)
    .map((p) => p.content);

  const originalContext = (existingPost.generationContext ?? {}) as Record<string, unknown>;

  // Resolve pillar.
  let pillar: PillarSnapshot = {
    id: 'default',
    name: (originalContext['pillarName'] as string) ?? 'General',
    description: 'General professional insights',
    weight: 1.0,
    exampleTopics: [],
  };

  if (existingPost.pillarId !== null) {
    const pillarRow = await db
      .select()
      .from(contentPillars)
      .where(eq(contentPillars.id, existingPost.pillarId))
      .limit(1)
      .then((rows) => rows[0]);

    if (pillarRow) {
      pillar = {
        id: String(pillarRow.id),
        name: pillarRow.name,
        description: pillarRow.description ?? '',
        weight: parseFloat(pillarRow.weight),
        exampleTopics: [],
      };
    }
  }

  const generationContext = {
    voiceProfile: voiceSnapshot,
    pillar,
    format: slot.format,
    hookType: (originalContext['hookType'] as HookType) ?? 'question',
    angle: slot.angle,
    topic: (originalContext['topic'] as string) ?? `Insights about ${pillar.name}`,
    trendingTopics: [],
    topPosts: [] as string[],
    negativeExamples: feedback
      ? [existingPost.content] // Treat previous version as negative example.
      : [],
    recentPosts: recentContents,
    userName: userRecord.name,
    userRole: 'Professional',
    userIndustry: 'technology',
  };

  // Generate new post.
  const generated = await generatePost(generationContext);
  const qualityReport = checkQuality(generated, generationContext);

  // Update the existing post in-place.
  await db
    .update(posts)
    .set({
      content: generated.content,
      hook: generated.hook,
      hashtags: [...generated.hashtags],
      regenerationCount: existingPost.regenerationCount + 1,
      generationContext: {
        ...originalContext,
        qualityScore: qualityReport.score,
        qualityIssues: qualityReport.issues,
        strategyNote: generated.strategyNote,
        mediaRecommendation: generated.mediaRecommendation,
        regenerationFeedback: feedback ?? null,
        previousContent: existingPost.content,
      },
      updatedAt: new Date(),
    })
    .where(eq(posts.id, existingPost.id));

  return {
    postId: existingPost.publicId,
    content: generated.content,
    qualityScore: qualityReport.score,
    qualityPassed: qualityReport.passed,
    regenerationCount: existingPost.regenerationCount + 1,
  };
}

// ---------------------------------------------------------------------------
// Voice snapshot builder
// ---------------------------------------------------------------------------

function buildVoiceSnapshotFromRow(
  row: { tone: string; avgPostLength: number; emojiFrequency: string; hashtagStyle: string; formatting: string; lineBreakStyle: string; analysisData: unknown } | undefined,
): VoiceProfileSnapshot {
  if (!row) {
    return {
      tone: 'professional',
      avgPostLength: 800,
      emojiFrequency: 'minimal',
      hashtagStyle: 'minimal',
      formatting: 'scannable',
      lineBreakStyle: 'double',
      vocabulary: { frequentWords: [], avoidedWords: [], jargonTerms: [] },
      emoji: { preferred: [] },
      hashtags: { recurring: [], placement: 'end' },
      hookPatterns: ['question', 'bold_statement'],
      ctaPatterns: ['question'],
    };
  }

  const analysis = (row.analysisData ?? {}) as Record<string, unknown>;
  const vocab = (analysis['vocabulary'] ?? {}) as Record<string, unknown>;
  const emojiData = (analysis['emoji'] ?? {}) as Record<string, unknown>;
  const hashtagData = (analysis['hashtags'] ?? {}) as Record<string, unknown>;

  return {
    tone: row.tone,
    avgPostLength: row.avgPostLength,
    emojiFrequency: row.emojiFrequency,
    hashtagStyle: row.hashtagStyle,
    formatting: row.formatting,
    lineBreakStyle: row.lineBreakStyle,
    vocabulary: {
      frequentWords: asStringArray(vocab['frequentWords']),
      avoidedWords: asStringArray(vocab['avoidedWords']),
      jargonTerms: asStringArray(vocab['jargonTerms']),
    },
    emoji: {
      preferred: asStringArray(emojiData['preferred']),
    },
    hashtags: {
      recurring: asStringArray(hashtagData['recurring']),
      placement: typeof hashtagData['placement'] === 'string' ? hashtagData['placement'] : 'end',
    },
    hookPatterns: asStringArray(analysis['hookPatterns']),
    ctaPatterns: asStringArray(analysis['ctaPatterns']),
  };
}

function asStringArray(value: unknown): readonly string[] {
  if (Array.isArray(value)) {
    return value.filter((v): v is string => typeof v === 'string');
  }
  return [];
}

function extractFrequency(schedule: unknown): number | null {
  if (typeof schedule === 'object' && schedule !== null) {
    const freq = (schedule as Record<string, unknown>)['frequency'];
    if (typeof freq === 'number' && freq >= 1 && freq <= 7) {
      return freq;
    }
  }
  return null;
}
