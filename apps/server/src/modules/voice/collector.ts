// ---------------------------------------------------------------------------
// Voice Analysis Engine – Collector
// ---------------------------------------------------------------------------
// Collects writing samples from various input sources and normalises them
// into RawPost objects for downstream processing.
// ---------------------------------------------------------------------------

import type {
  RawPost,
  QuestionnaireAnswers,
  VoiceProfile,
  InputSource,
} from './types.js';

const MAX_POSTS = 100;
const PASTE_SEPARATORS = /\n{2,}|^-{3,}$/gm;

// ---- Public API ------------------------------------------------------------

/**
 * Parse pasted LinkedIn posts.
 *
 * Posts are split by double-newline or "---" separator lines. Each resulting
 * block becomes a RawPost with `manual_samples` source.
 */
export function collectFromPaste(text: string): readonly RawPost[] {
  if (!text.trim()) {
    return [];
  }

  const blocks = splitPastedText(text);
  const posts: RawPost[] = blocks
    .map((block): RawPost => ({
      text: block.trim(),
      source: 'manual_samples' as InputSource,
      date: null,
      engagement: null,
      weight: 0.7,
    }))
    .filter((p) => p.text.length > 0);

  return deduplicateAndCap(posts);
}

/**
 * Parse a LinkedIn data-export CSV.
 *
 * Expected columns: Date, Content, Likes, Comments.
 * First row is treated as headers and skipped.
 */
export function collectFromCSV(csvContent: string): readonly RawPost[] {
  if (!csvContent.trim()) {
    return [];
  }

  const lines = csvContent.trim().split('\n');
  if (lines.length < 2) {
    return [];
  }

  // Skip header row
  const dataLines = lines.slice(1);
  const posts: RawPost[] = [];

  for (const line of dataLines) {
    const parsed = parseCSVLine(line);
    if (!parsed) {
      continue;
    }

    const [date, content, likes, comments] = parsed;
    if (!content || content.trim().length === 0) {
      continue;
    }

    const likesNum = Number(likes) || 0;
    const commentsNum = Number(comments) || 0;
    const engagement = normaliseEngagement(likesNum, commentsNum);

    posts.push({
      text: content.trim(),
      source: 'linkedin_posts' as InputSource,
      date: date?.trim() || null,
      engagement,
      weight: 1.0,
    });
  }

  return deduplicateAndCap(sortByDate(posts));
}

/**
 * Generate a seed VoiceProfile from questionnaire answers.
 *
 * Returns a partial profile with low confidence values. This is used when
 * no posts are available.
 */
export function collectFromQuestionnaire(
  answers: QuestionnaireAnswers,
): Partial<VoiceProfile> {
  const LOW_CONFIDENCE = 0.35;

  const tone = answers.preferredTone ?? 'professional';
  const emojiFrequency = answers.emojiPreference ?? 'none';
  const hashtagStyle = answers.hashtagPreference ?? 'none';
  const formattingStyle = answers.formattingPreference ?? 'scannable';

  const targetLength =
    answers.typicalPostLength === 'short'
      ? 80
      : answers.typicalPostLength === 'long'
        ? 250
        : 150;

  return {
    tone: { value: tone, confidence: LOW_CONFIDENCE },
    hookPatterns: (answers.hookPreferences ?? []).map((hp) => ({
      value: hp,
      confidence: LOW_CONFIDENCE,
    })),
    ctaPatterns: [],
    vocabulary: {
      frequentWords: [],
      avoidedWords: [],
      jargonTerms: answers.professionalRole
        ? [answers.professionalRole]
        : [],
      readingLevel: null,
      avgSentenceLength: null,
    },
    emoji: {
      frequency: emojiFrequency,
      preferred: [],
      usedAsBullets: false,
    },
    hashtags: {
      style: hashtagStyle,
      recurring: [],
      placement: 'end',
    },
    formatting: {
      style: formattingStyle,
      lineBreaks: 'every_few',
      usesLists: false,
      avgPostLength: targetLength,
      separatesHook: true,
    },
    postsAnalyzed: 0,
    overallConfidence: LOW_CONFIDENCE,
  };
}

// ---- Helpers ---------------------------------------------------------------

function splitPastedText(text: string): string[] {
  // First try splitting by --- separators
  const bySeparator = text.split(/^-{3,}$/m);
  if (bySeparator.length > 1) {
    return bySeparator.map((b) => b.trim()).filter((b) => b.length > 0);
  }

  // Fall back to double-newline splits
  const byDoubleNewline = text.split(/\n\s*\n/);
  // If splitting produced many tiny blocks, they're probably paragraphs of
  // one post. Only use this split if blocks average > 20 words.
  const avgWords =
    byDoubleNewline.reduce((s, b) => s + b.trim().split(/\s+/).length, 0) /
    Math.max(byDoubleNewline.length, 1);

  if (byDoubleNewline.length > 1 && avgWords > 20) {
    return byDoubleNewline.map((b) => b.trim()).filter((b) => b.length > 0);
  }

  // Treat the entire text as one post
  return [text.trim()];
}

/** Very simple CSV line parser that handles quoted fields. */
function parseCSVLine(line: string): string[] | null {
  const result: string[] = [];
  let current = '';
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const ch = line[i]!;
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') {
        // Escaped quote
        current += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (ch === ',' && !inQuotes) {
      result.push(current);
      current = '';
    } else {
      current += ch;
    }
  }

  result.push(current);
  return result.length >= 2 ? result : null;
}

function normaliseEngagement(likes: number, comments: number): number {
  // Simple normalisation: log-scale the combined score, cap at 1
  const raw = likes + comments * 2; // comments are more valuable
  if (raw <= 0) return 0;
  return Math.min(1, Math.log10(raw + 1) / 3);
}

function sortByDate(posts: RawPost[]): RawPost[] {
  return [...posts].sort((a, b) => {
    if (!a.date && !b.date) return 0;
    if (!a.date) return 1;
    if (!b.date) return -1;
    return new Date(b.date).getTime() - new Date(a.date).getTime();
  });
}

/** Remove exact duplicates (by text) and cap at MAX_POSTS. */
function deduplicateAndCap(posts: readonly RawPost[]): readonly RawPost[] {
  const seen = new Set<string>();
  const unique: RawPost[] = [];

  for (const post of posts) {
    const key = post.text.trim().toLowerCase();
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    unique.push(post);
    if (unique.length >= MAX_POSTS) {
      break;
    }
  }

  return unique;
}
