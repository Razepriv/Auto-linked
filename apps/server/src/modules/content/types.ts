// ---------------------------------------------------------------------------
// Content Generation Pipeline — Domain Types
// ---------------------------------------------------------------------------

import type { PostFormat } from '@auto-linked/shared';

// ---- Enums ----------------------------------------------------------------

/** The 9 hook types used to open LinkedIn posts. */
export type HookType =
  | 'question'
  | 'bold_claim'
  | 'story_opener'
  | 'statistic'
  | 'contrarian'
  | 'confession'
  | 'list_preview'
  | 'metaphor'
  | 'direct_address';

export const HOOK_TYPES: readonly HookType[] = [
  'question',
  'bold_claim',
  'story_opener',
  'statistic',
  'contrarian',
  'confession',
  'list_preview',
  'metaphor',
  'direct_address',
] as const;

/** Angle types that determine the perspective or framing of a post. */
export type AngleType =
  | 'how_to'
  | 'opinion'
  | 'story'
  | 'listicle'
  | 'case_study'
  | 'contrarian'
  | 'behind_the_scenes'
  | 'lesson_learned'
  | 'prediction'
  | 'comparison'
  | 'myth_busting'
  | 'framework';

export const ANGLE_TYPES: readonly AngleType[] = [
  'how_to',
  'opinion',
  'story',
  'listicle',
  'case_study',
  'contrarian',
  'behind_the_scenes',
  'lesson_learned',
  'prediction',
  'comparison',
  'myth_busting',
  'framework',
] as const;

// ---- Calendar -------------------------------------------------------------

/** A single slot in the weekly content calendar. */
export interface CalendarSlot {
  readonly id: string;
  readonly userId: string;
  readonly dayOfWeek: 0 | 1 | 2 | 3 | 4 | 5 | 6; // 0 = Sunday
  readonly pillarId: string | null;
  readonly format: PostFormat;
  readonly angle: AngleType;
  readonly scheduledTime: string; // "HH:MM" UTC
  readonly isActive: boolean;
}

// ---- Generation context ---------------------------------------------------

/** Trending topic used as optional context for generation. */
export interface TrendingTopic {
  readonly title: string;
  readonly summary: string;
  readonly source: string;
  readonly relevanceTags: readonly string[];
}

/** All context assembled before calling the LLM. */
export interface GenerationContext {
  readonly voiceProfile: VoiceProfileSnapshot;
  readonly pillar: PillarSnapshot;
  readonly format: PostFormat;
  readonly hookType: HookType;
  readonly angle: AngleType;
  readonly topic: string;
  readonly trendingTopics: readonly TrendingTopic[];
  readonly topPosts: readonly string[];
  readonly negativeExamples: readonly string[];
  readonly recentPosts: readonly string[];
  readonly userName: string;
  readonly userRole: string;
  readonly userIndustry: string;
}

/** Minimal voice-profile snapshot needed during generation. */
export interface VoiceProfileSnapshot {
  readonly tone: string;
  readonly avgPostLength: number;
  readonly emojiFrequency: string;
  readonly hashtagStyle: string;
  readonly formatting: string;
  readonly lineBreakStyle: string;
  readonly vocabulary: {
    readonly frequentWords: readonly string[];
    readonly avoidedWords: readonly string[];
    readonly jargonTerms: readonly string[];
  };
  readonly emoji: {
    readonly preferred: readonly string[];
  };
  readonly hashtags: {
    readonly recurring: readonly string[];
    readonly placement: string;
  };
  readonly hookPatterns: readonly string[];
  readonly ctaPatterns: readonly string[];
}

/** Minimal pillar snapshot needed during generation. */
export interface PillarSnapshot {
  readonly id: string;
  readonly name: string;
  readonly description: string;
  readonly weight: number;
  readonly exampleTopics: readonly string[];
}

// ---- Generated output -----------------------------------------------------

/** Media recommendation returned by the LLM. */
export interface MediaRecommendation {
  readonly type: 'none' | 'image' | 'carousel' | 'poll';
  readonly description: string;
  readonly altText: string;
  readonly slides?: readonly CarouselSlide[];
  readonly pollQuestion?: string;
  readonly pollOptions?: readonly string[];
}

export interface CarouselSlide {
  readonly title: string;
  readonly bullets: readonly string[];
}

/** Structured output from a single generation call. */
export interface GeneratedPost {
  readonly content: string;
  readonly hook: string;
  readonly hashtags: readonly string[];
  readonly mediaRecommendation: MediaRecommendation;
  readonly strategyNote: string;
}

// ---- Quality check --------------------------------------------------------

export type QualityIssueType =
  | 'repetition'
  | 'tone_mismatch'
  | 'sensitivity'
  | 'generic_ai'
  | 'hook_ineffective'
  | 'missing_cta'
  | 'length_violation';

export type QualityIssueSeverity = 'low' | 'medium' | 'high' | 'critical';

export interface QualityIssue {
  readonly type: QualityIssueType;
  readonly severity: QualityIssueSeverity;
  readonly message: string;
  readonly deduction: number;
}

/** Full quality report for a generated post. */
export interface QualityReport {
  readonly score: number;        // 0-100
  readonly passed: boolean;      // score >= 60
  readonly issues: readonly QualityIssue[];
  readonly checks: {
    readonly repetition: number;
    readonly toneMatch: number;
    readonly sensitivity: number;
    readonly aiDetection: number;
    readonly hookEffectiveness: number;
    readonly ctaPresence: number;
    readonly lengthCompliance: number;
  };
}

// ---- Topic selection ------------------------------------------------------

/** A scored topic candidate. */
export interface TopicCandidate {
  readonly topic: string;
  readonly pillarRelevance: number;
  readonly formatFit: number;
  readonly trendingBoost: number;
  readonly performancePrediction: number;
  readonly repetitionPenalty: number;
  readonly finalScore: number;
}

/** Context needed for topic selection. */
export interface TopicContext {
  readonly pillar: PillarSnapshot;
  readonly format: PostFormat;
  readonly recentTopics: readonly string[];
  readonly trendingTopics: readonly TrendingTopic[];
  readonly userName: string;
  readonly userIndustry: string;
}

// ---- Prompt building params -----------------------------------------------

export interface GenerationParams {
  readonly pillar: PillarSnapshot;
  readonly format: PostFormat;
  readonly hookType: HookType;
  readonly angle: AngleType;
  readonly topic: string;
  readonly trendingTopics: readonly TrendingTopic[];
  readonly topPosts: readonly string[];
  readonly negativeExamples: readonly string[];
  readonly recentPosts: readonly string[];
  readonly userName: string;
  readonly userRole: string;
  readonly userIndustry: string;
}
