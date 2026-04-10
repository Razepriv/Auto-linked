// ---------------------------------------------------------------------------
// Voice Analysis Engine – Quality Scorer
// ---------------------------------------------------------------------------
// Two-tier scoring system that validates whether generated content matches
// a user's voice profile.
//   Tier 1: Free statistical pre-check (instant)
//   Tier 2: LLM comparison (costs ~$0.01, optional)
// ---------------------------------------------------------------------------

import { chatCompletion } from '../../lib/llm-client.js';
import { z } from 'zod';

import type {
  VoiceProfile,
  StatCheck,
  LLMCheck,
  FidelityScore,
} from './types.js';
import { buildVoiceComparisonPrompt } from './prompts.js';

// ---- Constants -------------------------------------------------------------

const TIER1_PASS_THRESHOLD = 60;
const MAX_TOKENS = 1024;

// ---- Scoring weights (total = 100) -----------------------------------------

const WEIGHTS = {
  wordCount: 25,
  formatting: 20,
  hookPresent: 20,
  ctaPresent: 15,
  emoji: 10,
  hashtag: 10,
} as const;

// ---- Emoji / hashtag regex -------------------------------------------------

const EMOJI_RE = /\p{Emoji_Presentation}|\p{Emoji}\uFE0F/gu;
const HASHTAG_RE = /#[\w\u00C0-\u017F]+/g;

// ---- Zod schema for Tier 2 LLM response ------------------------------------

const LLMCheckSchema = z.object({
  tone_consistency: z.number().min(0).max(1),
  vocabulary_match: z.number().min(0).max(1),
  structural_similarity: z.number().min(0).max(1),
  hook_style_match: z.number().min(0).max(1),
  overall_score: z.number().min(0).max(1),
  feedback: z.string(),
});

// ---- Public API ------------------------------------------------------------

/**
 * Score how well a piece of content matches a voice profile.
 *
 * Returns Tier 1 (statistical) results always. Tier 2 (LLM) is included
 * only if `runTier2` is true AND Tier 1 passes.
 *
 * @param profile  The user's voice profile
 * @param content  The generated content to check
 * @param options  Control Tier 2 execution and provide example posts
 */
export async function scoreContentFidelity(
  profile: VoiceProfile,
  content: string,
  options: {
    readonly runTier2?: boolean;
    readonly examplePosts?: readonly string[];
  } = {},
): Promise<FidelityScore> {
  const tier1 = computeTier1(profile, content);

  if (!options.runTier2 || !tier1.passed) {
    return {
      tier1,
      overallScore: tier1.score,
    };
  }

  // Tier 2: LLM comparison
  const examples = options.examplePosts ?? [];
  if (examples.length === 0) {
    return {
      tier1,
      overallScore: tier1.score,
    };
  }

  const tier2 = await computeTier2(profile, content, examples);
  if (!tier2) {
    return {
      tier1,
      overallScore: tier1.score,
    };
  }

  // Combine: Tier 1 contributes 40%, Tier 2 contributes 60%
  const overallScore = Math.round(tier1.score * 0.4 + tier2.overallScore * 100 * 0.6);

  return {
    tier1,
    tier2,
    overallScore: Math.min(100, Math.max(0, overallScore)),
  };
}

// ---- Tier 1: Statistical pre-check -----------------------------------------

function computeTier1(profile: VoiceProfile, content: string): StatCheck {
  const wordCount = countWords(content);
  const emojiCount = countEmojis(content);
  const hashtagCount = countHashtags(content);
  const lines = content.split('\n').filter((l) => l.trim().length > 0);

  // Word count check: within the profile's reasonable range
  const avgPostLength = profile.formatting.avgPostLength ?? 150;
  const wordTarget = Math.round(avgPostLength / 5.5); // reverse the char estimate
  const wordMin = Math.max(Math.round(wordTarget * 0.5), 10);
  const wordMax = Math.round(wordTarget * 2.0);
  const wordCountInRange = wordCount >= wordMin && wordCount <= wordMax;

  // Emoji check: within +/- 2 of expected
  const expectedEmojis = emojiAvgFromFrequency(profile.emoji.frequency);
  const emojiCountInRange =
    Math.abs(emojiCount - expectedEmojis) <= 2 ||
    (profile.emoji.frequency === 'none' && emojiCount <= 1);

  // Hashtag check: within +/- 2 of expected
  const expectedHashtags = hashtagAvgFromStyle(profile.hashtags.style);
  const hashtagCountInRange =
    Math.abs(hashtagCount - expectedHashtags) <= 2 ||
    (profile.hashtags.style === 'none' && hashtagCount <= 1);

  // Formatting check: line density approximately matches
  const formattingMatch = checkFormatting(profile, content, lines);

  // Hook present: first line is a standalone opening
  const firstLine = lines[0] ?? '';
  const hookPresent =
    firstLine.length > 5 &&
    firstLine.length < 200 &&
    firstLine.split(/\s+/).length >= 3;

  // CTA present: last lines contain a question or imperative
  const lastLines = lines.slice(-2).join(' ');
  const ctaPresent =
    lastLines.includes('?') ||
    /\b(share|comment|tag|follow|try|drop|tell|let me know)\b/i.test(
      lastLines,
    );

  // Scoring
  let score = 0;
  if (wordCountInRange) score += WEIGHTS.wordCount;
  if (formattingMatch) score += WEIGHTS.formatting;
  if (hookPresent) score += WEIGHTS.hookPresent;
  if (ctaPresent) score += WEIGHTS.ctaPresent;
  if (emojiCountInRange) score += WEIGHTS.emoji;
  if (hashtagCountInRange) score += WEIGHTS.hashtag;

  return {
    wordCountInRange,
    emojiCountInRange,
    hashtagCountInRange,
    formattingMatch,
    hookPresent,
    ctaPresent,
    score,
    passed: score >= TIER1_PASS_THRESHOLD,
  };
}

// ---- Tier 2: LLM comparison ------------------------------------------------

async function computeTier2(
  profile: VoiceProfile,
  content: string,
  examples: readonly string[],
): Promise<LLMCheck | null> {
  try {
    const { system, user } = buildVoiceComparisonPrompt(
      profile,
      examples,
      content,
    );

    const rawText = await chatCompletion(system, user, MAX_TOKENS);

    const cleaned = rawText
      .replace(/^```(?:json)?\s*/m, '')
      .replace(/\s*```\s*$/m, '')
      .trim();

    const parsed = LLMCheckSchema.safeParse(JSON.parse(cleaned));
    if (!parsed.success) {
      return null;
    }

    return {
      toneConsistency: parsed.data.tone_consistency,
      vocabularyMatch: parsed.data.vocabulary_match,
      structuralSimilarity: parsed.data.structural_similarity,
      hookStyleMatch: parsed.data.hook_style_match,
      overallScore: parsed.data.overall_score,
      feedback: parsed.data.feedback,
    };
  } catch {
    // Tier 2 is optional; return null on failure
    return null;
  }
}

// ---- Helpers ---------------------------------------------------------------

function countWords(text: string): number {
  const stripped = text
    .replace(HASHTAG_RE, '')
    .replace(EMOJI_RE, '')
    .replace(/https?:\/\/\S+/g, '')
    .trim();
  if (stripped.length === 0) return 0;
  return stripped.split(/\s+/).filter((w) => w.length > 0).length;
}

function countEmojis(text: string): number {
  return (text.match(EMOJI_RE) || []).length;
}

function countHashtags(text: string): number {
  return (text.match(HASHTAG_RE) || []).length;
}

function emojiAvgFromFrequency(
  freq: VoiceProfile['emoji']['frequency'],
): number {
  switch (freq) {
    case 'none':
      return 0;
    case 'minimal':
      return 1;
    case 'moderate':
      return 3;
    case 'heavy':
      return 6;
  }
}

function hashtagAvgFromStyle(
  style: VoiceProfile['hashtags']['style'],
): number {
  switch (style) {
    case 'none':
      return 0;
    case 'minimal':
      return 2;
    case 'moderate':
      return 4;
    case 'heavy':
      return 7;
    case 'branded_only':
      return 2;
  }
}

function checkFormatting(
  profile: VoiceProfile,
  _content: string,
  lines: readonly string[],
): boolean {
  const lineCount = lines.length;

  switch (profile.formatting.style) {
    case 'dense':
      // Dense posts have few line breaks relative to word count
      return lineCount < 8;
    case 'scannable':
      // Scannable posts have many short lines
      return lineCount >= 3;
    case 'one_liner':
      // One sentence per line style
      return lineCount >= 5;
    case 'mixed':
      // Mixed is permissive
      return true;
  }
}
