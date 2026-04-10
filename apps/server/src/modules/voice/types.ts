// ---------------------------------------------------------------------------
// Voice Analysis Engine – Internal Types
// ---------------------------------------------------------------------------
// These types drive the analysis pipeline. Public-facing types come from
// @auto-linked/shared; the types here are internal to the voice module.
// ---------------------------------------------------------------------------

import type {
  VoiceProfile,
  Tone,
  HookPattern,
  CTAPattern,
  EmojiFrequency,
  HashtagStyle,
  FormattingStyle,
  LineBreakStyle,
} from '@auto-linked/shared/types';

// Re-export shared types that downstream files need
export type {
  VoiceProfile,
  Tone,
  HookPattern,
  CTAPattern,
  EmojiFrequency,
  HashtagStyle,
  FormattingStyle,
  LineBreakStyle,
};

// ---- Input source classification -------------------------------------------

export type InputSource =
  | 'linkedin_posts'
  | 'questionnaire'
  | 'example_posts'
  | 'manual_samples';

// ---- Raw Post (before cleaning) --------------------------------------------

/** A post as it arrives from any input source, before cleaning. */
export interface RawPost {
  readonly text: string;
  readonly source: InputSource;
  readonly date: string | null;
  readonly engagement: number | null; // normalized 0-1, null if unknown
  readonly weight: number;            // source-based weight (0-1)
}

// ---- Cleaned Post (after cleaning) -----------------------------------------

/** A post after HTML stripping, normalisation and annotation. */
export interface CleanedPost {
  readonly originalText: string;
  readonly cleanedText: string;
  readonly source: InputSource;
  readonly date: string | null;
  readonly engagement: number | null;
  readonly weight: number;
  readonly wordCount: number;
  readonly lineCount: number;
  readonly hashtags: readonly string[];
  readonly emojis: readonly EmojiOccurrence[];
  readonly detectedLanguage: string;
}

export interface EmojiOccurrence {
  readonly emoji: string;
  readonly position: 'start' | 'middle' | 'end';
}

// ---- Statistical Analysis --------------------------------------------------

export interface WordCountStats {
  readonly mean: number;
  readonly median: number;
  readonly min: number;
  readonly max: number;
  readonly stddev: number;
}

export interface EmojiStats {
  readonly frequency: EmojiFrequency;
  readonly topEmojis: readonly { readonly emoji: string; readonly count: number }[];
  readonly avgPerPost: number;
  readonly positionDistribution: Record<'start' | 'middle' | 'end', number>;
}

export interface HashtagStats {
  readonly style: HashtagStyle;
  readonly topHashtags: readonly { readonly tag: string; readonly count: number }[];
  readonly avgPerPost: number;
  readonly position: 'end' | 'inline';
}

export interface FormattingStats {
  readonly density: FormattingStyle;
  readonly whitespaceRatio: number;
  readonly bulletUsageRatio: number;
  readonly allCapsFrequency: number;
  readonly lineBreakStyle: LineBreakStyle;
  readonly avgLinesPerPost: number;
  readonly usesLists: boolean;
}

export interface HookStats {
  readonly avgFirstLineWords: number;
  readonly questionFrequency: number; // ratio of posts starting with a question
}

export interface StatisticalAnalysis {
  readonly wordCount: WordCountStats;
  readonly lineCountAvg: number;
  readonly paragraphCountAvg: number;
  readonly avgSentenceLength: number;
  readonly emoji: EmojiStats;
  readonly hashtags: HashtagStats;
  readonly formatting: FormattingStats;
  readonly hooks: HookStats;
  readonly postsAnalyzed: number;
}

// ---- LLM Analysis ----------------------------------------------------------

export interface LLMHookClassification {
  readonly postIndex: number;
  readonly type: HookPattern;
  readonly hookText: string;
  readonly confidence: number;
}

export interface LLMCTAClassification {
  readonly postIndex: number;
  readonly type: CTAPattern;
  readonly ctaText: string | null;
  readonly confidence: number;
}

export interface LLMAnalysis {
  readonly tone: {
    readonly primary: Tone;
    readonly secondary: Tone | null;
    readonly formalityScore: number;
    readonly confidence: number;
    readonly evidence: readonly string[];
  };
  readonly hooks: {
    readonly classifications: readonly LLMHookClassification[];
  };
  readonly ctas: {
    readonly classifications: readonly LLMCTAClassification[];
  };
  readonly vocabulary: {
    readonly signaturePhrases: readonly string[];
    readonly industryJargon: readonly string[];
    readonly powerWords: readonly string[];
    readonly avoidedWords: readonly string[];
    readonly readingLevel: 'basic' | 'intermediate' | 'advanced';
    readonly confidence: number;
  };
  readonly writingStyle: {
    readonly argumentPattern: string;
    readonly distinctiveTraits: readonly string[];
    readonly ghostwriterNotes: readonly string[];
  };
}

// ---- Questionnaire ---------------------------------------------------------

export interface QuestionnaireAnswers {
  readonly professionalRole?: string;
  readonly preferredTone?: Tone;
  readonly emojiPreference?: EmojiFrequency;
  readonly hashtagPreference?: HashtagStyle;
  readonly typicalPostLength?: 'short' | 'medium' | 'long';
  readonly formattingPreference?: FormattingStyle;
  readonly hookPreferences?: readonly HookPattern[];
}

// ---- Analysis Input / Output -----------------------------------------------

/** What the public API accepts. */
export interface AnalysisInput {
  readonly pastedText?: string;
  readonly csvContent?: string;
  readonly questionnaire?: QuestionnaireAnswers;
}

/** What the public API returns. */
export interface VoiceProfileResult {
  readonly profile: VoiceProfile;
  readonly stats: StatisticalAnalysis;
  readonly llmAnalysis: LLMAnalysis | null;
  readonly warnings: readonly string[];
}

// ---- Quality Score ---------------------------------------------------------

export interface StatCheck {
  readonly wordCountInRange: boolean;
  readonly emojiCountInRange: boolean;
  readonly hashtagCountInRange: boolean;
  readonly formattingMatch: boolean;
  readonly hookPresent: boolean;
  readonly ctaPresent: boolean;
  readonly score: number;
  readonly passed: boolean;
}

export interface LLMCheck {
  readonly toneConsistency: number;
  readonly vocabularyMatch: number;
  readonly structuralSimilarity: number;
  readonly hookStyleMatch: number;
  readonly overallScore: number;
  readonly feedback: string;
}

export interface FidelityScore {
  readonly tier1: StatCheck;
  readonly tier2?: LLMCheck;
  readonly overallScore: number;
}
