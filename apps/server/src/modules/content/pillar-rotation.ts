// ---------------------------------------------------------------------------
// Content Pillar Rotation — Weighted selection with recency penalty
// ---------------------------------------------------------------------------
//
// Selects the next content pillar for a user based on:
//   1. Each pillar's target weight (higher weight = more posts)
//   2. Deficit scoring — pillars that are under-represented get boosted
//   3. Recency penalty — a pillar used yesterday gets 0.3x multiplier
//   4. Hard rule: never the same pillar two days in a row
// ---------------------------------------------------------------------------

import type { PillarSnapshot } from './types.js';

/** A simplified recent-post record needed for rotation logic. */
interface RecentPostRecord {
  readonly pillarId: string | null;
  readonly createdAt: string; // ISO-8601
}

interface ScoredPillar {
  readonly pillar: PillarSnapshot;
  readonly score: number;
}

/**
 * Select the next content pillar for generation.
 *
 * @param userId    - The user id (used for logging context only).
 * @param pillars   - All active pillars for this user.
 * @param recentPosts - Recent posts (last 30 days) to compute deficit and recency.
 * @returns The selected pillar.
 * @throws If `pillars` is empty.
 */
export function selectPillar(
  _userId: string,
  pillars: readonly PillarSnapshot[],
  recentPosts: readonly RecentPostRecord[],
): PillarSnapshot {
  if (pillars.length === 0) {
    throw new Error('Cannot select a pillar: no active pillars provided.');
  }

  if (pillars.length === 1) {
    return pillars[0]!;
  }

  const now = Date.now();

  // Determine which pillar was used most recently (yesterday check).
  const lastPillarId = findLastUsedPillarId(recentPosts);

  // Compute actual distribution over recent posts.
  const totalRecentPosts = recentPosts.filter((p) => p.pillarId !== null).length;
  const actualCounts = buildActualCounts(recentPosts, pillars);

  const scored: ScoredPillar[] = pillars.map((pillar) => {
    // --- Deficit score: how far behind is this pillar vs its target? ---
    const targetFraction = pillar.weight;
    const actualFraction =
      totalRecentPosts > 0 ? (actualCounts.get(pillar.id) ?? 0) / totalRecentPosts : 0;
    // deficit > 0 means under-represented, < 0 means over-represented
    const deficit = targetFraction - actualFraction;
    // Convert deficit into a multiplier: 1.0 at equilibrium, up to ~2.0 for very under-used
    const deficitMultiplier = Math.max(0.1, 1.0 + deficit * 3.0);

    // --- Recency penalty ---
    const hoursSinceLastUse = getHoursSinceLastUse(pillar.id, recentPosts, now);
    // Full penalty (0.3x) if used < 24h ago, linear ramp to 1.0 at 72h
    const recencyMultiplier = hoursSinceLastUse < 24
      ? 0.3
      : Math.min(1.0, 0.3 + (hoursSinceLastUse - 24) * (0.7 / 48));

    // --- Hard rule: never same pillar two days in a row ---
    const consecutivePenalty = pillar.id === lastPillarId ? 0 : 1;

    const score = pillar.weight * deficitMultiplier * recencyMultiplier * consecutivePenalty;

    return { pillar, score };
  });

  // If all scores are 0 (e.g. only one pillar and it was used yesterday),
  // fall back to the pillar with the highest base weight that isn't the last used.
  const viableCandidates = scored.filter((s) => s.score > 0);
  const candidates = viableCandidates.length > 0
    ? viableCandidates
    : scored.filter((s) => s.pillar.id !== lastPillarId);

  // If still empty (literally one pillar, used yesterday), allow it anyway.
  const finalCandidates = candidates.length > 0 ? candidates : scored;

  return weightedRandomSelect(finalCandidates);
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function findLastUsedPillarId(recentPosts: readonly RecentPostRecord[]): string | null {
  if (recentPosts.length === 0) return null;

  // Sort descending by creation date and return the first non-null pillar.
  const sorted = [...recentPosts].sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
  );

  for (const post of sorted) {
    if (post.pillarId !== null) return post.pillarId;
  }
  return null;
}

function buildActualCounts(
  recentPosts: readonly RecentPostRecord[],
  pillars: readonly PillarSnapshot[],
): Map<string, number> {
  const counts = new Map<string, number>();
  for (const pillar of pillars) {
    counts.set(pillar.id, 0);
  }
  for (const post of recentPosts) {
    if (post.pillarId !== null && counts.has(post.pillarId)) {
      counts.set(post.pillarId, (counts.get(post.pillarId) ?? 0) + 1);
    }
  }
  return counts;
}

function getHoursSinceLastUse(
  pillarId: string,
  recentPosts: readonly RecentPostRecord[],
  now: number,
): number {
  let latestMs = 0;
  for (const post of recentPosts) {
    if (post.pillarId === pillarId) {
      const ms = new Date(post.createdAt).getTime();
      if (ms > latestMs) latestMs = ms;
    }
  }
  if (latestMs === 0) return 168; // 1 week if never used
  return (now - latestMs) / 3_600_000;
}

function weightedRandomSelect(candidates: readonly ScoredPillar[]): PillarSnapshot {
  const totalScore = candidates.reduce((sum, c) => sum + c.score, 0);
  if (totalScore <= 0) return candidates[0]!.pillar;

  let random = Math.random() * totalScore;
  for (const { pillar, score } of candidates) {
    random -= score;
    if (random <= 0) return pillar;
  }
  return candidates[candidates.length - 1]!.pillar;
}
