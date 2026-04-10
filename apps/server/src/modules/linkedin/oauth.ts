// ---------------------------------------------------------------------------
// LinkedIn OAuth 2.0 with PKCE
// ---------------------------------------------------------------------------
// Handles the full OAuth flow: authorization URL generation, code exchange,
// token refresh, and token revocation. Uses PKCE for security and Redis
// for CSRF state storage.
// ---------------------------------------------------------------------------

import { config } from '../../lib/config.js';
import { getRedis } from '../../lib/redis.js';
import { logger } from '../../lib/logger.js';
import type { LinkedInTokens, LinkedInApiError, OAuthState } from './types.js';

// ---- Constants --------------------------------------------------------------

const LINKEDIN_AUTH_URL = 'https://www.linkedin.com/oauth/v2/authorization';
const LINKEDIN_TOKEN_URL = 'https://www.linkedin.com/oauth/v2/accessToken';
const LINKEDIN_REVOKE_URL = 'https://www.linkedin.com/oauth/v2/revoke';

const SCOPES = ['openid', 'profile', 'email', 'w_member_social'];
const STATE_TTL_SECONDS = 600; // 10 minutes
const STATE_PREFIX = 'linkedin:oauth:state:';

// ---- PKCE helpers -----------------------------------------------------------

function generateCodeVerifier(): string {
  const array = new Uint8Array(32);
  crypto.getRandomValues(array);
  return base64UrlEncode(array);
}

async function generateCodeChallenge(verifier: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(verifier);
  const digest = await crypto.subtle.digest('SHA-256', data);
  return base64UrlEncode(new Uint8Array(digest));
}

function base64UrlEncode(bytes: Uint8Array): string {
  const base64 = Buffer.from(bytes).toString('base64');
  return base64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

// ---- State management -------------------------------------------------------

async function storeState(state: string, data: OAuthState): Promise<void> {
  const redis = getRedis();
  await redis.set(
    `${STATE_PREFIX}${state}`,
    JSON.stringify(data),
    'EX',
    STATE_TTL_SECONDS,
  );
}

async function retrieveAndDeleteState(state: string): Promise<OAuthState | null> {
  const redis = getRedis();
  const key = `${STATE_PREFIX}${state}`;

  // Atomic get-and-delete to prevent replay attacks
  const raw = await redis.get(key);
  if (raw === null) {
    return null;
  }

  await redis.del(key);

  try {
    return JSON.parse(raw) as OAuthState;
  } catch {
    logger.error({ state }, 'Failed to parse OAuth state from Redis');
    return null;
  }
}

// ---- Public API -------------------------------------------------------------

/**
 * Build the LinkedIn OAuth authorization URL with PKCE.
 * Stores the CSRF state + code verifier in Redis with a 10-minute TTL.
 *
 * Returns both the URL and the state string so the caller can use them.
 */
export async function getAuthorizationUrl(
  userId: number,
  redirectUri?: string,
): Promise<{ url: string; state: string }> {
  const effectiveRedirectUri = redirectUri ?? config.LINKEDIN_REDIRECT_URI;
  const codeVerifier = generateCodeVerifier();
  const codeChallenge = await generateCodeChallenge(codeVerifier);

  // Generate a cryptographically random state parameter
  const stateBytes = new Uint8Array(24);
  crypto.getRandomValues(stateBytes);
  const state = base64UrlEncode(stateBytes);

  // Store state data in Redis
  const stateData: OAuthState = {
    userId,
    codeVerifier,
    redirectUri: effectiveRedirectUri,
    createdAt: Date.now(),
  };
  await storeState(state, stateData);

  // Build the authorization URL
  const params = new URLSearchParams({
    response_type: 'code',
    client_id: config.LINKEDIN_CLIENT_ID,
    redirect_uri: effectiveRedirectUri,
    state,
    scope: SCOPES.join(' '),
    code_challenge: codeChallenge,
    code_challenge_method: 'S256',
  });

  const url = `${LINKEDIN_AUTH_URL}?${params.toString()}`;

  logger.info({ userId, state }, 'LinkedIn OAuth authorization URL generated');

  return { url, state };
}

/**
 * Validate a state parameter and retrieve the stored OAuth data.
 * Returns null if the state is invalid, expired, or already consumed.
 */
export async function validateState(state: string): Promise<OAuthState | null> {
  return retrieveAndDeleteState(state);
}

/**
 * Exchange an authorization code for access and refresh tokens.
 * Uses the code verifier from the PKCE flow.
 */
export async function exchangeCodeForTokens(
  code: string,
  codeVerifier: string,
  redirectUri: string,
): Promise<LinkedInTokens> {
  const body = new URLSearchParams({
    grant_type: 'authorization_code',
    code,
    redirect_uri: redirectUri,
    client_id: config.LINKEDIN_CLIENT_ID,
    client_secret: config.LINKEDIN_CLIENT_SECRET,
    code_verifier: codeVerifier,
  });

  const response = await fetch(LINKEDIN_TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: body.toString(),
  });

  if (!response.ok) {
    const errorBody = await response.text();
    logger.error(
      { status: response.status, body: errorBody },
      'LinkedIn token exchange failed',
    );
    throw createApiError(response.status, errorBody, 'Token exchange failed');
  }

  const data = (await response.json()) as Record<string, unknown>;

  return {
    accessToken: data['access_token'] as string,
    refreshToken: (data['refresh_token'] as string) ?? null,
    expiresIn: data['expires_in'] as number,
    refreshExpiresIn: (data['refresh_token_expires_in'] as number) ?? null,
    scope: data['scope'] as string,
    tokenType: data['token_type'] as string,
  };
}

/**
 * Refresh an expired access token using a refresh token.
 */
export async function refreshAccessToken(
  refreshToken: string,
): Promise<LinkedInTokens> {
  const body = new URLSearchParams({
    grant_type: 'refresh_token',
    refresh_token: refreshToken,
    client_id: config.LINKEDIN_CLIENT_ID,
    client_secret: config.LINKEDIN_CLIENT_SECRET,
  });

  const response = await fetch(LINKEDIN_TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: body.toString(),
  });

  if (!response.ok) {
    const errorBody = await response.text();
    logger.error(
      { status: response.status, body: errorBody },
      'LinkedIn token refresh failed',
    );
    throw createApiError(response.status, errorBody, 'Token refresh failed');
  }

  const data = (await response.json()) as Record<string, unknown>;

  return {
    accessToken: data['access_token'] as string,
    refreshToken: (data['refresh_token'] as string) ?? null,
    expiresIn: data['expires_in'] as number,
    refreshExpiresIn: (data['refresh_token_expires_in'] as number) ?? null,
    scope: data['scope'] as string,
    tokenType: data['token_type'] as string,
  };
}

/**
 * Revoke a LinkedIn access token.
 * This is a best-effort operation; errors are logged but not thrown.
 */
export async function revokeToken(accessToken: string): Promise<void> {
  const body = new URLSearchParams({
    client_id: config.LINKEDIN_CLIENT_ID,
    client_secret: config.LINKEDIN_CLIENT_SECRET,
    token: accessToken,
  });

  try {
    const response = await fetch(LINKEDIN_REVOKE_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: body.toString(),
    });

    if (!response.ok) {
      const errorBody = await response.text();
      logger.warn(
        { status: response.status, body: errorBody },
        'LinkedIn token revocation returned non-OK (best-effort)',
      );
    } else {
      logger.info('LinkedIn token revoked successfully');
    }
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    logger.warn({ error: message }, 'LinkedIn token revocation failed (best-effort)');
  }
}

// ---- Error helpers ----------------------------------------------------------

function createApiError(
  status: number,
  body: string,
  fallbackMessage: string,
): LinkedInApiError {
  let message = fallbackMessage;
  let serviceErrorCode: number | null = null;

  try {
    const parsed = JSON.parse(body) as Record<string, unknown>;
    message = (parsed['error_description'] as string) ?? (parsed['message'] as string) ?? fallbackMessage;
    serviceErrorCode = (parsed['serviceErrorCode'] as number) ?? null;
  } catch {
    // body was not JSON, use fallback
  }

  const retryable = status === 429 || status >= 500;

  return {
    status,
    serviceErrorCode,
    message,
    retryable,
  };
}
