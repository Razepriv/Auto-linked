// ---------------------------------------------------------------------------
// Post Generator — Calls Claude API and parses structured output
// ---------------------------------------------------------------------------

import { chatCompletion } from '../../lib/llm-client.js';
import { logger } from '../../lib/logger.js';
import type { GeneratedPost, GenerationContext, MediaRecommendation } from './types.js';
import { buildSystemPrompt, buildUserPrompt } from './prompts.js';

// ---------------------------------------------------------------------------
// Raw response shape from Claude
// ---------------------------------------------------------------------------

interface RawLLMResponse {
  readonly post_text: string;
  readonly hashtags: string[];
  readonly media_recommendation: {
    readonly type: string;
    readonly description: string;
    readonly alt_text: string;
    readonly slides?: Array<{ title: string; bullets: string[] }>;
    readonly question?: string;
    readonly options?: string[];
  };
  readonly strategy_explanation: string;
}

// ---------------------------------------------------------------------------
// Main entry point
// ---------------------------------------------------------------------------

/**
 * Generate a single LinkedIn post by calling Claude Sonnet.
 *
 * @param context - All assembled generation context.
 * @returns A structured GeneratedPost ready for quality checking.
 */
export async function generatePost(context: GenerationContext): Promise<GeneratedPost> {
  const log = logger.child({ module: 'generator', userId: context.userName });

  const systemPrompt = buildSystemPrompt(context.voiceProfile, context.userName);
  const userPrompt = buildUserPrompt({
    pillar: context.pillar,
    format: context.format,
    hookType: context.hookType,
    angle: context.angle,
    topic: context.topic,
    trendingTopics: context.trendingTopics,
    topPosts: context.topPosts,
    negativeExamples: context.negativeExamples,
    recentPosts: context.recentPosts,
    userName: context.userName,
    userRole: context.userRole,
    userIndustry: context.userIndustry,
  });

  log.info({ format: context.format, hookType: context.hookType }, 'Calling LLM for post generation');

  const rawText = (await chatCompletion(systemPrompt, userPrompt, 2048)).trim();
  log.debug({ responseLength: rawText.length }, 'Received LLM response');

  // Parse the JSON response.
  const parsed = parseRawResponse(rawText);

  // Apply constraints.
  const constrained = applyConstraints(parsed, context);

  return constrained;
}

// ---------------------------------------------------------------------------
// Response parsing
// ---------------------------------------------------------------------------

function parseRawResponse(raw: string): RawLLMResponse {
  // Claude sometimes wraps JSON in ```json ... ``` blocks.
  let cleaned = raw;
  const jsonBlockMatch = raw.match(/```(?:json)?\s*\n?([\s\S]*?)\n?\s*```/);
  if (jsonBlockMatch?.[1]) {
    cleaned = jsonBlockMatch[1];
  }

  try {
    const parsed: unknown = JSON.parse(cleaned);
    return validateRawResponse(parsed);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown parse error';
    throw new Error(`Failed to parse LLM JSON response: ${message}\nRaw: ${raw.slice(0, 500)}`);
  }
}

function validateRawResponse(data: unknown): RawLLMResponse {
  if (typeof data !== 'object' || data === null) {
    throw new Error('Expected JSON object from LLM');
  }

  const obj = data as Record<string, unknown>;

  const postText = typeof obj['post_text'] === 'string' ? obj['post_text'] : '';
  const hashtags = Array.isArray(obj['hashtags'])
    ? (obj['hashtags'] as unknown[]).filter((h): h is string => typeof h === 'string')
    : [];
  const strategyExplanation =
    typeof obj['strategy_explanation'] === 'string' ? obj['strategy_explanation'] : '';

  // Parse media recommendation with defaults.
  const rawMedia =
    typeof obj['media_recommendation'] === 'object' && obj['media_recommendation'] !== null
      ? (obj['media_recommendation'] as Record<string, unknown>)
      : {};

  const mediaRecommendation = {
    type: typeof rawMedia['type'] === 'string' ? rawMedia['type'] : 'none',
    description: typeof rawMedia['description'] === 'string' ? rawMedia['description'] : '',
    alt_text: typeof rawMedia['alt_text'] === 'string' ? rawMedia['alt_text'] : '',
    slides: Array.isArray(rawMedia['slides']) ? (rawMedia['slides'] as Array<{ title: string; bullets: string[] }>) : undefined,
    question: typeof rawMedia['question'] === 'string' ? rawMedia['question'] : undefined,
    options: Array.isArray(rawMedia['options']) ? (rawMedia['options'] as string[]) : undefined,
  };

  return { post_text: postText, hashtags, media_recommendation: mediaRecommendation, strategy_explanation: strategyExplanation };
}

// ---------------------------------------------------------------------------
// Constraint enforcement
// ---------------------------------------------------------------------------

function applyConstraints(raw: RawLLMResponse, context: GenerationContext): GeneratedPost {
  let content = raw.post_text;

  // --- Remove any markdown that slipped through ---
  content = stripMarkdown(content);

  // --- Enforce 3000 char max (LinkedIn limit) ---
  if (content.length > 3000) {
    content = content.slice(0, 2997) + '...';
  }

  // --- Extract hook (first line, up to first \n\n or first 150 chars) ---
  const hookEnd = Math.min(
    content.indexOf('\n\n') >= 0 ? content.indexOf('\n\n') : content.length,
    content.indexOf('\n') >= 0 ? content.indexOf('\n') : content.length,
    150,
  );
  const hook = content.slice(0, hookEnd).trim();

  // --- Length check: 70-130% of voice profile avg ---
  const targetLength = context.voiceProfile.avgPostLength;
  const minLength = Math.floor(targetLength * 0.7);
  const maxLength = Math.ceil(targetLength * 1.3);

  if (content.length < minLength || content.length > maxLength) {
    logger.warn(
      { actual: content.length, min: minLength, max: maxLength },
      'Post length outside voice profile range — will be flagged in quality check',
    );
  }

  // --- Hashtags: cap at 5, sanitize ---
  const hashtags = raw.hashtags
    .map((tag) => (tag.startsWith('#') ? tag : `#${tag}`))
    .slice(0, 5);

  // --- Build media recommendation ---
  const mediaRecommendation: MediaRecommendation = {
    type: normalizeMediaType(raw.media_recommendation.type),
    description: raw.media_recommendation.description,
    altText: raw.media_recommendation.alt_text,
    slides: raw.media_recommendation.slides?.map((s) => ({
      title: s.title,
      bullets: s.bullets,
    })),
    pollQuestion: raw.media_recommendation.question,
    pollOptions: raw.media_recommendation.options,
  };

  return {
    content,
    hook,
    hashtags,
    mediaRecommendation,
    strategyNote: raw.strategy_explanation,
  };
}

function normalizeMediaType(type: string): 'none' | 'image' | 'carousel' | 'poll' {
  const normalized = type.toLowerCase().trim();
  if (normalized === 'image') return 'image';
  if (normalized === 'carousel') return 'carousel';
  if (normalized === 'poll') return 'poll';
  return 'none';
}

function stripMarkdown(text: string): string {
  // Remove bold markdown ** ... **
  let cleaned = text.replace(/\*\*(.*?)\*\*/g, '$1');
  // Remove italic markdown * ... *
  cleaned = cleaned.replace(/(?<!\*)\*(?!\*)(.*?)(?<!\*)\*(?!\*)/g, '$1');
  // Remove heading markers
  cleaned = cleaned.replace(/^#{1,6}\s+/gm, '');
  // Remove inline code backticks
  cleaned = cleaned.replace(/`([^`]+)`/g, '$1');
  // Remove link markdown [text](url) -> text
  cleaned = cleaned.replace(/\[([^\]]+)\]\([^)]+\)/g, '$1');
  return cleaned;
}
