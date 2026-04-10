// ---------------------------------------------------------------------------
// Voice Analysis Engine – LLM Analyzer
// ---------------------------------------------------------------------------
// Sends cleaned posts to the Claude API for qualitative voice analysis.
// Batches posts (max 20 per call), validates responses with Zod, and
// retries once on parse failure.
// ---------------------------------------------------------------------------

import { chatCompletion } from '../../lib/llm-client.js';
import { z } from 'zod';

import type { CleanedPost, LLMAnalysis, QuestionnaireAnswers } from './types.js';
import { buildVoiceAnalysisPrompt } from './prompts.js';

// ---- Constants -------------------------------------------------------------

const MAX_POSTS_PER_BATCH = 20;
const MAX_TOKENS = 4096;

// ---- Zod schema for LLM output validation ----------------------------------

const HookPatternEnum = z.enum([
  'question',
  'bold_statement',
  'statistic',
  'story',
  'contrarian',
  'listicle',
  'quote',
  'personal_anecdote',
  'problem_statement',
]);

const CTAPatternEnum = z.enum([
  'question',
  'agree_disagree',
  'share_experience',
  'tag_someone',
  'follow_for_more',
  'link_in_comments',
  'dm_me',
  'repost',
  'none',
]);

const ToneEnum = z.enum([
  'professional',
  'conversational',
  'inspirational',
  'educational',
  'humorous',
  'provocative',
  'storytelling',
  'authoritative',
]);

const LLMAnalysisSchema = z.object({
  tone: z.object({
    primary: ToneEnum,
    secondary: ToneEnum.nullable(),
    formality_score: z.number().min(0).max(1),
    confidence: z.number().min(0).max(1),
    evidence: z.array(z.string()).min(1),
  }),
  hooks: z.object({
    classifications: z.array(
      z.object({
        post_index: z.number(),
        type: HookPatternEnum,
        hook_text: z.string(),
        confidence: z.number().min(0).max(1),
      }),
    ),
  }),
  ctas: z.object({
    classifications: z.array(
      z.object({
        post_index: z.number(),
        type: CTAPatternEnum,
        cta_text: z.string().nullable(),
        confidence: z.number().min(0).max(1),
      }),
    ),
  }),
  vocabulary: z.object({
    signature_phrases: z.array(z.string()),
    industry_jargon: z.array(z.string()),
    power_words: z.array(z.string()),
    avoided_words: z.array(z.string()),
    reading_level: z.enum(['basic', 'intermediate', 'advanced']),
    confidence: z.number().min(0).max(1),
  }),
  writing_style: z.object({
    argument_pattern: z.string(),
    distinctive_traits: z.array(z.string()),
    ghostwriter_notes: z.array(z.string()),
  }),
});

type RawLLMOutput = z.infer<typeof LLMAnalysisSchema>;

// ---- Public API ------------------------------------------------------------

/**
 * Analyze posts using Claude API for qualitative voice dimensions.
 *
 * Posts are batched (max 20 per call). Multiple batches are merged with
 * engagement-weighted priority. Responses are validated with Zod and
 * retried once on parse failure.
 *
 * @throws Error if the API call fails after retry
 */
export async function analyzeLLM(
  posts: readonly CleanedPost[],
  questionnaire?: QuestionnaireAnswers,
): Promise<LLMAnalysis> {
  // Sort by engagement (highest first) so the best posts are in batch 1
  const sorted = [...posts].sort(
    (a, b) => (b.engagement ?? 0) - (a.engagement ?? 0),
  );

  // Split into batches of MAX_POSTS_PER_BATCH
  const batches: CleanedPost[][] = [];
  for (let i = 0; i < sorted.length; i += MAX_POSTS_PER_BATCH) {
    batches.push(sorted.slice(i, i + MAX_POSTS_PER_BATCH));
  }

  // Process batches (sequentially to respect rate limits)
  const batchResults: RawLLMOutput[] = [];
  for (const batch of batches) {
    const result = await callLLMWithRetry(batch, questionnaire);
    if (result) {
      batchResults.push(result);
    }
  }

  if (batchResults.length === 0) {
    throw new Error(
      'LLM analysis failed: could not obtain a valid response from the LLM.',
    );
  }

  // Merge batch results (first batch has highest-engagement posts, so it wins)
  const merged = mergeBatchResults(batchResults);
  const isLowConfidence = posts.length < 5;

  return transformToLLMAnalysis(merged, isLowConfidence);
}

// ---- LLM API call with retry -----------------------------------------------

async function callLLMWithRetry(
  posts: readonly CleanedPost[],
  questionnaire?: QuestionnaireAnswers,
): Promise<RawLLMOutput | null> {
  const { system, user } = buildVoiceAnalysisPrompt(posts, questionnaire);

  // First attempt
  const firstResponse = await chatCompletion(system, user, MAX_TOKENS);
  const firstParse = parseLLMResponse(firstResponse);

  if (firstParse.success) {
    return firstParse.data;
  }

  // Retry with validation error appended
  const retryUser = [
    user,
    '',
    'IMPORTANT: Your previous response had validation errors:',
    firstParse.error,
    '',
    'Please correct your output and return valid JSON matching the schema exactly.',
  ].join('\n');

  const retryResponse = await chatCompletion(system, retryUser, MAX_TOKENS);
  const retryParse = parseLLMResponse(retryResponse);

  if (retryParse.success) {
    return retryParse.data;
  }

  // Both attempts failed
  return null;
}

// ---- Response parsing ------------------------------------------------------

type ParseResult =
  | { success: true; data: RawLLMOutput }
  | { success: false; error: string };

function parseLLMResponse(raw: string): ParseResult {
  // Strip any markdown code fences the LLM might have added
  const cleaned = raw
    .replace(/^```(?:json)?\s*/m, '')
    .replace(/\s*```\s*$/m, '')
    .trim();

  let parsed: unknown;
  try {
    parsed = JSON.parse(cleaned);
  } catch {
    return {
      success: false,
      error: `JSON parse error: the response is not valid JSON. First 200 chars: ${cleaned.slice(0, 200)}`,
    };
  }

  const result = LLMAnalysisSchema.safeParse(parsed);
  if (!result.success) {
    const errors = result.error.issues
      .map((issue) => `${issue.path.join('.')}: ${issue.message}`)
      .join('; ');
    return { success: false, error: `Zod validation failed: ${errors}` };
  }

  return { success: true, data: result.data };
}

// ---- Batch merging ---------------------------------------------------------

function mergeBatchResults(batches: readonly RawLLMOutput[]): RawLLMOutput {
  if (batches.length === 1) {
    return batches[0]!;
  }

  // First batch (highest engagement) is the primary
  const primary = batches[0]!;

  // Merge hook and CTA classifications from all batches
  const allHooks = batches.flatMap((b) => b.hooks.classifications);
  const allCTAs = batches.flatMap((b) => b.ctas.classifications);

  // Merge vocabulary arrays (deduplicate)
  const signaturePhrases = deduplicateStrings(
    batches.flatMap((b) => b.vocabulary.signature_phrases),
  );
  const industryJargon = deduplicateStrings(
    batches.flatMap((b) => b.vocabulary.industry_jargon),
  );
  const powerWords = deduplicateStrings(
    batches.flatMap((b) => b.vocabulary.power_words),
  );
  const avoidedWords = deduplicateStrings(
    batches.flatMap((b) => b.vocabulary.avoided_words),
  );

  // Merge writing style traits
  const distinctiveTraits = deduplicateStrings(
    batches.flatMap((b) => b.writing_style.distinctive_traits),
  );
  const ghostwriterNotes = deduplicateStrings(
    batches.flatMap((b) => b.writing_style.ghostwriter_notes),
  );

  return {
    // Tone comes from primary batch (highest engagement posts)
    tone: primary.tone,
    hooks: { classifications: allHooks },
    ctas: { classifications: allCTAs },
    vocabulary: {
      signature_phrases: signaturePhrases,
      industry_jargon: industryJargon,
      power_words: powerWords,
      avoided_words: avoidedWords,
      reading_level: primary.vocabulary.reading_level,
      confidence: primary.vocabulary.confidence,
    },
    writing_style: {
      argument_pattern: primary.writing_style.argument_pattern,
      distinctive_traits: distinctiveTraits,
      ghostwriter_notes: ghostwriterNotes,
    },
  };
}

function deduplicateStrings(arr: readonly string[]): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const item of arr) {
    const key = item.toLowerCase().trim();
    if (!seen.has(key) && key.length > 0) {
      seen.add(key);
      result.push(item.trim());
    }
  }
  return result;
}

// ---- Transform to internal type --------------------------------------------

function transformToLLMAnalysis(
  raw: RawLLMOutput,
  isLowConfidence: boolean,
): LLMAnalysis {
  const confidenceMultiplier = isLowConfidence ? 0.5 : 1.0;

  return {
    tone: {
      primary: raw.tone.primary,
      secondary: raw.tone.secondary,
      formalityScore: raw.tone.formality_score,
      confidence: Math.min(raw.tone.confidence * confidenceMultiplier, 1),
      evidence: raw.tone.evidence,
    },
    hooks: {
      classifications: raw.hooks.classifications.map((h) => ({
        postIndex: h.post_index,
        type: h.type,
        hookText: h.hook_text,
        confidence: Math.min(h.confidence * confidenceMultiplier, 1),
      })),
    },
    ctas: {
      classifications: raw.ctas.classifications.map((c) => ({
        postIndex: c.post_index,
        type: c.type,
        ctaText: c.cta_text,
        confidence: Math.min(c.confidence * confidenceMultiplier, 1),
      })),
    },
    vocabulary: {
      signaturePhrases: raw.vocabulary.signature_phrases,
      industryJargon: raw.vocabulary.industry_jargon,
      powerWords: raw.vocabulary.power_words,
      avoidedWords: raw.vocabulary.avoided_words,
      readingLevel: raw.vocabulary.reading_level,
      confidence: Math.min(
        raw.vocabulary.confidence * confidenceMultiplier,
        1,
      ),
    },
    writingStyle: {
      argumentPattern: raw.writing_style.argument_pattern,
      distinctiveTraits: raw.writing_style.distinctive_traits,
      ghostwriterNotes: raw.writing_style.ghostwriter_notes,
    },
  };
}
