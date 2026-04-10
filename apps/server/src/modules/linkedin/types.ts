// ---------------------------------------------------------------------------
// LinkedIn Integration – Types
// ---------------------------------------------------------------------------

// ---- Token types ------------------------------------------------------------

export interface LinkedInTokens {
  readonly accessToken: string;
  readonly refreshToken: string | null;
  readonly expiresIn: number;
  readonly refreshExpiresIn: number | null;
  readonly scope: string;
  readonly tokenType: string;
}

// ---- Profile types ----------------------------------------------------------

export interface LinkedInProfile {
  readonly sub: string;
  readonly name: string;
  readonly givenName: string;
  readonly familyName: string;
  readonly picture: string | null;
  readonly email: string;
  readonly emailVerified: boolean;
  readonly locale: string | null;
}

// ---- Post metrics -----------------------------------------------------------

export interface PostMetrics {
  readonly impressions: number;
  readonly reactions: number;
  readonly comments: number;
  readonly reposts: number;
  readonly clicks: number;
  readonly engagementRate: number;
}

// ---- Publishing types -------------------------------------------------------

export type PublishStatus =
  | 'published'
  | 'failed_auth'
  | 'failed_rate_limit'
  | 'failed_api'
  | 'copy_to_clipboard';

export interface PublishResult {
  readonly status: PublishStatus;
  readonly linkedinPostId: string | null;
  readonly linkedinPostUrl: string | null;
  readonly error: string | null;
  readonly retryAfter: Date | null;
}

// ---- API error types --------------------------------------------------------

export interface LinkedInApiError {
  readonly status: number;
  readonly serviceErrorCode: number | null;
  readonly message: string;
  readonly retryable: boolean;
}

// ---- OAuth state stored in Redis --------------------------------------------

export interface OAuthState {
  readonly userId: number;
  readonly codeVerifier: string;
  readonly redirectUri: string;
  readonly createdAt: number;
}

// ---- Rate limit info --------------------------------------------------------

export interface RateLimitInfo {
  readonly remaining: number;
  readonly resetAt: Date;
  readonly isBlocked: boolean;
}
