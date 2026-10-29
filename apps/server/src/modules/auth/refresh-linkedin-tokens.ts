// ---------------------------------------------------------------------------
// LinkedIn Token Refresh
// ---------------------------------------------------------------------------
// Finds LinkedIn OAuth tokens that are nearing expiry, exchanges their refresh
// token for a new access token, and persists the encrypted result back to the
// database. Tracks per-user failure counts so a broken account backs off
// instead of hammering the LinkedIn token endpoint.
// ---------------------------------------------------------------------------

import { and, eq, lt, lte, sql, isNotNull } from 'drizzle-orm';
import type { Database } from '../../db/client.js';
import { linkedinOauthTokens } from '../../db/schema/oauth-tokens.js';
import { decryptToken, encryptToken } from './token-encryption.js';
import { refreshAccessToken } from '../linkedin/oauth.js';
import { logger } from '../../lib/logger.js';

// ---- Constants -------------------------------------------------------------

/** Refresh tokens that expire within this window (milliseconds). */
const REFRESH_WINDOW_MS = 24 * 60 * 60 * 1000; // 24 hours
/** Backoff: skip tokens with at least this many consecutive failures. */
const MAX_CONSECUTIVE_FAILURES = 5;
/** Hard cap on tokens refreshed per invocation. */
const MAX_TOKENS_PER_RUN = 100;

// ---- Types -----------------------------------------------------------------

export interface RefreshTokensInput {
  /** If provided, refresh only this user's token. Otherwise sweep all expiring tokens. */
  readonly userId?: number;
}

export interface RefreshTokensResult {
  readonly checked: number;
  readonly refreshed: number;
  readonly skipped: number;
  readonly failed: number;
  readonly errors: readonly string[];
}

// ---- Public API ------------------------------------------------------------

/**
 * Refresh LinkedIn OAuth access tokens that are near expiry.
 *
 * @param db - Database instance
 * @param input - Optional user scoping
 * @returns Summary of the refresh batch
 */
export async function refreshLinkedInTokens(
  db: Database,
  input: RefreshTokensInput = {},
): Promise<RefreshTokensResult> {
  const log = logger.child({
    module: 'linkedin-token-refresh',
    ...(input.userId !== undefined ? { userId: input.userId } : {}),
  });

  const now = new Date();
  const threshold = new Date(now.getTime() + REFRESH_WINDOW_MS);

  // 1. Find candidate tokens
  const candidates = await db
    .select({
      id: linkedinOauthTokens.id,
      userId: linkedinOauthTokens.userId,
      refreshTokenEnc: linkedinOauthTokens.refreshTokenEnc,
      refreshExpiresAt: linkedinOauthTokens.refreshExpiresAt,
      refreshFailureCount: linkedinOauthTokens.refreshFailureCount,
    })
    .from(linkedinOauthTokens)
    .where(
      and(
        lte(linkedinOauthTokens.expiresAt, threshold),
        isNotNull(linkedinOauthTokens.refreshTokenEnc),
        lt(linkedinOauthTokens.refreshFailureCount, MAX_CONSECUTIVE_FAILURES),
        ...(input.userId !== undefined
          ? [eq(linkedinOauthTokens.userId, input.userId)]
          : []),
      ),
    )
    .limit(MAX_TOKENS_PER_RUN);

  if (candidates.length === 0) {
    log.info('No tokens need refreshing');
    return { checked: 0, refreshed: 0, skipped: 0, failed: 0, errors: [] };
  }

  log.info({ count: candidates.length }, 'Refreshing LinkedIn tokens');

  let refreshed = 0;
  let skipped = 0;
  let failed = 0;
  const errors: string[] = [];

  // 2. Refresh each one in sequence (avoid thundering herd on LinkedIn token endpoint)
  for (const candidate of candidates) {
    if (!candidate.refreshTokenEnc) {
      skipped += 1;
      continue;
    }

    // Skip if the refresh token itself has already expired
    if (candidate.refreshExpiresAt && new Date(candidate.refreshExpiresAt) < now) {
      log.warn(
        { userId: candidate.userId },
        'Refresh token is expired — user must re-authorize',
      );
      await markFailure(db, candidate.id, 'refresh_token_expired');
      skipped += 1;
      continue;
    }

    try {
      const plainRefresh = await decryptToken(candidate.refreshTokenEnc);
      const tokens = await refreshAccessToken(plainRefresh);

      const newAccessEnc = await encryptToken(tokens.accessToken);
      const newRefreshEnc = tokens.refreshToken
        ? await encryptToken(tokens.refreshToken)
        : candidate.refreshTokenEnc;

      const newExpiresAt = new Date(now.getTime() + tokens.expiresIn * 1000);
      const newRefreshExpiresAt = tokens.refreshExpiresIn
        ? new Date(now.getTime() + tokens.refreshExpiresIn * 1000)
        : candidate.refreshExpiresAt;

      await db
        .update(linkedinOauthTokens)
        .set({
          accessTokenEnc: newAccessEnc,
          refreshTokenEnc: newRefreshEnc,
          expiresAt: newExpiresAt,
          refreshExpiresAt: newRefreshExpiresAt,
          lastRefreshedAt: now,
          refreshFailureCount: 0,
          updatedAt: now,
        })
        .where(eq(linkedinOauthTokens.id, candidate.id));

      refreshed += 1;
      log.info(
        { userId: candidate.userId, expiresAt: newExpiresAt.toISOString() },
        'LinkedIn token refreshed',
      );
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      log.error({ userId: candidate.userId, err: message }, 'Token refresh failed');
      await markFailure(db, candidate.id, message);
      failed += 1;
      errors.push(`user ${candidate.userId}: ${message}`);
    }
  }

  log.info(
    { checked: candidates.length, refreshed, skipped, failed },
    'Token refresh batch complete',
  );

  return {
    checked: candidates.length,
    refreshed,
    skipped,
    failed,
    errors,
  };
}

// ---- Helpers ---------------------------------------------------------------

async function markFailure(
  db: Database,
  tokenId: number,
  _reason: string,
): Promise<void> {
  await db
    .update(linkedinOauthTokens)
    .set({
      refreshFailureCount: sql`${linkedinOauthTokens.refreshFailureCount} + 1`,
      updatedAt: new Date(),
    })
    .where(eq(linkedinOauthTokens.id, tokenId));
}
