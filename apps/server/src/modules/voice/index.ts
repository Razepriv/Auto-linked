// ---------------------------------------------------------------------------
// Voice Analysis Engine – Public API
// ---------------------------------------------------------------------------
// Orchestrates the full voice analysis pipeline:
//   collect -> clean -> statistical analysis -> LLM analysis -> merge
// ---------------------------------------------------------------------------

import type {
  AnalysisInput,
  VoiceProfileResult,
  FidelityScore,
  VoiceProfile,
  CleanedPost,
  RawPost,
} from './types.js';
import { collectFromPaste, collectFromCSV, collectFromQuestionnaire } from './collector.js';
import { cleanBatch } from './cleaner.js';
import { analyzeStatistically } from './statistical-analyzer.js';
import { analyzeLLM } from './llm-analyzer.js';
import { generateProfile } from './profile-generator.js';
import { scoreContentFidelity } from './quality-scorer.js';

// Re-export all types for consumers
export type {
  AnalysisInput,
  VoiceProfileResult,
  FidelityScore,
  VoiceProfile,
  StatisticalAnalysis,
  LLMAnalysis,
  QuestionnaireAnswers,
  StatCheck,
  LLMCheck,
  RawPost,
  CleanedPost,
} from './types.js';

// Re-export individual modules for advanced usage
export { collectFromPaste, collectFromCSV, collectFromQuestionnaire } from './collector.js';
export { cleanPost, cleanBatch } from './cleaner.js';
export { analyzeStatistically } from './statistical-analyzer.js';
export { analyzeLLM } from './llm-analyzer.js';
export { generateProfile } from './profile-generator.js';
export { scoreContentFidelity } from './quality-scorer.js';
export { buildVoiceAnalysisPrompt, buildVoiceComparisonPrompt } from './prompts.js';

// ---- Constants -------------------------------------------------------------

const MIN_POSTS_FOR_LLM = 3;

// ---- Public API ------------------------------------------------------------

/**
 * Run the full voice analysis pipeline.
 *
 * Accepts pasted text, CSV content, and/or questionnaire answers. Collects
 * posts from all provided sources, cleans them, runs statistical and (if
 * enough posts) LLM analysis, and generates a merged VoiceProfile.
 *
 * @param input - One or more of: pastedText, csvContent, questionnaire
 * @returns A VoiceProfileResult with the profile, stats, optional LLM analysis, and any warnings
 *
 * @example
 * ```ts
 * const result = await analyzeVoice({
 *   pastedText: "My first post\n---\nMy second post",
 *   questionnaire: { preferredTone: 'professional' },
 * });
 * console.log(result.profile.tone); // { value: 'professional', confidence: 0.75 }
 * ```
 */
export async function analyzeVoice(
  input: AnalysisInput,
): Promise<VoiceProfileResult> {
  const warnings: string[] = [];

  // ---- Stage 1: Collect samples ----
  const rawPosts: RawPost[] = [];

  if (input.pastedText) {
    const pasted = collectFromPaste(input.pastedText);
    rawPosts.push(...pasted);
  }

  if (input.csvContent) {
    const csv = collectFromCSV(input.csvContent);
    rawPosts.push(...csv);
  }

  // If no posts at all and only questionnaire, return a seed profile
  if (rawPosts.length === 0 && input.questionnaire) {
    const seedPartial = collectFromQuestionnaire(input.questionnaire);
    const emptyStats = analyzeStatistically([]);
    const seedProfile = generateProfile(emptyStats, null, input.questionnaire);

    // Merge questionnaire overrides into the seed profile
    const profile: VoiceProfile = {
      ...seedProfile,
      ...(seedPartial.tone !== undefined ? { tone: seedPartial.tone } : {}),
      ...(seedPartial.emoji !== undefined ? { emoji: seedPartial.emoji } : {}),
      ...(seedPartial.hashtags !== undefined ? { hashtags: seedPartial.hashtags } : {}),
      ...(seedPartial.formatting !== undefined ? { formatting: seedPartial.formatting } : {}),
    };

    warnings.push(
      'No posts were provided. The voice profile was generated from questionnaire answers only and has low confidence.',
      'Your voice profile will improve significantly after analyzing 10+ posts.',
    );

    return {
      profile,
      stats: emptyStats,
      llmAnalysis: null,
      warnings,
    };
  }

  if (rawPosts.length === 0) {
    throw new Error(
      'No input provided. Supply at least pastedText, csvContent, or questionnaire answers.',
    );
  }

  // ---- Stage 2: Clean and prepare ----
  const cleanedPosts: readonly CleanedPost[] = cleanBatch(rawPosts);

  if (cleanedPosts.length === 0) {
    warnings.push(
      'All provided posts were filtered out (too short or duplicates). Falling back to questionnaire if available.',
    );

    const emptyStats = analyzeStatistically([]);
    const profile = generateProfile(emptyStats, null, input.questionnaire);

    return {
      profile,
      stats: emptyStats,
      llmAnalysis: null,
      warnings,
    };
  }

  // Check for multilingual content
  const languages = new Set(cleanedPosts.map((p) => p.detectedLanguage));
  if (languages.size > 1) {
    const langList = [...languages].join(', ');
    warnings.push(
      `Posts in multiple languages detected (${langList}). The analysis is based on all posts, but accuracy may be lower for non-primary languages.`,
    );
  }

  if (cleanedPosts.length < 5) {
    warnings.push(
      `Only ${cleanedPosts.length} posts available for analysis. The profile will have lower confidence. Provide 20+ posts for best results.`,
    );
  }

  // ---- Stage 3: Statistical analysis ----
  const stats = analyzeStatistically(cleanedPosts);

  // ---- Stage 4: LLM analysis (if enough posts) ----
  let llmAnalysis = null;

  if (cleanedPosts.length >= MIN_POSTS_FOR_LLM) {
    try {
      llmAnalysis = await analyzeLLM(cleanedPosts, input.questionnaire);
    } catch (error: unknown) {
      const message =
        error instanceof Error ? error.message : 'Unknown LLM error';
      warnings.push(
        `LLM analysis failed: ${message}. The profile was generated from statistical analysis only.`,
      );
    }
  } else {
    warnings.push(
      `Too few posts (${cleanedPosts.length}) for LLM analysis (minimum: ${MIN_POSTS_FOR_LLM}). Statistical analysis only.`,
    );
  }

  // ---- Stage 5: Merge profiles ----
  const profile = generateProfile(stats, llmAnalysis, input.questionnaire);

  return {
    profile,
    stats,
    llmAnalysis,
    warnings,
  };
}

/**
 * Score how well a piece of content matches a voice profile.
 *
 * Runs Tier 1 (free statistical check) always. Optionally runs Tier 2
 * (LLM comparison) if the caller enables it and provides example posts.
 *
 * @param profile      The user's voice profile
 * @param content      The generated content to score
 * @param options      Optional: enable Tier 2 and provide example posts
 * @returns A FidelityScore with per-dimension breakdown
 *
 * @example
 * ```ts
 * const score = await scoreContent(profile, generatedPost, {
 *   runTier2: true,
 *   examplePosts: ['Original post 1', 'Original post 2'],
 * });
 * console.log(score.overallScore); // 0-100
 * ```
 */
export async function scoreContent(
  profile: VoiceProfile,
  content: string,
  options: {
    readonly runTier2?: boolean;
    readonly examplePosts?: readonly string[];
  } = {},
): Promise<FidelityScore> {
  return scoreContentFidelity(profile, content, options);
}
