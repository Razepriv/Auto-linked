// ---------------------------------------------------------------------------
// Analytics Refresh
// ---------------------------------------------------------------------------
// Fetches LinkedIn share statistics for a user's published posts, persists a
// new `post_analytics` snapshot, and recomputes `content_pillars.performance_score`
// for the pillars touched by the batch.
// ---------------------------------------------------------------------------

import { and, eq, inArray, isNotNull, isNull, sql } from 'drizzle-orm';
import type { Database } from '../../db/client.js';
import { posts } from '../../db/schema/posts.js';
import { contentPillars } from '../../db/schema/content-pillars.js';
import { postAnalytics } from '../../db/schema/post-analytics.js';
import { linkedinOauthTokens } from '../../db/schema/oauth-tokens.js';
import { decryptToken } from '../auth/token-encryption.js';
import { getPostAnalytics } from '../linkedin/client.js';
import { logger } from '../../lib/logger.js';

// ---- Constants -------------------------------------------------------------

/** Hard cap on posts refreshed per invocation, to avoid runaway cost. */
const MAX_POSTS_PER_RUN = 50;

// ---- Types -----------------------------------------------------------------

export interface RefreshAnalyticsInput {
  readonly userId: number;
  /** If provided, refresh only this single internal post id. */
  readonly postId?: number;
}

export interface RefreshAnalyticsResult {
  readonly postsRefreshed: number;
  readonly snapshotsInserted: number;
  readonly errors: readonly string[];
  readonly pillarsUpdated: number;
}

interface TokenRow {
  readonly accessTokenEnc: string;
  readonly expiresAt: Date;
}

// ---- Public API ------------------------------------------------------------

/**
 * Fetch LinkedIn analytics for a user's published posts and persist snapshots.
 *
 * Behaviour:
 *   - Loads an unexpired access token for the user (bails if none).
 *   - Selects published posts with a `linkedin_post_id` (optionally filtered to a
 *     single post via `input.postId`).
 *   - Calls LinkedIn analytics per post, inserts a snapshot row, and updates
 *     pillar performance scores once the batch completes.
 *   - Individual post failures are captured in `errors` but do not abort the run.
 */
export async function refreshAnalytics(
  db: Database,
  input: RefreshAnalyticsInput,
): Promise<RefreshAnalyticsResult> {
  const log = logger.child({ module: 'analytics-refresh', userId: input.userId });

  // 1. Load and decrypt the access token
  const accessToken = await loadAccessToken(db, input.userId);
  if (!accessToken) {
    log.warn('No usable LinkedIn access token; skipping analytics refresh');
    return {
      postsRefreshed: 0,
      snapshotsInserted: 0,
      errors: ['No usable LinkedIn access token'],
      pillarsUpdated: 0,
    };
  }

  // 2. Load candidate posts
  const candidates = await db
    .select({
      id: posts.id,
      linkedinPostId: posts.linkedinPostId,
      pillarId: posts.pillarId,
    })
    .from(posts)
    .where(
      and(
        eq(posts.userId, input.userId),
        eq(posts.status, 'published'),
        isNotNull(posts.linkedinPostId),
        isNull(posts.deletedAt),
        ...(input.postId !== undefined ? [eq(posts.id, input.postId)] : []),
      ),
    )
    .limit(MAX_POSTS_PER_RUN);

  if (candidates.length === 0) {
    log.info('No published posts with LinkedIn IDs to refresh');
    return { postsRefreshed: 0, snapshotsInserted: 0, errors: [], pillarsUpdated: 0 };
  }

  log.info({ count: candidates.length }, 'Refreshing analytics for posts');

  // 3. Fetch + persist per post
  const errors: string[] = [];
  let snapshotsInserted = 0;
  const touchedPillars = new Set<number>();

  for (const candidate of candidates) {
    if (!candidate.linkedinPostId) continue;

    try {
      const metrics = await getPostAnalytics(accessToken, candidate.linkedinPostId);

      await db.insert(postAnalytics).values({
        postId: candidate.id,
        userId: input.userId,
        impressions: metrics.impressions,
        reactions: metrics.reactions,
        comments: metrics.comments,
        reposts: metrics.reposts,
        clicks: metrics.clicks,
        engagementRate: metrics.engagementRate.toFixed(4),
        rawResponse: metrics as unknown as Record<string, unknown>,
      });

      snapshotsInserted += 1;
      if (candidate.pillarId !== null) {
        touchedPillars.add(candidate.pillarId);
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      log.error(
        { postId: candidate.id, linkedinPostId: candidate.linkedinPostId, err: message },
        'Failed to refresh analytics for post',
      );
      errors.push(`post ${candidate.id}: ${message}`);
    }
  }

  // 4. Recompute pillar performance scores
  const pillarsUpdated = touchedPillars.size > 0
    ? await recomputePillarScores(db, input.userId, Array.from(touchedPillars))
    : 0;

  log.info(
    { postsRefreshed: candidates.length, snapshotsInserted, errors: errors.length, pillarsUpdated },
    'Analytics refresh complete',
  );

  return {
    postsRefreshed: candidates.length,
    snapshotsInserted,
    errors,
    pillarsUpdated,
  };
}

// ---- Helpers ---------------------------------------------------------------

async function loadAccessToken(
  db: Database,
  userId: number,
): Promise<string | null> {
  const rows = await db
    .select({
      accessTokenEnc: linkedinOauthTokens.accessTokenEnc,
      expiresAt: linkedinOauthTokens.expiresAt,
    })
    .from(linkedinOauthTokens)
    .where(eq(linkedinOauthTokens.userId, userId))
    .limit(1);

  const row = rows[0] as TokenRow | undefined;
  if (!row) return null;
  if (new Date(row.expiresAt) < new Date()) return null;

  try {
    return await decryptToken(row.accessTokenEnc);
  } catch (err) {
    logger.error(
      { userId, err: err instanceof Error ? err.message : String(err) },
      'Failed to decrypt LinkedIn access token for analytics refresh',
    );
    return null;
  }
}

/**
 * Recompute each pillar's `performance_score` from the user's latest per-post
 * engagement snapshots. Returns the number of pillars updated.
 *
 * The score is the average of each post's most recent `engagement_rate`.
 */
async function recomputePillarScores(
  db: Database,
  userId: number,
  pillarIds: readonly number[],
): Promise<number> {
  if (pillarIds.length === 0) return 0;

  // For each pillar, compute avg(latest engagement_rate per post).
  const rows = await db.execute<{ pillar_id: number; avg_engagement: string | null }>(sql`
    WITH latest_snapshots AS (
      SELECT DISTINCT ON (pa.post_id)
        pa.post_id,
        pa.engagement_rate
      FROM post_analytics pa
      WHERE pa.user_id = ${userId}
      ORDER BY pa.post_id, pa.snapshot_at DESC
    )
    SELECT
      p.pillar_id,
      AVG(ls.engagement_rate)::text AS avg_engagement
    FROM posts p
    JOIN latest_snapshots ls ON ls.post_id = p.id
    WHERE p.user_id = ${userId}
      AND p.pillar_id IN (${sql.join(pillarIds.map((id) => sql`${id}`), sql`, `)})
      AND p.deleted_at IS NULL
    GROUP BY p.pillar_id
  `);

  const resultRows = Array.isArray(rows) ? rows : (rows as unknown as { rows: Array<{ pillar_id: number; avg_engagement: string | null }> }).rows ?? [];

  let updated = 0;
  for (const row of resultRows) {
    if (row.avg_engagement === null) continue;
    const score = Number(row.avg_engagement);
    if (Number.isNaN(score)) continue;

    await db
      .update(contentPillars)
      .set({
        performanceScore: score.toFixed(3),
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(contentPillars.id, row.pillar_id),
          eq(contentPillars.userId, userId),
        ),
      );
    updated += 1;
  }

  // Touch remaining pillars (those with no latest snapshot) so stale scores get zeroed.
  const seen = new Set(resultRows.map((r) => Number(r.pillar_id)));
  const untouched = pillarIds.filter((id) => !seen.has(id));
  if (untouched.length > 0) {
    await db
      .update(contentPillars)
      .set({ performanceScore: null, updatedAt: new Date() })
      .where(
        and(
          eq(contentPillars.userId, userId),
          inArray(contentPillars.id, untouched as number[]),
        ),
      );
  }

  return updated;
}
