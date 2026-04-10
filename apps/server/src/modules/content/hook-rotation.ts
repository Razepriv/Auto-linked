// ---------------------------------------------------------------------------
// Hook Type Rotation — Least-recently-used selection with compatibility
// ---------------------------------------------------------------------------
//
// Selects the next hook type based on:
//   1. Compatibility matrix: not every hook fits every angle.
//   2. Least-recently-used scoring among compatible hooks.
//   3. 20% randomness to avoid being perfectly predictable.
// ---------------------------------------------------------------------------

import type { AngleType, HookType } from './types.js';
import { HOOK_TYPES } from './types.js';

// ---------------------------------------------------------------------------
// Compatibility matrix — true means the hook works well with that angle.
// Hooks not listed for an angle are still usable but get a 0.3x penalty.
// ---------------------------------------------------------------------------

const COMPATIBILITY: Record<AngleType, readonly HookType[]> = {
  how_to: ['question', 'list_preview', 'direct_address', 'bold_claim', 'statistic'],
  opinion: ['bold_claim', 'contrarian', 'confession', 'direct_address', 'question'],
  story: ['story_opener', 'confession', 'metaphor', 'question'],
  listicle: ['list_preview', 'statistic', 'bold_claim', 'question'],
  case_study: ['story_opener', 'statistic', 'bold_claim', 'question'],
  contrarian: ['contrarian', 'bold_claim', 'confession', 'question', 'direct_address'],
  behind_the_scenes: ['story_opener', 'confession', 'direct_address', 'metaphor'],
  lesson_learned: ['story_opener', 'confession', 'bold_claim', 'question', 'list_preview'],
  prediction: ['bold_claim', 'contrarian', 'statistic', 'question', 'metaphor'],
  comparison: ['question', 'bold_claim', 'metaphor', 'list_preview', 'statistic'],
  myth_busting: ['contrarian', 'bold_claim', 'question', 'statistic', 'direct_address'],
  framework: ['list_preview', 'bold_claim', 'question', 'direct_address', 'metaphor'],
};

interface RecentHookRecord {
  readonly type: HookType;
  readonly usedAt: string; // ISO-8601
}

interface ScoredHook {
  readonly type: HookType;
  readonly score: number;
}

/**
 * Select the best hook type for a given angle, avoiding recently used hooks.
 *
 * @param angle        - The content angle for the upcoming post.
 * @param recentHooks  - Recently used hook types with timestamps.
 * @returns The selected hook type.
 */
export function selectHookType(
  angle: AngleType,
  recentHooks: readonly RecentHookRecord[],
): HookType {
  const now = Date.now();
  const compatibleSet = new Set(COMPATIBILITY[angle] ?? []);

  const scored: ScoredHook[] = HOOK_TYPES.map((type) => {
    // --- Compatibility multiplier ---
    const compatMultiplier = compatibleSet.has(type) ? 1.0 : 0.3;

    // --- LRU score: hours since last use, capped at 1 week ---
    const lastUsed = recentHooks.find((r) => r.type === type);
    const hoursSince = lastUsed
      ? (now - new Date(lastUsed.usedAt).getTime()) / 3_600_000
      : 999;
    // Normalize to 0-1 range (168h = 1 week)
    const lruScore = Math.min(1.0, hoursSince / 168);

    // --- 20% randomness ---
    const randomFactor = 0.8 + Math.random() * 0.4; // range [0.8, 1.2]

    const score = compatMultiplier * lruScore * randomFactor;
    return { type, score };
  });

  // Sort by score descending and pick from top 3 via weighted random.
  scored.sort((a, b) => b.score - a.score);
  const top3 = scored.slice(0, 3);

  return weightedRandomPick(top3);
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function weightedRandomPick(candidates: readonly ScoredHook[]): HookType {
  const totalScore = candidates.reduce((sum, c) => sum + c.score, 0);
  if (totalScore <= 0) return candidates[0]!.type;

  let random = Math.random() * totalScore;
  for (const { type, score } of candidates) {
    random -= score;
    if (random <= 0) return type;
  }
  return candidates[candidates.length - 1]!.type;
}
