// ---------------------------------------------------------------------------
// Re-export all domain types
// ---------------------------------------------------------------------------

export type {
  User,
  UserUpdateInput,
  OnboardingStep,
  Plan,
} from './user.js';
export { ONBOARDING_STEPS, PLANS } from './user.js';

export type {
  Post,
  PostStatus,
  PostFormat,
} from './post.js';
export { POST_STATUSES, POST_FORMATS } from './post.js';

export type {
  VoiceProfile,
  ScoredTrait,
  VocabularyProfile,
  EmojiProfile,
  HashtagProfile,
  FormattingProfile,
  Tone,
  HookPattern,
  CTAPattern,
  EmojiFrequency,
  HashtagStyle,
  FormattingStyle,
  LineBreakStyle,
} from './voice-profile.js';
export {
  TONES,
  HOOK_PATTERNS,
  CTA_PATTERNS,
  EMOJI_FREQUENCIES,
  HASHTAG_STYLES,
  FORMATTING_STYLES,
  LINE_BREAK_STYLES,
} from './voice-profile.js';

export type {
  ContentPillar,
  ContentPillarCreateInput,
  ContentPillarUpdateInput,
} from './pillar.js';

export type {
  PostAnalytics,
  PillarAnalytics,
  TimeSeriesPoint,
  WeeklyReport,
  DashboardSummary,
} from './analytics.js';

export type {
  ApiResponse,
  PaginatedResponse,
  PaginationMeta,
  PaginationParams,
  SortParams,
} from './api.js';
export { successResponse, errorResponse } from './api.js';
