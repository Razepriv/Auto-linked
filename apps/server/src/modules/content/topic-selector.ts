// ---------------------------------------------------------------------------
// Topic Selector — Generates and scores topic candidates
// ---------------------------------------------------------------------------
//
// Uses Claude to brainstorm 10 candidate topics, then scores each on:
//   - Pillar relevance (35%)
//   - Format fit (20%)
//   - Trending boost (15%)
//   - Performance prediction (20%)
//   - Repetition penalty (10%)
// ---------------------------------------------------------------------------

import { chatCompletionSimple } from '../../lib/llm-client.js';
import { logger } from '../../lib/logger.js';
import type { CalendarSlot, TopicCandidate, TopicContext } from './types.js';

// ---------------------------------------------------------------------------
// Main entry point
// ---------------------------------------------------------------------------

/**
 * Select the best topic for a calendar slot.
 *
 * Generates 10 candidate topics via Claude, scores them, and returns the best.
 *
 * @param slot    - The calendar slot to fill.
 * @param context - Pillar, format, and historical context.
 * @returns The best topic as a string.
 */
export async function selectTopic(
  slot: CalendarSlot,
  context: TopicContext,
): Promise<string> {
  const log = logger.child({ module: 'topic-selector', userId: context.userName });

  // Step 1: Generate 10 candidate topics via Claude.
  const candidates = await generateCandidateTopics(slot, context);
  log.info({ candidateCount: candidates.length }, 'Generated topic candidates');

  if (candidates.length === 0) {
    // Fallback: use an example topic from the pillar.
    if (context.pillar.exampleTopics.length > 0) {
      const fallback = context.pillar.exampleTopics[
        Math.floor(Math.random() * context.pillar.exampleTopics.length)
      ]!;
      log.warn('No candidates generated, falling back to example topic');
      return fallback;
    }
    return `Insights about ${context.pillar.name}`;
  }

  // Step 2: Score each candidate.
  const scored = candidates.map((topic) => scoreTopic(topic, slot, context));

  // Step 3: Sort by score descending and return the best.
  scored.sort((a, b) => b.finalScore - a.finalScore);

  const best = scored[0]!;
  log.info(
    { topic: best.topic, score: best.finalScore.toFixed(3) },
    'Selected best topic',
  );

  return best.topic;
}

// ---------------------------------------------------------------------------
// Candidate generation via Claude
// ---------------------------------------------------------------------------

async function generateCandidateTopics(
  slot: CalendarSlot,
  context: TopicContext,
): Promise<readonly string[]> {
  const trendingSection = context.trendingTopics.length > 0
    ? `\nCurrently trending in ${context.userIndustry}:\n${context.trendingTopics.map((t) => `- ${t.title}: ${t.summary}`).join('\n')}`
    : '';

  const recentSection = context.recentTopics.length > 0
    ? `\nRecent topics already covered (AVOID these):\n${context.recentTopics.map((t) => `- ${t}`).join('\n')}`
    : '';

  const prompt = [
    `Generate exactly 10 unique LinkedIn post topic ideas for ${context.userName}, a professional in ${context.userIndustry}.`,
    '',
    `Content pillar: ${context.pillar.name} — ${context.pillar.description}`,
    `Post format: ${slot.format}`,
    `Content angle: ${slot.angle}`,
    context.pillar.exampleTopics.length > 0
      ? `Example topics for inspiration: ${context.pillar.exampleTopics.join(', ')}`
      : '',
    trendingSection,
    recentSection,
    '',
    'Requirements:',
    '- Each topic should be specific and actionable, not vague.',
    `- Topics should fit a ${slot.format} format and ${slot.angle} angle.`,
    '- Mix evergreen and timely topics (70/30 split).',
    '- Each topic should be 5-15 words.',
    '',
    'Output as a JSON array of strings, nothing else:',
    '["topic 1", "topic 2", ..., "topic 10"]',
  ]
    .filter(Boolean)
    .join('\n');

  try {
    const responseText = await chatCompletionSimple(prompt, 1024);
    return parseTopicList(responseText);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    logger.error({ err: message }, 'Failed to generate topic candidates');
    return [];
  }
}

function parseTopicList(raw: string): readonly string[] {
  let cleaned = raw.trim();

  // Handle ```json ... ``` wrapping.
  const jsonBlockMatch = cleaned.match(/```(?:json)?\s*\n?([\s\S]*?)\n?\s*```/);
  if (jsonBlockMatch?.[1]) {
    cleaned = jsonBlockMatch[1];
  }

  try {
    const parsed: unknown = JSON.parse(cleaned);
    if (Array.isArray(parsed)) {
      return parsed.filter((item): item is string => typeof item === 'string' && item.length > 0);
    }
  } catch {
    // Try line-by-line fallback.
    return cleaned
      .split('\n')
      .map((line) => line.replace(/^[\d.\-*)\s]+/, '').replace(/^"/, '').replace(/"$/, '').trim())
      .filter((line) => line.length > 5 && line.length < 200);
  }

  return [];
}

// ---------------------------------------------------------------------------
// Topic scoring
// ---------------------------------------------------------------------------

function scoreTopic(
  topic: string,
  slot: CalendarSlot,
  context: TopicContext,
): TopicCandidate {
  const pillarRelevance = computePillarRelevance(topic, context);
  const formatFit = computeFormatFit(topic, slot.format);
  const trendingBoost = computeTrendingBoost(topic, context);
  const performancePrediction = computePerformancePrediction(topic, slot);
  const repetitionPenalty = computeRepetitionPenalty(topic, context.recentTopics);

  // Weighted scoring per the design doc.
  const finalScore =
    pillarRelevance * 0.35 +
    formatFit * 0.20 +
    trendingBoost * 0.15 +
    performancePrediction * 0.20 -
    repetitionPenalty * 0.10;

  return {
    topic,
    pillarRelevance,
    formatFit,
    trendingBoost,
    performancePrediction,
    repetitionPenalty,
    finalScore,
  };
}

/**
 * How well the topic matches the pillar's name, description, and example topics.
 */
function computePillarRelevance(topic: string, context: TopicContext): number {
  const topicWords = tokenize(topic);
  const pillarWords = tokenize(
    `${context.pillar.name} ${context.pillar.description} ${context.pillar.exampleTopics.join(' ')}`,
  );

  return jaccardSimilarity(topicWords, pillarWords);
}

/**
 * How well the topic suits the assigned format.
 * Heuristic: certain keywords suggest better fit for certain formats.
 */
function computeFormatFit(topic: string, format: string): number {
  const topicLower = topic.toLowerCase();

  const formatSignals: Record<string, readonly string[]> = {
    text: ['opinion', 'thought', 'story', 'experience', 'reflection', 'lesson', 'take'],
    image: ['visual', 'infographic', 'chart', 'diagram', 'photo', 'illustration'],
    carousel: ['step', 'guide', 'framework', 'list', 'tips', 'ways', 'stages', 'phases', 'principles'],
    poll: ['question', 'debate', 'prefer', 'better', 'vs', 'choose', 'opinion poll', 'which'],
  };

  const signals = formatSignals[format] ?? [];
  const matchCount = signals.filter((s) => topicLower.includes(s)).length;

  // Base fit of 0.5, boosted by signal matches.
  return Math.min(1.0, 0.5 + matchCount * 0.15);
}

/**
 * Whether the topic overlaps with current trending topics.
 */
function computeTrendingBoost(topic: string, context: TopicContext): number {
  if (context.trendingTopics.length === 0) return 0;

  const topicWords = tokenize(topic);
  let maxOverlap = 0;

  for (const trending of context.trendingTopics) {
    const trendingWords = tokenize(`${trending.title} ${trending.summary}`);
    const overlap = jaccardSimilarity(topicWords, trendingWords);
    if (overlap > maxOverlap) maxOverlap = overlap;
  }

  // Scale: 0.3 Jaccard overlap maps to a full 1.0 boost.
  return Math.min(1.0, maxOverlap / 0.3);
}

/**
 * Rough performance prediction based on topic+format patterns.
 * Without historical data, we use a baseline with slight variation.
 */
function computePerformancePrediction(_topic: string, slot: CalendarSlot): number {
  // Baseline by format (based on LinkedIn engagement averages).
  const formatBaseline: Record<string, number> = {
    text: 0.6,
    image: 0.65,
    carousel: 0.75,
    poll: 0.7,
  };

  const base = formatBaseline[slot.format] ?? 0.6;
  // Add small randomness to differentiate candidates.
  return Math.min(1.0, base + (Math.random() * 0.2 - 0.1));
}

/**
 * Penalize topics similar to recently covered ones.
 * Similarity > 0.7 with recent 14 days = near-eliminate.
 */
function computeRepetitionPenalty(
  topic: string,
  recentTopics: readonly string[],
): number {
  if (recentTopics.length === 0) return 0;

  const topicWords = tokenize(topic);
  let maxSimilarity = 0;

  for (const recent of recentTopics) {
    const recentWords = tokenize(recent);
    const similarity = jaccardSimilarity(topicWords, recentWords);
    if (similarity > maxSimilarity) maxSimilarity = similarity;
  }

  // > 0.7 = near-eliminate (penalty close to 1.0)
  if (maxSimilarity > 0.7) return 0.95;
  // Scale linearly: 0.0 at 0 similarity, up to 0.5 at 0.5 similarity.
  return maxSimilarity;
}

// ---------------------------------------------------------------------------
// Utility: tokenization and Jaccard
// ---------------------------------------------------------------------------

function tokenize(text: string): Set<string> {
  return new Set(
    text
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, '')
      .split(/\s+/)
      .filter((w) => w.length > 2),
  );
}

function jaccardSimilarity(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 && b.size === 0) return 0;

  let intersection = 0;
  for (const word of a) {
    if (b.has(word)) intersection++;
  }

  const union = a.size + b.size - intersection;
  return union === 0 ? 0 : intersection / union;
}
