// ---------------------------------------------------------------------------
// LinkedIn Post Publisher
// ---------------------------------------------------------------------------
// Orchestrates the full publish workflow: decrypt stored tokens, validate
// freshness, publish via the LinkedIn API, and record the result. Includes
// retry logic with exponential backoff and graceful degradation.
// ---------------------------------------------------------------------------

import { eq } from 'drizzle-orm';
import { db } from '../../db/client.js';
import { posts, linkedinOauthTokens, users } from '../../db/schema/index.js';
import { decryptToken, encryptToken } from '../auth/token-encryption.js';
import { logger, type Logger } from '../../lib/logger.js';
import { refreshAccessToken } from './oauth.js';
import { createTextPost, createImagePost, getPublishRateLimit } from './client.js';
import type { PublishResult, LinkedInApiError } from './types.js';

// ---- Constants --------------------------------------------------------------

const RETRY_DELAYS_MS = [5_000, 30_000, 300_000]; // 5s, 30s, 5min
const MAX_ATTEMPTS = 3;

// ---- Public API -------------------------------------------------------------

/**
 * Publish a post to LinkedIn.
 *
 * Full workflow:
 * 1. Load post and user token from DB
 * 2. Decrypt access token
 * 3. Check if token needs refresh
 * 4. Check rate limits
 * 5. Publish to LinkedIn
 * 6. Store the LinkedIn post ID in the DB
 *
 * Retry logic:
 * - 3 attempts with exponential backoff (5s, 30s, 5min)
 * - On 401: halt retries, mark token as expired, notify user
 * - On rate limit: return reschedule info
 * - On persistent failure: mark as copy_to_clipboard fallback
 */
export async function publishPost(postId: string): Promise<PublishResult> {
  const log = logger.child({ postId });

  // Load the post
  const [post] = await db
    .select()
    .from(posts)
    .where(eq(posts.publicId, postId))
    .limit(1);

  if (!post) {
    log.error('Post not found');
    return {
      status: 'failed_api',
      linkedinPostId: null,
      linkedinPostUrl: null,
      error: 'Post not found',
      retryAfter: null,
    };
  }

  // Load the user's OAuth tokens
  const [tokenRow] = await db
    .select()
    .from(linkedinOauthTokens)
    .where(eq(linkedinOauthTokens.userId, post.userId))
    .limit(1);

  if (!tokenRow) {
    log.info('No LinkedIn tokens found for user, falling back to copy_to_clipboard');
    return {
      status: 'copy_to_clipboard',
      linkedinPostId: null,
      linkedinPostUrl: null,
      error: 'LinkedIn account not connected',
      retryAfter: null,
    };
  }

  // Load user for linkedinId
  const [user] = await db
    .select()
    .from(users)
    .where(eq(users.id, post.userId))
    .limit(1);

  if (!user || !user.linkedinId) {
    log.info('User or LinkedIn ID not found, falling back to copy_to_clipboard');
    return {
      status: 'copy_to_clipboard',
      linkedinPostId: null,
      linkedinPostUrl: null,
      error: 'LinkedIn profile ID not found',
      retryAfter: null,
    };
  }

  // Decrypt the access token
  let accessToken: string;
  try {
    accessToken = await decryptToken(tokenRow.accessTokenEnc);
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : 'Unknown decryption error';
    log.error({ error: msg }, 'Failed to decrypt access token');
    return {
      status: 'failed_auth',
      linkedinPostId: null,
      linkedinPostUrl: null,
      error: 'Failed to decrypt stored token. Please reconnect LinkedIn.',
      retryAfter: null,
    };
  }

  // Check if token is expired and try to refresh
  const now = new Date();
  if (tokenRow.expiresAt <= now) {
    log.info('Access token expired, attempting refresh');
    const refreshResult = await attemptTokenRefresh(tokenRow, post.userId);
    if (refreshResult.error) {
      return refreshResult.error;
    }
    accessToken = refreshResult.accessToken!;
  }

  // Check rate limits before attempting
  const rateLimit = await getPublishRateLimit(post.userId);
  if (rateLimit.isBlocked) {
    log.info({ resetAt: rateLimit.resetAt }, 'Rate limit reached, rescheduling');
    return {
      status: 'failed_rate_limit',
      linkedinPostId: null,
      linkedinPostUrl: null,
      error: 'Publishing rate limit reached',
      retryAfter: rateLimit.resetAt,
    };
  }

  const authorUrn = `urn:li:person:${user.linkedinId}`;

  // Attempt publishing with retries
  return attemptPublishWithRetries(
    post,
    accessToken,
    authorUrn,
    tokenRow,
    log,
  );
}

// ---- Internal helpers -------------------------------------------------------

async function attemptPublishWithRetries(
  post: typeof posts.$inferSelect,
  accessToken: string,
  authorUrn: string,
  tokenRow: typeof linkedinOauthTokens.$inferSelect,
  log: Logger,
): Promise<PublishResult> {
  let lastError: string = 'Unknown error';

  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    try {
      // Update attempt count
      await db
        .update(posts)
        .set({
          publishAttemptCount: post.publishAttemptCount + attempt + 1,
          lastPublishAttemptAt: new Date(),
          updatedAt: new Date(),
        })
        .where(eq(posts.id, post.id));

      // Publish based on post type
      let linkedinPostUrn: string;
      if (post.primaryMediaUrl) {
        linkedinPostUrn = await createImagePost(
          accessToken,
          authorUrn,
          post.content,
          post.primaryMediaUrl,
          post.userId,
        );
      } else {
        linkedinPostUrn = await createTextPost(
          accessToken,
          authorUrn,
          post.content,
          post.userId,
        );
      }

      // Extract post ID from URN for URL construction
      const linkedinPostId = linkedinPostUrn.split(':').pop() ?? linkedinPostUrn;
      const linkedinPostUrl = `https://www.linkedin.com/feed/update/${linkedinPostUrn}`;

      // Update the post record with LinkedIn info
      await db
        .update(posts)
        .set({
          status: 'published',
          linkedinPostId: linkedinPostUrn,
          linkedinPostUrl,
          publishedAt: new Date(),
          lastPublishError: null,
          updatedAt: new Date(),
        })
        .where(eq(posts.id, post.id));

      log.info({ linkedinPostUrn }, 'Post published successfully');

      return {
        status: 'published',
        linkedinPostId: linkedinPostUrn,
        linkedinPostUrl,
        error: null,
        retryAfter: null,
      };
    } catch (error: unknown) {
      const apiError = asApiError(error);

      // On 401: halt retries, mark token as expired
      if (apiError?.status === 401) {
        log.warn('LinkedIn returned 401, marking token as expired');

        await db
          .update(linkedinOauthTokens)
          .set({
            refreshFailureCount: tokenRow.refreshFailureCount + 1,
            updatedAt: new Date(),
          })
          .where(eq(linkedinOauthTokens.id, tokenRow.id));

        await db
          .update(posts)
          .set({
            status: 'failed',
            lastPublishError: 'LinkedIn authentication expired. Please reconnect.',
            updatedAt: new Date(),
          })
          .where(eq(posts.id, post.id));

        return {
          status: 'failed_auth',
          linkedinPostId: null,
          linkedinPostUrl: null,
          error: 'LinkedIn authentication expired. Please reconnect your account.',
          retryAfter: null,
        };
      }

      // On rate limit from LinkedIn: reschedule
      if (apiError?.status === 429) {
        const retryAfter = new Date(Date.now() + 3_600_000); // 1 hour
        log.warn({ retryAfter }, 'LinkedIn rate limit hit, rescheduling');

        await db
          .update(posts)
          .set({
            lastPublishError: 'LinkedIn rate limit reached',
            updatedAt: new Date(),
          })
          .where(eq(posts.id, post.id));

        return {
          status: 'failed_rate_limit',
          linkedinPostId: null,
          linkedinPostUrl: null,
          error: 'LinkedIn API rate limit reached',
          retryAfter,
        };
      }

      lastError = apiError?.message ?? (error instanceof Error ? error.message : 'Unknown error');
      log.warn(
        { attempt: attempt + 1, error: lastError },
        'Publish attempt failed, will retry',
      );

      // Wait before next retry (unless it's the last attempt)
      if (attempt < MAX_ATTEMPTS - 1) {
        const delay = RETRY_DELAYS_MS[attempt] ?? 5_000;
        await sleep(delay);
      }
    }
  }

  // All retries exhausted
  log.error({ lastError }, 'All publish attempts exhausted, falling back to copy_to_clipboard');

  await db
    .update(posts)
    .set({
      status: 'failed',
      lastPublishError: lastError,
      updatedAt: new Date(),
    })
    .where(eq(posts.id, post.id));

  return {
    status: 'copy_to_clipboard',
    linkedinPostId: null,
    linkedinPostUrl: null,
    error: `Publishing failed after ${MAX_ATTEMPTS} attempts: ${lastError}`,
    retryAfter: null,
  };
}

async function attemptTokenRefresh(
  tokenRow: typeof linkedinOauthTokens.$inferSelect,
  userId: number,
): Promise<{ accessToken: string | null; error: PublishResult | null }> {
  if (!tokenRow.refreshTokenEnc) {
    return {
      accessToken: null,
      error: {
        status: 'failed_auth',
        linkedinPostId: null,
        linkedinPostUrl: null,
        error: 'Access token expired and no refresh token available. Please reconnect LinkedIn.',
        retryAfter: null,
      },
    };
  }

  try {
    const refreshToken = await decryptToken(tokenRow.refreshTokenEnc);
    const newTokens = await refreshAccessToken(refreshToken);

    // Encrypt and store new tokens
    const newAccessTokenEnc = await encryptToken(newTokens.accessToken);
    const newRefreshTokenEnc = newTokens.refreshToken
      ? await encryptToken(newTokens.refreshToken)
      : tokenRow.refreshTokenEnc;

    const expiresAt = new Date(Date.now() + newTokens.expiresIn * 1000);
    const refreshExpiresAt = newTokens.refreshExpiresIn
      ? new Date(Date.now() + newTokens.refreshExpiresIn * 1000)
      : tokenRow.refreshExpiresAt;

    await db
      .update(linkedinOauthTokens)
      .set({
        accessTokenEnc: newAccessTokenEnc,
        refreshTokenEnc: newRefreshTokenEnc,
        expiresAt,
        refreshExpiresAt,
        lastRefreshedAt: new Date(),
        refreshFailureCount: 0,
        updatedAt: new Date(),
      })
      .where(eq(linkedinOauthTokens.id, tokenRow.id));

    logger.info({ userId }, 'LinkedIn token refreshed successfully during publish');

    return { accessToken: newTokens.accessToken, error: null };
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : 'Unknown refresh error';
    logger.error({ userId, error: msg }, 'Token refresh failed during publish');

    await db
      .update(linkedinOauthTokens)
      .set({
        refreshFailureCount: tokenRow.refreshFailureCount + 1,
        updatedAt: new Date(),
      })
      .where(eq(linkedinOauthTokens.id, tokenRow.id));

    return {
      accessToken: null,
      error: {
        status: 'failed_auth',
        linkedinPostId: null,
        linkedinPostUrl: null,
        error: 'Token refresh failed. Please reconnect your LinkedIn account.',
        retryAfter: null,
      },
    };
  }
}

function asApiError(error: unknown): LinkedInApiError | null {
  if (
    error !== null &&
    typeof error === 'object' &&
    'status' in error &&
    'message' in error
  ) {
    return error as LinkedInApiError;
  }
  return null;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
