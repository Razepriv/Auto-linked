// ---------------------------------------------------------------------------
// LinkedIn API Client
// ---------------------------------------------------------------------------
// Wraps LinkedIn's REST API for profile fetching, post publishing, image
// upload, and analytics. Includes per-user rate limiting via Redis.
// ---------------------------------------------------------------------------

import { getRedis } from '../../lib/redis.js';
import { logger } from '../../lib/logger.js';
import type {
  LinkedInProfile,
  PostMetrics,
  LinkedInApiError,
  RateLimitInfo,
} from './types.js';

// ---- Constants --------------------------------------------------------------

const LINKEDIN_API_BASE = 'https://api.linkedin.com/v2';
const LINKEDIN_USERINFO_URL = 'https://api.linkedin.com/v2/userinfo';

// Rate limit configuration
const PUBLISH_DAILY_LIMIT = 100;
const PUBLISH_HOURLY_SAFETY_CAP = 3;
const RATE_LIMIT_PREFIX = 'linkedin:ratelimit:';

// ---- Rate limiting ----------------------------------------------------------

async function checkRateLimit(
  userId: number,
  action: 'publish' | 'read',
): Promise<RateLimitInfo> {
  if (action === 'read') {
    // Read operations are not rate-limited at the application level
    return { remaining: Infinity, resetAt: new Date(), isBlocked: false };
  }

  const redis = getRedis();
  const now = new Date();

  // Check daily limit
  const dailyKey = `${RATE_LIMIT_PREFIX}${userId}:publish:daily:${formatDateKey(now)}`;
  const dailyCount = await redis.get(dailyKey);
  const dailyUsed = dailyCount ? parseInt(dailyCount, 10) : 0;

  if (dailyUsed >= PUBLISH_DAILY_LIMIT) {
    const tomorrow = new Date(now);
    tomorrow.setUTCDate(tomorrow.getUTCDate() + 1);
    tomorrow.setUTCHours(0, 0, 0, 0);
    return { remaining: 0, resetAt: tomorrow, isBlocked: true };
  }

  // Check hourly safety cap
  const hourlyKey = `${RATE_LIMIT_PREFIX}${userId}:publish:hourly:${formatHourKey(now)}`;
  const hourlyCount = await redis.get(hourlyKey);
  const hourlyUsed = hourlyCount ? parseInt(hourlyCount, 10) : 0;

  if (hourlyUsed >= PUBLISH_HOURLY_SAFETY_CAP) {
    const nextHour = new Date(now);
    nextHour.setUTCHours(nextHour.getUTCHours() + 1, 0, 0, 0);
    return { remaining: 0, resetAt: nextHour, isBlocked: true };
  }

  return {
    remaining: Math.min(
      PUBLISH_DAILY_LIMIT - dailyUsed,
      PUBLISH_HOURLY_SAFETY_CAP - hourlyUsed,
    ),
    resetAt: now,
    isBlocked: false,
  };
}

async function recordPublishAction(userId: number): Promise<void> {
  const redis = getRedis();
  const now = new Date();

  const dailyKey = `${RATE_LIMIT_PREFIX}${userId}:publish:daily:${formatDateKey(now)}`;
  const hourlyKey = `${RATE_LIMIT_PREFIX}${userId}:publish:hourly:${formatHourKey(now)}`;

  const pipeline = redis.pipeline();
  pipeline.incr(dailyKey);
  pipeline.expire(dailyKey, 86_400); // 24 hours
  pipeline.incr(hourlyKey);
  pipeline.expire(hourlyKey, 3_600); // 1 hour
  await pipeline.exec();
}

function formatDateKey(date: Date): string {
  return date.toISOString().slice(0, 10); // YYYY-MM-DD
}

function formatHourKey(date: Date): string {
  return date.toISOString().slice(0, 13); // YYYY-MM-DDTHH
}

// ---- Profile ----------------------------------------------------------------

/**
 * Fetch the authenticated user's LinkedIn profile.
 * Uses the OpenID Connect userinfo endpoint.
 */
export async function getProfile(accessToken: string): Promise<LinkedInProfile> {
  const response = await linkedinFetch(LINKEDIN_USERINFO_URL, accessToken);

  const data = (await response.json()) as Record<string, unknown>;

  return {
    sub: data['sub'] as string,
    name: data['name'] as string,
    givenName: (data['given_name'] as string) ?? '',
    familyName: (data['family_name'] as string) ?? '',
    picture: (data['picture'] as string) ?? null,
    email: data['email'] as string,
    emailVerified: (data['email_verified'] as boolean) ?? false,
    locale: (data['locale'] as string) ?? null,
  };
}

// ---- Publishing -------------------------------------------------------------

/**
 * Create a text-only post on LinkedIn.
 * Returns the LinkedIn post URN.
 */
export async function createTextPost(
  accessToken: string,
  authorUrn: string,
  text: string,
  userId: number,
): Promise<string> {
  const rateLimit = await checkRateLimit(userId, 'publish');
  if (rateLimit.isBlocked) {
    throw createRateLimitError(rateLimit);
  }

  const body = {
    author: authorUrn,
    lifecycleState: 'PUBLISHED',
    specificContent: {
      'com.linkedin.ugc.ShareContent': {
        shareCommentary: { text },
        shareMediaCategory: 'NONE',
      },
    },
    visibility: {
      'com.linkedin.ugc.MemberNetworkVisibility': 'PUBLIC',
    },
  };

  const response = await linkedinFetch(
    `${LINKEDIN_API_BASE}/ugcPosts`,
    accessToken,
    {
      method: 'POST',
      body: JSON.stringify(body),
    },
  );

  const data = (await response.json()) as Record<string, unknown>;
  const postUrn = data['id'] as string;

  await recordPublishAction(userId);

  logger.info({ userId, postUrn }, 'LinkedIn text post published');

  return postUrn;
}

/**
 * Create a post with an image on LinkedIn.
 *
 * Flow: register upload -> upload image bytes -> create post with media.
 * Returns the LinkedIn post URN.
 */
export async function createImagePost(
  accessToken: string,
  authorUrn: string,
  text: string,
  imageUrl: string,
  userId: number,
): Promise<string> {
  const rateLimit = await checkRateLimit(userId, 'publish');
  if (rateLimit.isBlocked) {
    throw createRateLimitError(rateLimit);
  }

  // Step 1: Register the upload
  const registerBody = {
    registerUploadRequest: {
      owner: authorUrn,
      recipes: ['urn:li:digitalmediaRecipe:feedshare-image'],
      serviceRelationships: [
        {
          identifier: 'urn:li:userGeneratedContent',
          relationshipType: 'OWNER',
        },
      ],
    },
  };

  const registerResponse = await linkedinFetch(
    `${LINKEDIN_API_BASE}/assets?action=registerUpload`,
    accessToken,
    {
      method: 'POST',
      body: JSON.stringify(registerBody),
    },
  );

  const registerData = (await registerResponse.json()) as Record<string, unknown>;
  const uploadValue = (registerData['value'] as Record<string, unknown>) ?? {};
  const uploadMechanism = uploadValue['uploadMechanism'] as Record<string, unknown>;
  const mediaUploadHttp = uploadMechanism[
    'com.linkedin.digitalmedia.uploading.MediaUploadHttpRequest'
  ] as Record<string, unknown>;
  const uploadUrl = mediaUploadHttp['uploadUrl'] as string;
  const assetUrn = (uploadValue['asset'] as string);

  // Step 2: Download the image and upload to LinkedIn
  const imageResponse = await fetch(imageUrl);
  if (!imageResponse.ok) {
    throw {
      status: 400,
      serviceErrorCode: null,
      message: `Failed to download image from ${imageUrl}: ${imageResponse.status}`,
      retryable: false,
    } satisfies LinkedInApiError;
  }

  const imageBuffer = await imageResponse.arrayBuffer();

  const uploadResponse = await fetch(uploadUrl, {
    method: 'PUT',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/octet-stream',
    },
    body: imageBuffer,
  });

  if (!uploadResponse.ok) {
    const errorBody = await uploadResponse.text();
    logger.error(
      { status: uploadResponse.status, body: errorBody },
      'LinkedIn image upload failed',
    );
    throw createApiErrorFromResponse(uploadResponse.status, errorBody, 'Image upload failed');
  }

  // Step 3: Create the post with the media
  const postBody = {
    author: authorUrn,
    lifecycleState: 'PUBLISHED',
    specificContent: {
      'com.linkedin.ugc.ShareContent': {
        shareCommentary: { text },
        shareMediaCategory: 'IMAGE',
        media: [
          {
            status: 'READY',
            media: assetUrn,
          },
        ],
      },
    },
    visibility: {
      'com.linkedin.ugc.MemberNetworkVisibility': 'PUBLIC',
    },
  };

  const postResponse = await linkedinFetch(
    `${LINKEDIN_API_BASE}/ugcPosts`,
    accessToken,
    {
      method: 'POST',
      body: JSON.stringify(postBody),
    },
  );

  const postData = (await postResponse.json()) as Record<string, unknown>;
  const postUrn = postData['id'] as string;

  await recordPublishAction(userId);

  logger.info({ userId, postUrn, assetUrn }, 'LinkedIn image post published');

  return postUrn;
}

// ---- Analytics --------------------------------------------------------------

/**
 * Fetch analytics for a published post.
 * Uses the organizationalEntityShareStatistics endpoint.
 */
export async function getPostAnalytics(
  accessToken: string,
  postUrn: string,
): Promise<PostMetrics> {
  const params = new URLSearchParams({
    q: 'specificShares',
    shares: postUrn,
  });

  try {
    const response = await linkedinFetch(
      `${LINKEDIN_API_BASE}/organizationalEntityShareStatistics?${params.toString()}`,
      accessToken,
    );

    const data = (await response.json()) as Record<string, unknown>;
    const elements = (data['elements'] as Array<Record<string, unknown>>) ?? [];

    if (elements.length === 0) {
      return emptyMetrics();
    }

    const stats = (elements[0]!['totalShareStatistics'] as Record<string, unknown>) ?? {};

    const impressions = (stats['impressionCount'] as number) ?? 0;
    const reactions = (stats['likeCount'] as number) ?? 0;
    const comments = (stats['commentCount'] as number) ?? 0;
    const reposts = (stats['shareCount'] as number) ?? 0;
    const clicks = (stats['clickCount'] as number) ?? 0;

    const totalEngagement = reactions + comments + reposts + clicks;
    const engagementRate = impressions > 0
      ? totalEngagement / impressions
      : 0;

    return {
      impressions,
      reactions,
      comments,
      reposts,
      clicks,
      engagementRate: Math.round(engagementRate * 10000) / 10000,
    };
  } catch (error: unknown) {
    // Analytics may not be available for all posts (e.g., personal profiles
    // without the analytics scope). Return empty metrics gracefully.
    const isApiError = error !== null && typeof error === 'object' && 'status' in error;
    if (isApiError) {
      const apiErr = error as LinkedInApiError;
      if (apiErr.status === 403) {
        logger.info({ postUrn }, 'Analytics not available for this post (403)');
        return emptyMetrics();
      }
    }
    throw error;
  }
}

/**
 * Get the rate limit status for a user's publishing actions.
 */
export async function getPublishRateLimit(userId: number): Promise<RateLimitInfo> {
  return checkRateLimit(userId, 'publish');
}

// ---- Helpers ----------------------------------------------------------------

async function linkedinFetch(
  url: string,
  accessToken: string,
  init?: RequestInit,
): Promise<Response> {
  const headers: Record<string, string> = {
    Authorization: `Bearer ${accessToken}`,
    'LinkedIn-Version': '202401',
    'X-Restli-Protocol-Version': '2.0.0',
    ...(init?.body ? { 'Content-Type': 'application/json' } : {}),
  };

  const response = await fetch(url, {
    ...init,
    headers: {
      ...headers,
      ...(init?.headers as Record<string, string> | undefined),
    },
  });

  if (!response.ok) {
    const errorBody = await response.text();
    const method = init?.method ?? 'GET';
    logger.error(
      { status: response.status, method, url, body: errorBody },
      'LinkedIn API request failed',
    );
    throw createApiErrorFromResponse(
      response.status,
      errorBody,
      `LinkedIn API ${method} ${url} failed`,
    );
  }

  return response;
}

function createApiErrorFromResponse(
  status: number,
  body: string,
  fallbackMessage: string,
): LinkedInApiError {
  let message = fallbackMessage;
  let serviceErrorCode: number | null = null;

  try {
    const parsed = JSON.parse(body) as Record<string, unknown>;
    message = (parsed['message'] as string) ?? (parsed['error_description'] as string) ?? fallbackMessage;
    serviceErrorCode = (parsed['serviceErrorCode'] as number) ?? null;
  } catch {
    // body was not JSON
  }

  const retryable = status === 429 || status >= 500;

  return { status, serviceErrorCode, message, retryable };
}

function createRateLimitError(rateLimit: RateLimitInfo): LinkedInApiError {
  return {
    status: 429,
    serviceErrorCode: null,
    message: `Publishing rate limit exceeded. Resets at ${rateLimit.resetAt.toISOString()}`,
    retryable: true,
  };
}

function emptyMetrics(): PostMetrics {
  return {
    impressions: 0,
    reactions: 0,
    comments: 0,
    reposts: 0,
    clicks: 0,
    engagementRate: 0,
  };
}
