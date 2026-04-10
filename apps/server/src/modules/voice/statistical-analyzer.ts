// ---------------------------------------------------------------------------
// Voice Analysis Engine – Statistical Analyzer
// ---------------------------------------------------------------------------
// Pure, deterministic metric extraction with zero external API calls.
// Runs in-process and produces results instantly.
// ---------------------------------------------------------------------------

import type {
  CleanedPost,
  StatisticalAnalysis,
  WordCountStats,
  EmojiStats,
  HashtagStats,
  FormattingStats,
  HookStats,
  EmojiFrequency,
  HashtagStyle,
  FormattingStyle,
  LineBreakStyle,
} from './types.js';

// ---- Regex patterns --------------------------------------------------------

const SENTENCE_SPLIT_RE = /[.!?]+(?:\s|$)/;
const BULLET_RE = /^[\s]*[-*\u2022]\s/m;
const NUMBERED_LIST_RE = /^[\s]*\d+[.)]\s/m;
const UNICODE_BOLD_RE = /[\u{1D400}-\u{1D7FF}]/u;
const ALL_CAPS_WORD_RE = /\b[A-Z]{2,}\b/g;
const EMOJI_RE = /\p{Emoji_Presentation}|\p{Emoji}\uFE0F/gu;
const HASHTAG_RE = /#[\w\u00C0-\u017F]+/g;

// ---- Public API ------------------------------------------------------------

/**
 * Compute a full statistical analysis across a set of cleaned posts.
 *
 * All calculations are deterministic — no external calls.
 */
export function analyzeStatistically(
  posts: readonly CleanedPost[],
): StatisticalAnalysis {
  if (posts.length === 0) {
    return emptyAnalysis();
  }

  const wordCounts = posts.map((p) => p.wordCount);
  const lineCounts = posts.map((p) => p.lineCount);
  const paragraphCounts = posts.map((p) => countParagraphs(p.cleanedText));
  const sentenceLengths = posts.flatMap((p) =>
    computeSentenceLengths(p.cleanedText),
  );

  return {
    wordCount: computeWordCountStats(wordCounts),
    lineCountAvg: mean(lineCounts),
    paragraphCountAvg: mean(paragraphCounts),
    avgSentenceLength:
      sentenceLengths.length > 0 ? mean(sentenceLengths) : 0,
    emoji: computeEmojiStats(posts),
    hashtags: computeHashtagStats(posts),
    formatting: computeFormattingStats(posts),
    hooks: computeHookStats(posts),
    postsAnalyzed: posts.length,
  };
}

// ---- Word count stats ------------------------------------------------------

function computeWordCountStats(counts: readonly number[]): WordCountStats {
  const sorted = [...counts].sort((a, b) => a - b);
  const avg = mean(counts);
  const med = median(sorted);

  return {
    mean: round2(avg),
    median: round2(med),
    min: sorted[0] ?? 0,
    max: sorted[sorted.length - 1] ?? 0,
    stddev: round2(stddev(counts, avg)),
  };
}

// ---- Emoji stats -----------------------------------------------------------

function computeEmojiStats(posts: readonly CleanedPost[]): EmojiStats {
  const emojiCounts = new Map<string, number>();
  const positionCounts: Record<'start' | 'middle' | 'end', number> = {
    start: 0,
    middle: 0,
    end: 0,
  };
  let totalEmojis = 0;

  for (const post of posts) {
    for (const occ of post.emojis) {
      totalEmojis++;
      emojiCounts.set(occ.emoji, (emojiCounts.get(occ.emoji) ?? 0) + 1);
      positionCounts[occ.position]++;
    }
  }

  const avgPerPost = posts.length > 0 ? totalEmojis / posts.length : 0;

  const frequency: EmojiFrequency =
    avgPerPost === 0
      ? 'none'
      : avgPerPost < 1
        ? 'minimal'
        : avgPerPost < 3
          ? 'moderate'
          : 'heavy';

  const topEmojis = [...emojiCounts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10)
    .map(([emoji, count]) => ({ emoji, count }));

  const totalPositioned = Math.max(totalEmojis, 1);
  const positionDistribution: Record<'start' | 'middle' | 'end', number> = {
    start: round2(positionCounts.start / totalPositioned),
    middle: round2(positionCounts.middle / totalPositioned),
    end: round2(positionCounts.end / totalPositioned),
  };

  return {
    frequency,
    topEmojis,
    avgPerPost: round2(avgPerPost),
    positionDistribution,
  };
}

// ---- Hashtag stats ---------------------------------------------------------

function computeHashtagStats(posts: readonly CleanedPost[]): HashtagStats {
  const tagCounts = new Map<string, number>();
  let totalTags = 0;
  let endPositionTags = 0;
  let totalTagOccurrences = 0;

  for (const post of posts) {
    const tags = post.hashtags;
    totalTags += tags.length;

    for (const tag of tags) {
      tagCounts.set(tag, (tagCounts.get(tag) ?? 0) + 1);
    }

    // Check if hashtags appear mostly at the end of the post
    const text = post.cleanedText;
    const matches = [...text.matchAll(HASHTAG_RE)];
    for (const match of matches) {
      totalTagOccurrences++;
      const idx = match.index ?? 0;
      if (idx > text.length * 0.8) {
        endPositionTags++;
      }
    }
  }

  const avgPerPost = posts.length > 0 ? totalTags / posts.length : 0;

  const style: HashtagStyle =
    avgPerPost === 0
      ? 'none'
      : avgPerPost <= 2
        ? 'minimal'
        : avgPerPost <= 5
          ? 'moderate'
          : 'heavy';

  const topHashtags = [...tagCounts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 15)
    .map(([tag, count]) => ({ tag, count }));

  const position: 'end' | 'inline' =
    totalTagOccurrences > 0 && endPositionTags / totalTagOccurrences > 0.8
      ? 'end'
      : 'inline';

  return {
    style,
    topHashtags,
    avgPerPost: round2(avgPerPost),
    position,
  };
}

// ---- Formatting stats ------------------------------------------------------

function computeFormattingStats(
  posts: readonly CleanedPost[],
): FormattingStats {
  let totalWhitespaceRatio = 0;
  let bulletPosts = 0;
  let numberedListPosts = 0;
  let totalAllCapsWords = 0;
  let totalWords = 0;
  let totalLines = 0;
  let doubleBreaks = 0;
  let singleBreaks = 0;

  for (const post of posts) {
    const text = post.cleanedText;

    // Whitespace ratio
    const whitespace = (text.match(/\s/g) || []).length;
    totalWhitespaceRatio += text.length > 0 ? whitespace / text.length : 0;

    // Bullet/numbered list detection
    if (BULLET_RE.test(text)) bulletPosts++;
    if (NUMBERED_LIST_RE.test(text)) numberedListPosts++;

    // All-caps frequency
    const capsMatches = text.match(ALL_CAPS_WORD_RE) || [];
    totalAllCapsWords += capsMatches.length;
    totalWords += post.wordCount;

    // Line break analysis
    totalLines += post.lineCount;
    const breaks = text.split('\n');
    for (let i = 1; i < breaks.length; i++) {
      if (breaks[i]!.trim() === '' || breaks[i - 1]!.trim() === '') {
        doubleBreaks++;
      } else {
        singleBreaks++;
      }
    }
  }

  const n = Math.max(posts.length, 1);
  const avgLinesPerPost = totalLines / n;
  const avgWordCount = totalWords / n;
  const bulletRatio = bulletPosts / n;
  const numberedRatio = numberedListPosts / n;
  const listRatio = (bulletPosts + numberedListPosts) / n;

  // Density classification
  let density: FormattingStyle;
  if (listRatio > 0.4) {
    density = 'scannable';
  } else if (avgLinesPerPost < avgWordCount / 15) {
    density = 'dense';
  } else if (avgLinesPerPost > avgWordCount / 5) {
    density = 'one_liner';
  } else {
    density = 'scannable';
  }

  // Line break style
  const totalBreakEvents = Math.max(doubleBreaks + singleBreaks, 1);
  let lineBreakStyle: LineBreakStyle;
  if (totalBreakEvents <= 1) {
    lineBreakStyle = 'none';
  } else if (doubleBreaks / totalBreakEvents > 0.6) {
    lineBreakStyle = 'paragraph';
  } else if (avgLinesPerPost > avgWordCount / 8) {
    lineBreakStyle = 'every_sentence';
  } else {
    lineBreakStyle = 'every_few';
  }

  return {
    density,
    whitespaceRatio: round2(totalWhitespaceRatio / n),
    bulletUsageRatio: round2(bulletRatio),
    allCapsFrequency: totalWords > 0 ? round2(totalAllCapsWords / totalWords) : 0,
    lineBreakStyle,
    avgLinesPerPost: round2(avgLinesPerPost),
    usesLists: bulletRatio > 0.15 || numberedRatio > 0.15,
  };
}

// ---- Hook stats ------------------------------------------------------------

function computeHookStats(posts: readonly CleanedPost[]): HookStats {
  const firstLineWordCounts: number[] = [];
  let questionHooks = 0;

  for (const post of posts) {
    const lines = post.cleanedText.split('\n').filter((l) => l.trim().length > 0);
    const firstLine = lines[0] ?? '';
    const words = firstLine.trim().split(/\s+/).filter((w) => w.length > 0);
    firstLineWordCounts.push(words.length);

    // Check if the first line ends with a question mark
    if (firstLine.trim().endsWith('?')) {
      questionHooks++;
    }
  }

  return {
    avgFirstLineWords: round2(
      firstLineWordCounts.length > 0 ? mean(firstLineWordCounts) : 0,
    ),
    questionFrequency:
      posts.length > 0 ? round2(questionHooks / posts.length) : 0,
  };
}

// ---- Paragraph / sentence helpers ------------------------------------------

function countParagraphs(text: string): number {
  const paragraphs = text.split(/\n\s*\n/).filter((p) => p.trim().length > 0);
  return Math.max(paragraphs.length, 1);
}

function computeSentenceLengths(text: string): number[] {
  // Remove URLs and hashtags for cleaner sentence splitting
  const cleaned = text
    .replace(/https?:\/\/\S+/g, '')
    .replace(HASHTAG_RE, '')
    .replace(EMOJI_RE, '');

  const sentences = cleaned
    .split(SENTENCE_SPLIT_RE)
    .map((s) => s.trim())
    .filter((s) => s.length > 0);

  return sentences.map(
    (s) => s.split(/\s+/).filter((w) => w.length > 0).length,
  );
}

// ---- Empty analysis --------------------------------------------------------

function emptyAnalysis(): StatisticalAnalysis {
  return {
    wordCount: { mean: 0, median: 0, min: 0, max: 0, stddev: 0 },
    lineCountAvg: 0,
    paragraphCountAvg: 0,
    avgSentenceLength: 0,
    emoji: {
      frequency: 'none',
      topEmojis: [],
      avgPerPost: 0,
      positionDistribution: { start: 0, middle: 0, end: 0 },
    },
    hashtags: {
      style: 'none',
      topHashtags: [],
      avgPerPost: 0,
      position: 'end',
    },
    formatting: {
      density: 'scannable',
      whitespaceRatio: 0,
      bulletUsageRatio: 0,
      allCapsFrequency: 0,
      lineBreakStyle: 'none',
      avgLinesPerPost: 0,
      usesLists: false,
    },
    hooks: { avgFirstLineWords: 0, questionFrequency: 0 },
    postsAnalyzed: 0,
  };
}

// ---- Math helpers ----------------------------------------------------------

function mean(values: readonly number[]): number {
  if (values.length === 0) return 0;
  return values.reduce((s, v) => s + v, 0) / values.length;
}

function median(sorted: readonly number[]): number {
  if (sorted.length === 0) return 0;
  const mid = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 0) {
    return ((sorted[mid - 1] ?? 0) + (sorted[mid] ?? 0)) / 2;
  }
  return sorted[mid] ?? 0;
}

function stddev(values: readonly number[], avg: number): number {
  if (values.length <= 1) return 0;
  const variance =
    values.reduce((s, v) => s + (v - avg) ** 2, 0) / values.length;
  return Math.sqrt(variance);
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}
