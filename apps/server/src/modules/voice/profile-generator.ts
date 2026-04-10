// ---------------------------------------------------------------------------
// Voice Analysis Engine – Profile Generator
// ---------------------------------------------------------------------------
// Merges statistical + LLM analysis into a single VoiceProfile.
// Reconciliation: stats win for quantitative, LLM wins for qualitative.
// ---------------------------------------------------------------------------

import { randomUUID } from 'node:crypto';

import type {
  VoiceProfile,
  StatisticalAnalysis,
  LLMAnalysis,
  QuestionnaireAnswers,
  HookPattern,
  CTAPattern,
  Tone,
  EmojiFrequency,
  HashtagStyle,
  FormattingStyle,
  LineBreakStyle,
} from './types.js';
import type { ScoredTrait } from '@auto-linked/shared/types';

// ---- Public API ------------------------------------------------------------

/**
 * Merge statistical and LLM analysis outputs into a final VoiceProfile.
 *
 * Reconciliation rules:
 *   - Stats win for quantitative fields (word count, emoji count, hashtag count)
 *   - LLM wins for qualitative fields (tone, hooks, vocabulary)
 *   - Confidence is computed per dimension
 *
 * If `questionnaire` is provided but no posts were analyzed, a seed profile
 * is generated from the questionnaire alone with low confidence.
 */
export function generateProfile(
  stats: StatisticalAnalysis,
  llm: LLMAnalysis | null,
  questionnaire?: QuestionnaireAnswers,
): VoiceProfile {
  const now = new Date().toISOString();
  const postCount = stats.postsAnalyzed;
  const sampleFactor = Math.min(1.0, postCount / 20);

  // If no LLM analysis, build from stats + questionnaire only
  if (!llm) {
    return buildStatsOnlyProfile(stats, questionnaire, sampleFactor, now);
  }

  // ---- Tone (LLM wins) ----
  const toneConfidence = computeConfidence(
    llm.tone.confidence,
    sampleFactor,
    1.0, // no stat/llm disagreement possible for tone
  );

  const tone: ScoredTrait<Tone> = {
    value: llm.tone.primary,
    confidence: toneConfidence,
  };

  // ---- Hook patterns (LLM wins) ----
  const hookPatterns = computeHookPatterns(llm, sampleFactor);

  // ---- CTA patterns (LLM wins) ----
  const ctaPatterns = computeCTAPatterns(llm, sampleFactor);

  // ---- Vocabulary (LLM wins) ----
  const vocabulary = {
    frequentWords: llm.vocabulary.signaturePhrases.slice(0, 20),
    avoidedWords: llm.vocabulary.avoidedWords.slice(0, 10),
    jargonTerms: llm.vocabulary.industryJargon.slice(0, 15),
    readingLevel: readingLevelToGrade(llm.vocabulary.readingLevel),
    avgSentenceLength:
      stats.avgSentenceLength > 0 ? stats.avgSentenceLength : null,
  };

  // ---- Emoji (stats win for counts, stats classification) ----
  const emojiFrequency = stats.emoji.frequency;
  const preferredEmojis = stats.emoji.topEmojis.slice(0, 10).map((e) => e.emoji);
  const usedAsBullets = detectEmojiAsBullets(stats);

  const emoji = {
    frequency: emojiFrequency,
    preferred: preferredEmojis,
    usedAsBullets,
  };

  // ---- Hashtags (stats win for counts) ----
  const hashtags = {
    style: stats.hashtags.style,
    recurring: stats.hashtags.topHashtags.slice(0, 10).map((h) => h.tag),
    placement: stats.hashtags.position as 'end' | 'inline',
  };

  // ---- Formatting (stats win) ----
  const formatting = {
    style: stats.formatting.density,
    lineBreaks: stats.formatting.lineBreakStyle,
    usesLists: stats.formatting.usesLists,
    avgPostLength: stats.wordCount.mean > 0 ? Math.round(stats.wordCount.mean * 5.5) : null, // rough char estimate
    separatesHook: stats.hooks.avgFirstLineWords > 3 && stats.hooks.avgFirstLineWords < 20,
  };

  // ---- Confidence scoring ----
  const toneWeight = 2;
  const hookWeight = 2;
  const structureWeight = 1;
  const vocabWeight = 1;
  const emojiWeight = 0.5;
  const hashtagWeight = 0.5;
  const formattingWeight = 1;

  const statBaseConfidence = 0.9;

  const sectionConfidences = [
    { weight: toneWeight, conf: toneConfidence },
    {
      weight: hookWeight,
      conf:
        hookPatterns.length > 0
          ? hookPatterns.reduce((s, h) => s + h.confidence, 0) /
            hookPatterns.length
          : 0.3,
    },
    {
      weight: structureWeight,
      conf: computeConfidence(statBaseConfidence, sampleFactor, 1.0),
    },
    {
      weight: vocabWeight,
      conf: computeConfidence(llm.vocabulary.confidence, sampleFactor, 1.0),
    },
    {
      weight: emojiWeight,
      conf: computeConfidence(statBaseConfidence, sampleFactor, 1.0),
    },
    {
      weight: hashtagWeight,
      conf: computeConfidence(statBaseConfidence, sampleFactor, 1.0),
    },
    {
      weight: formattingWeight,
      conf: computeConfidence(statBaseConfidence, sampleFactor, 1.0),
    },
  ];

  const totalWeight = sectionConfidences.reduce((s, c) => s + c.weight, 0);
  const overallConfidence =
    sectionConfidences.reduce((s, c) => s + c.weight * c.conf, 0) /
    Math.max(totalWeight, 1);

  return {
    id: randomUUID(),
    userId: '', // set by the calling service
    tone,
    hookPatterns,
    ctaPatterns,
    vocabulary,
    emoji,
    hashtags,
    formatting,
    postsAnalyzed: postCount,
    overallConfidence: round2(overallConfidence),
    createdAt: now,
    updatedAt: now,
  };
}

// ---- Stats-only profile (no LLM available) ---------------------------------

function buildStatsOnlyProfile(
  stats: StatisticalAnalysis,
  questionnaire: QuestionnaireAnswers | undefined,
  sampleFactor: number,
  now: string,
): VoiceProfile {
  const baseTone: Tone = questionnaire?.preferredTone ?? 'professional';
  const baseConfidence = 0.3 * sampleFactor;

  const hookPatterns: readonly ScoredTrait<HookPattern>[] =
    questionnaire?.hookPreferences?.map((hp) => ({
      value: hp,
      confidence: baseConfidence,
    })) ?? [];

  // Derive hook patterns from statistical question frequency
  const statHookPatterns: ScoredTrait<HookPattern>[] = [];
  if (stats.hooks.questionFrequency > 0.3) {
    statHookPatterns.push({
      value: 'question' as HookPattern,
      confidence: Math.min(stats.hooks.questionFrequency, 0.9) * sampleFactor,
    });
  }

  const mergedHooks =
    hookPatterns.length > 0 ? hookPatterns : statHookPatterns;

  const emojiFrequency: EmojiFrequency =
    stats.emoji.frequency !== 'none'
      ? stats.emoji.frequency
      : questionnaire?.emojiPreference ?? 'none';

  const hashtagStyle: HashtagStyle =
    stats.hashtags.style !== 'none'
      ? stats.hashtags.style
      : questionnaire?.hashtagPreference ?? 'none';

  const formattingStyle: FormattingStyle =
    stats.postsAnalyzed > 0
      ? stats.formatting.density
      : questionnaire?.formattingPreference ?? 'scannable';

  const overallConfidence = stats.postsAnalyzed > 0
    ? round2(0.5 * sampleFactor)
    : 0.3;

  return {
    id: randomUUID(),
    userId: '',
    tone: { value: baseTone, confidence: round2(baseConfidence) },
    hookPatterns: mergedHooks,
    ctaPatterns: [],
    vocabulary: {
      frequentWords: [],
      avoidedWords: [],
      jargonTerms: questionnaire?.professionalRole
        ? [questionnaire.professionalRole]
        : [],
      readingLevel: null,
      avgSentenceLength:
        stats.avgSentenceLength > 0 ? stats.avgSentenceLength : null,
    },
    emoji: {
      frequency: emojiFrequency,
      preferred: stats.emoji.topEmojis.slice(0, 10).map((e) => e.emoji),
      usedAsBullets: false,
    },
    hashtags: {
      style: hashtagStyle,
      recurring: stats.hashtags.topHashtags.slice(0, 10).map((h) => h.tag),
      placement: stats.hashtags.position as 'end' | 'inline',
    },
    formatting: {
      style: formattingStyle,
      lineBreaks: stats.formatting.lineBreakStyle,
      usesLists: stats.formatting.usesLists,
      avgPostLength: stats.wordCount.mean > 0 ? Math.round(stats.wordCount.mean * 5.5) : null,
      separatesHook: true,
    },
    postsAnalyzed: stats.postsAnalyzed,
    overallConfidence,
    createdAt: now,
    updatedAt: now,
  };
}

// ---- Hook / CTA pattern extraction -----------------------------------------

function computeHookPatterns(
  llm: LLMAnalysis,
  sampleFactor: number,
): readonly ScoredTrait<HookPattern>[] {
  const counts = new Map<HookPattern, number>();
  const total = llm.hooks.classifications.length;

  for (const h of llm.hooks.classifications) {
    counts.set(h.type, (counts.get(h.type) ?? 0) + 1);
  }

  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([type, count]) => ({
      value: type,
      confidence: round2(
        computeConfidence(count / Math.max(total, 1), sampleFactor, 1.0),
      ),
    }));
}

function computeCTAPatterns(
  llm: LLMAnalysis,
  sampleFactor: number,
): readonly ScoredTrait<CTAPattern>[] {
  const counts = new Map<CTAPattern, number>();
  const total = llm.ctas.classifications.length;

  for (const c of llm.ctas.classifications) {
    if (c.type === 'none') continue; // Skip "no CTA" classification
    counts.set(c.type, (counts.get(c.type) ?? 0) + 1);
  }

  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([type, count]) => ({
      value: type,
      confidence: round2(
        computeConfidence(count / Math.max(total, 1), sampleFactor, 1.0),
      ),
    }));
}

// ---- Helpers ---------------------------------------------------------------

/**
 * Confidence = base * sampleFactor * agreementFactor
 */
function computeConfidence(
  base: number,
  sampleFactor: number,
  agreementFactor: number,
): number {
  return Math.min(1.0, base * sampleFactor * agreementFactor);
}

function readingLevelToGrade(
  level: 'basic' | 'intermediate' | 'advanced',
): number | null {
  switch (level) {
    case 'basic':
      return 6;
    case 'intermediate':
      return 10;
    case 'advanced':
      return 14;
  }
}

/**
 * Detect whether emojis are used as bullet-point markers (e.g. each line
 * starts with the same emoji).
 */
function detectEmojiAsBullets(stats: StatisticalAnalysis): boolean {
  // If emojis are frequent and predominantly at line starts, they're likely bullets
  return (
    stats.emoji.avgPerPost >= 3 &&
    stats.emoji.positionDistribution.start > 0.5
  );
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}
