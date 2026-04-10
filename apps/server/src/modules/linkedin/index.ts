// ---------------------------------------------------------------------------
// LinkedIn Module – Public API
// ---------------------------------------------------------------------------

export {
  getAuthorizationUrl,
  validateState,
  exchangeCodeForTokens,
  refreshAccessToken,
  revokeToken,
} from './oauth.js';

export {
  getProfile,
  createTextPost,
  createImagePost,
  getPostAnalytics,
  getPublishRateLimit,
} from './client.js';

export { publishPost } from './publisher.js';

export type {
  LinkedInTokens,
  LinkedInProfile,
  PostMetrics,
  PublishResult,
  PublishStatus,
  LinkedInApiError,
  OAuthState,
  RateLimitInfo,
} from './types.js';
