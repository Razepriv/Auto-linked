// ---------------------------------------------------------------------------
// LinkedIn Publishing Service
// ---------------------------------------------------------------------------
// Publishes approved posts to LinkedIn via the UGC Posts API.
// Handles token decryption, rate limiting, and error tracking.
// ---------------------------------------------------------------------------

import { eq, and, isNull, lte, sql } from 'drizzle-orm';
import type { Database } from '../../db/client.js';
import { posts } from '../../db/schema/posts.js';
import { users } from '../../db/schema/users.js';
import { linkedinOauthTokens } from '../../db/schema/oauth-tokens.js';
import { decryptToken } from '../auth/token-encryption.js';
import { logger } from '../../lib/logger.js';

// ---- Constants -------------------------------------------------------------

const LINKEDIN_API_BASE = 'https://api.linkedin.com/v2';
const MAX_PUBLISH_ATTEMPTS = 3;
const SAFETY_CAP_PER_HOUR = 3;

// ---- Types -----------------------------------------------------------------

interface PublishResult {
  readonly success: boolean;
  readonly linkedinPostId: string | null;
  readonly linkedinPostUrl: string | null;
  readonly error: string | null;
}

interface LinkedInUGCPayload {
  readonly author: string;
  readonly lifecycleState: 'PUBLISHED';
  readonly specificContent: {
    readonly 'com.linkedin.ugc.ShareContent': {
      readonly shareCommentary: {
        readonly text: string;
      };
      readonly shareMediaCategory: 'NONE' | 'IMAGE' | 'ARTICLE';
    };
  };
  readonly visibility: {
    readonly 'com.linkedin.ugc.MemberNetworkVisibility': 'PUBLIC';
  };
}

// ---- Main publish function -------------------------------------------------

/**
 * Publish a single post to LinkedIn.
 *
 * @param db - Database instance
 * @param postId - Internal post ID
 * @returns PublishResult
 */
export async function publishPost(
  db: Database,
  postId: number,
): Promise<PublishResult> {
  const log = logger.child({ module: 'linkedin-publisher', postId });

  // 1. Fetch the post
  const [post] = await db
    .select()
    .from(posts)
    .where(
      and(
        eq(posts.id, postId),
        isNull(posts.deletedAt),
      ),
    )
    .limit(1);

  if (!post) {
    log.error('Post not found');
    return { success: false, linkedinPostId: null, linkedinPostUrl: null, error: 'Post not found' };
  }

  if (post.status !== 'approved' && post.status !== 'scheduled') {
    log.warn({ status: post.status }, 'Post not in publishable status');
    return { success: false, linkedinPostId: null, linkedinPostUrl: null, error: `Invalid status: ${post.status}` };
  }

  if (post.publishAttemptCount >= MAX_PUBLISH_ATTEMPTS) {
    log.error('Max publish attempts reached');
    await db.update(posts).set({
      status: 'failed',
      lastPublishError: 'Max publish attempts exceeded',
      updatedAt: new Date(),
    }).where(eq(posts.id, post.id));
    return { success: false, linkedinPostId: null, linkedinPostUrl: null, error: 'Max publish attempts exceeded' };
  }

  // 2. Get the user's LinkedIn OAuth token + linkedinId from users table
  const [tokenRow] = await db
    .select({
      accessTokenEnc: linkedinOauthTokens.accessTokenEnc,
      expiresAt: linkedinOauthTokens.expiresAt,
      linkedinId: users.linkedinId,
    })
    .from(linkedinOauthTokens)
    .innerJoin(users, eq(linkedinOauthTokens.userId, users.id))
    .where(eq(linkedinOauthTokens.userId, post.userId))
    .limit(1);

  if (!tokenRow) {
    log.error('No LinkedIn token found for user');
    await markAttempt(db, post.id, 'No LinkedIn account connected');
    return { success: false, linkedinPostId: null, linkedinPostUrl: null, error: 'No LinkedIn token' };
  }

  if (!tokenRow.linkedinId) {
    log.error('No LinkedIn ID found for user');
    await markAttempt(db, post.id, 'No LinkedIn ID on user record');
    return { success: false, linkedinPostId: null, linkedinPostUrl: null, error: 'No LinkedIn ID' };
  }

  // 3. Check token expiry
  if (new Date(tokenRow.expiresAt) < new Date()) {
    log.error('LinkedIn token expired');
    await markAttempt(db, post.id, 'LinkedIn token expired');
    return { success: false, linkedinPostId: null, linkedinPostUrl: null, error: 'Token expired' };
  }

  // 4. Decrypt access token
  let accessToken: string;
  try {
    accessToken = await decryptToken(tokenRow.accessTokenEnc);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Decryption failed';
    log.error({ err: message }, 'Failed to decrypt access token');
    await markAttempt(db, post.id, `Decryption error: ${message}`);
    return { success: false, linkedinPostId: null, linkedinPostUrl: null, error: 'Token decryption failed' };
  }

  // 5. Build UGC payload
  const payload: LinkedInUGCPayload = {
    author: `urn:li:person:${tokenRow.linkedinId}`,
    lifecycleState: 'PUBLISHED',
    specificContent: {
      'com.linkedin.ugc.ShareContent': {
        shareCommentary: { text: post.content },
        shareMediaCategory: 'NONE',
      },
    },
    visibility: {
      'com.linkedin.ugc.MemberNetworkVisibility': 'PUBLIC',
    },
  };

  // 6. Call LinkedIn API
  log.info('Publishing to LinkedIn');

  try {
    const response = await fetch(`${LINKEDIN_API_BASE}/ugcPosts`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
        'X-Restli-Protocol-Version': '2.0.0',
        'LinkedIn-Version': '202401',
      },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      const errorBody = await response.text();
      log.error({ status: response.status, body: errorBody }, 'LinkedIn API error');
      await markAttempt(db, post.id, `LinkedIn API ${response.status}: ${errorBody.slice(0, 500)}`);
      return { success: false, linkedinPostId: null, linkedinPostUrl: null, error: `API error: ${response.status}` };
    }

    const result = await response.json() as { id?: string };
    const linkedinPostId = result.id ?? null;

    // Extract share ID for URL construction
    // Format: urn:li:share:12345 or urn:li:ugcPost:12345
    const shareId = linkedinPostId?.split(':').pop() ?? null;
    const linkedinPostUrl = shareId
      ? `https://www.linkedin.com/feed/update/${linkedinPostId}`
      : null;

    // 7. Update post as published
    await db.update(posts).set({
      status: 'published',
      publishedAt: new Date(),
      linkedinPostId,
      linkedinPostUrl,
      publishAttemptCount: post.publishAttemptCount + 1,
      lastPublishAttemptAt: new Date(),
      updatedAt: new Date(),
    }).where(eq(posts.id, post.id));

    log.info({ linkedinPostId }, 'Post published successfully');

    return { success: true, linkedinPostId, linkedinPostUrl, error: null };
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown network error';
    log.error({ err: message }, 'Network error publishing to LinkedIn');
    await markAttempt(db, post.id, `Network error: ${message}`);
    return { success: false, linkedinPostId: null, linkedinPostUrl: null, error: message };
  }
}

// ---- Scheduler: find posts due for publishing ------------------------------

/**
 * Find approved posts whose scheduledAt has passed and publish them.
 * Called by a cron-like BullMQ repeatable job.
 */
export async function publishDuePosts(db: Database): Promise<number> {
  const log = logger.child({ module: 'publish-scheduler' });
  const now = new Date();

  // Find posts due for publishing (approved/scheduled, scheduledAt <= now)
  const duePosts = await db
    .select({ id: posts.id, publicId: posts.publicId })
    .from(posts)
    .where(
      and(
        sql`${posts.status} IN ('approved', 'scheduled')`,
        lte(posts.scheduledAt, now),
        isNull(posts.deletedAt),
        sql`${posts.publishAttemptCount} < ${MAX_PUBLISH_ATTEMPTS}`,
      ),
    )
    .orderBy(posts.scheduledAt)
    .limit(SAFETY_CAP_PER_HOUR);

  if (duePosts.length === 0) {
    return 0;
  }

  log.info({ count: duePosts.length }, 'Found posts due for publishing');

  let published = 0;
  for (const duePost of duePosts) {
    const result = await publishPost(db, duePost.id);
    if (result.success) {
      published++;
    }
  }

  log.info({ published, total: duePosts.length }, 'Publish batch complete');
  return published;
}

// ---- Helpers ---------------------------------------------------------------

async function markAttempt(db: Database, postId: number, error: string): Promise<void> {
  await db.update(posts).set({
    publishAttemptCount: sql`${posts.publishAttemptCount} + 1`,
    lastPublishError: error,
    lastPublishAttemptAt: new Date(),
    updatedAt: new Date(),
  }).where(eq(posts.id, postId));
}
