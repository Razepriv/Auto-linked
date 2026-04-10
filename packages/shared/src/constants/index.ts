// ---------------------------------------------------------------------------
// Re-export all constants
// ---------------------------------------------------------------------------

export {
  PLAN_LIMITS,
  PLAN_DISPLAY_NAMES,
  getPlanLimits,
  hasAnalytics,
  isBillingEnabled,
  isSelfHosted,
} from './plans.js';
export type { PlanLimits } from './plans.js';

// ---------------------------------------------------------------------------
// Post content limits
// ---------------------------------------------------------------------------

/** Maximum length of a LinkedIn post body in characters. */
export const POST_MAX_LENGTH = 3000;

/** Maximum length of a post hook/opening line in characters. */
export const HOOK_MAX_LENGTH = 150;

/** Maximum number of hashtags per post. */
export const HASHTAG_MAX_COUNT = 10;

/** Maximum length of a single hashtag (including #). */
export const HASHTAG_MAX_LENGTH = 50;

/** Maximum length of a strategy note. */
export const STRATEGY_NOTE_MAX_LENGTH = 500;

// ---------------------------------------------------------------------------
// Content pillar limits
// ---------------------------------------------------------------------------

/** Maximum length of a pillar name. */
export const PILLAR_NAME_MAX_LENGTH = 60;

/** Maximum length of a pillar description. */
export const PILLAR_DESCRIPTION_MAX_LENGTH = 500;

/** Maximum number of example topics per pillar. */
export const PILLAR_MAX_EXAMPLE_TOPICS = 10;

/** Maximum number of content pillars per user. */
export const PILLAR_MAX_PER_USER = 8;

/** Minimum number of content pillars required after onboarding. */
export const PILLAR_MIN_REQUIRED = 2;

// ---------------------------------------------------------------------------
// Scheduling limits
// ---------------------------------------------------------------------------

/** Maximum number of posting times per day. */
export const MAX_POSTING_TIMES_PER_DAY = 5;

/** Maximum posts per week (absolute cap regardless of plan). */
export const MAX_POSTS_PER_WEEK = 21;

/** Minimum minutes between two scheduled posts. */
export const MIN_POST_INTERVAL_MINUTES = 60;

// ---------------------------------------------------------------------------
// Voice profile
// ---------------------------------------------------------------------------

/** Minimum number of posts required for reliable voice analysis. */
export const VOICE_ANALYSIS_MIN_POSTS = 5;

/** Maximum number of sample posts a user can paste during onboarding. */
export const VOICE_ANALYSIS_MAX_SAMPLE_POSTS = 10;

// ---------------------------------------------------------------------------
// Pagination defaults
// ---------------------------------------------------------------------------

/** Default page size for list endpoints. */
export const DEFAULT_PAGE_SIZE = 20;

/** Maximum page size for list endpoints. */
export const MAX_PAGE_SIZE = 100;

// ---------------------------------------------------------------------------
// Quality score
// ---------------------------------------------------------------------------

/** Minimum quality score (inclusive). */
export const QUALITY_SCORE_MIN = 0;

/** Maximum quality score (inclusive). */
export const QUALITY_SCORE_MAX = 100;

/** Quality score threshold below which a post is flagged for review. */
export const QUALITY_SCORE_REVIEW_THRESHOLD = 60;
