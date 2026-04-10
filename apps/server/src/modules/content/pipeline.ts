// ---------------------------------------------------------------------------
// Content Generation Pipeline — Main orchestrator
// ---------------------------------------------------------------------------
//
// 7-step pipeline:
//   1. Select pillar + format + angle
//   2. Gather context
//   3. Generate via Claude
//   4. Apply voice profile constraints (handled inside generator)
//   5. Media suggestion (included in generated output)
//   6. Quality check
//   7. Insert into DB
//
// Auto-regenerates once if quality score < 60.
// ---------------------------------------------------------------------------

import { eq, desc, and, isNull } from 'drizzle-orm';
import { db } from '../../db/client.js';
import {
  posts,
  voiceProfiles,
  contentPillars,
  users,
  type NewPost,
} from '../../db/schema/index.js';
import { logger } from '../../lib/logger.js';
import type {
  CalendarSlot,
  GeneratedPost,
  GenerationContext,
  HookType,
  PillarSnapshot,
  QualityReport,
  VoiceProfileSnapshot,
} from './types.js';
import { selectPillar } from './pillar-rotation.js';
import { selectHookType } from './hook-rotation.js';
import { selectTopic } from './topic-selector.js';
import { generatePost } from './generator.js';
import { checkQuality } from './quality-check.js';

// ---------------------------------------------------------------------------
// Public types for the pipeline result
// ---------------------------------------------------------------------------

interface PipelineResult {
  readonly postId: number;
  readonly publicId: string;
  readonly content: string;
  readonly qualityScore: number;
  readonly qualityPassed: boolean;
}

// ---------------------------------------------------------------------------
// Main orchestrator
// ---------------------------------------------------------------------------

/**
 * Run the full content generation pipeline for a single calendar slot.
 *
 * @param slot   - The calendar slot defining day, format, and scheduling.
 * @param userId - The internal numeric user ID (DB primary key as string).
 * @returns The created post record from the database.
 */
export async function runPipeline(
  slot: CalendarSlot,
  userId: string,
): Promise<PipelineResult> {
  const log = logger.child({ module: 'pipeline', userId, slotId: slot.id });
  const numericUserId = parseInt(userId, 10);

  log.info({ format: slot.format, day: slot.dayOfWeek }, 'Starting content generation pipeline');

  // -----------------------------------------------------------------------
  // Step 1: Select pillar + format + angle
  // -----------------------------------------------------------------------
  log.info('Step 1: Selecting pillar, format, and angle');

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

  const recentPostRows = await db
    .select()
    .from(posts)
    .where(and(eq(posts.userId, numericUserId), isNull(posts.deletedAt)))
    .orderBy(desc(posts.createdAt))
    .limit(30);

  // Map DB pillars to PillarSnapshot.
  const pillarSnapshots: PillarSnapshot[] = activePillars.map((p) => ({
    id: String(p.id),
    name: p.name,
    description: p.description ?? '',
    weight: parseFloat(p.weight),
    exampleTopics: [],
  }));

  const recentPostRecords = recentPostRows.map((p) => ({
    pillarId: p.pillarId !== null ? String(p.pillarId) : null,
    createdAt: p.createdAt.toISOString(),
  }));

  let pillar: PillarSnapshot;
  if (slot.pillarId && pillarSnapshots.find((p) => p.id === slot.pillarId)) {
    pillar = pillarSnapshots.find((p) => p.id === slot.pillarId)!;
  } else if (pillarSnapshots.length > 0) {
    pillar = selectPillar(userId, pillarSnapshots, recentPostRecords);
  } else {
    pillar = {
      id: 'default',
      name: 'General',
      description: 'General professional insights',
      weight: 1.0,
      exampleTopics: [],
    };
  }

  log.info({ pillar: pillar.name, format: slot.format, angle: slot.angle }, 'Step 1 complete');

  // -----------------------------------------------------------------------
  // Step 2: Gather context
  // -----------------------------------------------------------------------
  log.info('Step 2: Gathering context');

  const voiceProfileRow = await db
    .select()
    .from(voiceProfiles)
    .where(eq(voiceProfiles.userId, numericUserId))
    .orderBy(desc(voiceProfiles.versionNumber))
    .limit(1)
    .then((rows) => rows[0]);

  const voiceSnapshot = buildVoiceSnapshot(voiceProfileRow);

  // Get recent hook types from posts for hook rotation.
  const recentHooks = recentPostRows
    .filter((p) => p.generationContext !== null)
    .map((p) => {
      const ctx = p.generationContext as Record<string, unknown> | null;
      return {
        type: (ctx?.['hookType'] as HookType) ?? 'question',
        usedAt: p.createdAt.toISOString(),
      };
    })
    .slice(0, 20);

  const hookType = selectHookType(slot.angle, recentHooks);

  // Select topic.
  const recentTopics = recentPostRows
    .slice(0, 14)
    .map((p) => p.content.slice(0, 200));

  const topic = await selectTopic(slot, {
    pillar,
    format: slot.format,
    recentTopics,
    trendingTopics: [],
    userName: userRecord.name,
    userIndustry: 'technology', // Default; in production, pull from user profile.
  });

  // Build top posts for few-shot examples (last 5 published).
  const topPosts = recentPostRows
    .filter((p) => p.status === 'published')
    .slice(0, 5)
    .map((p) => p.content);

  // Recent posts for repetition check.
  const recentContents = recentPostRows
    .slice(0, 5)
    .map((p) => p.content);

  const generationContext: GenerationContext = {
    voiceProfile: voiceSnapshot,
    pillar,
    format: slot.format,
    hookType,
    angle: slot.angle,
    topic,
    trendingTopics: [],
    topPosts,
    negativeExamples: [],
    recentPosts: recentContents,
    userName: userRecord.name,
    userRole: 'Professional', // Default.
    userIndustry: 'technology',
  };

  log.info({ topic, hookType }, 'Step 2 complete');

  // -----------------------------------------------------------------------
  // Step 3-5: Generate + constraints + media suggestion
  // -----------------------------------------------------------------------
  log.info('Step 3-5: Generating post via Claude');

  let generated: GeneratedPost;
  let qualityReport: QualityReport;
  let attempts = 0;
  const maxAttempts = 2;

  // Generate and quality-check in a loop (auto-retry once if < 60).
  do {
    attempts++;
    generated = await generatePost(generationContext);

    // -----------------------------------------------------------------------
    // Step 6: Quality check
    // -----------------------------------------------------------------------
    log.info(`Step 6: Quality check (attempt ${attempts})`);
    qualityReport = checkQuality(generated, generationContext);

    log.info(
      { score: qualityReport.score, passed: qualityReport.passed, issues: qualityReport.issues.length },
      `Quality check result (attempt ${attempts})`,
    );

    if (qualityReport.passed) break;

    if (attempts < maxAttempts) {
      log.warn(
        { score: qualityReport.score },
        'Quality check failed, auto-regenerating',
      );
    }
  } while (attempts < maxAttempts);

  // -----------------------------------------------------------------------
  // Step 7: Insert into DB
  // -----------------------------------------------------------------------
  log.info('Step 7: Inserting post into database');

  const scheduledAt = computeScheduledAt(slot);

  const newPost: NewPost = {
    userId: numericUserId,
    pillarId: pillar.id !== 'default' ? parseInt(pillar.id, 10) : null,
    content: generated.content,
    hook: generated.hook,
    hashtags: [...generated.hashtags],
    format: slot.format,
    status: 'draft',
    aiModel: 'claude-sonnet-4-20250514',
    generationContext: {
      hookType,
      angle: slot.angle,
      topic,
      pillarName: pillar.name,
      qualityScore: qualityReport.score,
      qualityIssues: qualityReport.issues,
      strategyNote: generated.strategyNote,
      mediaRecommendation: generated.mediaRecommendation,
    },
    regenerationCount: 0,
    scheduledAt,
  };

  const inserted = await db
    .insert(posts)
    .values(newPost)
    .returning({ id: posts.id, publicId: posts.publicId })
    .then((rows) => rows[0]);

  if (!inserted) {
    throw new Error('Failed to insert post into database');
  }

  log.info(
    { postId: inserted.id, publicId: inserted.publicId, qualityScore: qualityReport.score },
    'Pipeline complete',
  );

  return {
    postId: inserted.id,
    publicId: inserted.publicId,
    content: generated.content,
    qualityScore: qualityReport.score,
    qualityPassed: qualityReport.passed,
  };
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function buildVoiceSnapshot(
  row: typeof voiceProfiles.$inferSelect | undefined,
): VoiceProfileSnapshot {
  if (!row) {
    // Return sensible defaults if no voice profile exists yet.
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

  // Extract structured data from the jsonb analysisData field.
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

function computeScheduledAt(slot: CalendarSlot): Date {
  const now = new Date();
  const currentDay = now.getUTCDay() as 0 | 1 | 2 | 3 | 4 | 5 | 6;

  // Calculate days until the target day.
  let daysUntil = slot.dayOfWeek - currentDay;
  if (daysUntil <= 0) daysUntil += 7;

  const target = new Date(now);
  target.setUTCDate(target.getUTCDate() + daysUntil);

  // Set the time from the slot.
  const [hours, minutes] = slot.scheduledTime.split(':').map(Number);
  target.setUTCHours(hours ?? 9, minutes ?? 0, 0, 0);

  return target;
}
