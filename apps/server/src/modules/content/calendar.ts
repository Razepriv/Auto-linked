// ---------------------------------------------------------------------------
// Content Calendar — Weekly template generation
// ---------------------------------------------------------------------------
//
// Generates a weekly calendar of content slots based on:
//   - User's posting frequency (1-7 posts/week)
//   - Format rotation with weekly limits
//   - Angle rotation for variety
//   - Pillar distribution matching target weights
// ---------------------------------------------------------------------------

import { randomUUID } from 'node:crypto';
import type { PostFormat } from '@auto-linked/shared';
import type { AngleType, CalendarSlot, PillarSnapshot } from './types.js';
import { ANGLE_TYPES } from './types.js';

// ---------------------------------------------------------------------------
// Format limits per week
// ---------------------------------------------------------------------------

const FORMAT_WEEKLY_LIMITS: Record<PostFormat, number> = {
  text: Infinity,
  image: 3,
  carousel: 2,
  poll: 1,
};

// ---------------------------------------------------------------------------
// Day selection heuristics by frequency
// ---------------------------------------------------------------------------

type DayOfWeek = 0 | 1 | 2 | 3 | 4 | 5 | 6;

const DAY_SELECTIONS: Record<number, readonly DayOfWeek[]> = {
  1: [2],                     // Tuesday only
  2: [2, 4],                  // Tue, Thu
  3: [2, 3, 4],               // Tue, Wed, Thu
  4: [1, 2, 3, 4],            // Mon-Thu
  5: [1, 2, 3, 4, 5],         // Mon-Fri
  6: [1, 2, 3, 4, 5, 6],      // Mon-Sat
  7: [0, 1, 2, 3, 4, 5, 6],   // Every day
};

// ---------------------------------------------------------------------------
// Default posting times by day (UTC, optimized for LinkedIn engagement)
// ---------------------------------------------------------------------------

const DEFAULT_TIMES: Record<DayOfWeek, string> = {
  0: '10:00',
  1: '09:00',
  2: '08:30',
  3: '10:00',
  4: '09:00',
  5: '08:00',
  6: '10:00',
};

// ---------------------------------------------------------------------------
// Main entry point
// ---------------------------------------------------------------------------

/**
 * Generate a weekly content calendar template.
 *
 * @param userId    - The user's ID.
 * @param pillars   - The user's active content pillars.
 * @param frequency - Number of posts per week (1-7).
 * @returns An array of CalendarSlot objects for the week.
 */
export function generateWeeklyTemplate(
  userId: string,
  pillars: readonly PillarSnapshot[],
  frequency: number,
): readonly CalendarSlot[] {
  const clampedFreq = Math.max(1, Math.min(7, Math.round(frequency)));
  const days = DAY_SELECTIONS[clampedFreq] ?? DAY_SELECTIONS[3]!;

  // Assign formats respecting weekly limits.
  const formats = assignFormats(clampedFreq);

  // Assign pillars based on their weights.
  const assignedPillars = assignPillars(pillars, clampedFreq);

  // Assign angles with rotation for variety.
  const angles = assignAngles(clampedFreq);

  const slots: CalendarSlot[] = [];

  for (let i = 0; i < clampedFreq; i++) {
    const dayOfWeek = days[i % days.length]!;
    const pillar = assignedPillars[i] ?? null;

    slots.push({
      id: randomUUID(),
      userId,
      dayOfWeek,
      pillarId: pillar?.id ?? null,
      format: formats[i]!,
      angle: angles[i]!,
      scheduledTime: DEFAULT_TIMES[dayOfWeek],
      isActive: true,
    });
  }

  return slots;
}

// ---------------------------------------------------------------------------
// Format assignment
// ---------------------------------------------------------------------------

function assignFormats(count: number): readonly PostFormat[] {
  const formats: PostFormat[] = [];
  const remaining: Record<PostFormat, number> = { ...FORMAT_WEEKLY_LIMITS };

  // Desired distribution: mostly text, mix in others.
  // For 5 posts: text, image, carousel, text, poll
  const desiredOrder: PostFormat[] = [
    'text', 'image', 'carousel', 'text', 'poll', 'text', 'image',
  ];

  for (let i = 0; i < count; i++) {
    const desired = desiredOrder[i % desiredOrder.length]!;

    if (remaining[desired] > 0) {
      formats.push(desired);
      remaining[desired]--;
    } else {
      // Fall back to text (unlimited).
      formats.push('text');
    }
  }

  return formats;
}

// ---------------------------------------------------------------------------
// Pillar assignment based on weights
// ---------------------------------------------------------------------------

function assignPillars(
  pillars: readonly PillarSnapshot[],
  count: number,
): readonly (PillarSnapshot | null)[] {
  if (pillars.length === 0) {
    return Array.from({ length: count }, () => null);
  }

  // Compute how many slots each pillar should get based on weight.
  const totalWeight = pillars.reduce((sum, p) => sum + p.weight, 0);
  if (totalWeight <= 0) {
    // Equal distribution if no weights.
    return Array.from({ length: count }, (_, i) => pillars[i % pillars.length]!);
  }

  // Use largest-remainder method for proportional allocation.
  const quotas = pillars.map((p) => ({
    pillar: p,
    exact: (p.weight / totalWeight) * count,
    floor: 0,
    remainder: 0,
  }));

  for (const q of quotas) {
    q.floor = Math.floor(q.exact);
    q.remainder = q.exact - q.floor;
  }

  let assigned = quotas.reduce((sum, q) => sum + q.floor, 0);
  // Sort by remainder descending to allocate leftover slots.
  const byRemainder = [...quotas].sort((a, b) => b.remainder - a.remainder);

  for (const q of byRemainder) {
    if (assigned >= count) break;
    q.floor++;
    assigned++;
  }

  // Build the assignment array, interleaving pillars for variety.
  const result: PillarSnapshot[] = [];
  const pillarQueues = quotas.map((q) => ({
    pillar: q.pillar,
    remaining: q.floor,
  }));

  for (let i = 0; i < count; i++) {
    // Pick the pillar with the most remaining slots that wasn't just used.
    const lastPillarId = result.length > 0 ? result[result.length - 1]!.id : null;
    pillarQueues.sort((a, b) => b.remaining - a.remaining);

    let picked = false;
    for (const pq of pillarQueues) {
      if (pq.remaining > 0 && pq.pillar.id !== lastPillarId) {
        result.push(pq.pillar);
        pq.remaining--;
        picked = true;
        break;
      }
    }

    // If we couldn't avoid consecutive, just pick the one with most remaining.
    if (!picked) {
      for (const pq of pillarQueues) {
        if (pq.remaining > 0) {
          result.push(pq.pillar);
          pq.remaining--;
          break;
        }
      }
    }
  }

  return result;
}

// ---------------------------------------------------------------------------
// Angle rotation
// ---------------------------------------------------------------------------

function assignAngles(count: number): readonly AngleType[] {
  const angles: AngleType[] = [];
  // Shuffle angle types and cycle through them for variety.
  const shuffled = shuffleArray([...ANGLE_TYPES]);

  for (let i = 0; i < count; i++) {
    angles.push(shuffled[i % shuffled.length]!);
  }

  return angles;
}

function shuffleArray<T>(arr: T[]): T[] {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    const temp = arr[i]!;
    arr[i] = arr[j]!;
    arr[j] = temp;
  }
  return arr;
}
