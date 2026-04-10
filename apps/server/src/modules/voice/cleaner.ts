// ---------------------------------------------------------------------------
// Voice Analysis Engine – Cleaner
// ---------------------------------------------------------------------------
// Strips HTML, normalises Unicode, removes tracking URLs, extracts hashtags
// and emojis, and detects language for every raw post.
// ---------------------------------------------------------------------------

import type { RawPost, CleanedPost, EmojiOccurrence } from './types.js';

const MIN_WORD_COUNT = 20;

// ---- Regex patterns --------------------------------------------------------

/** Matches HTML tags. */
const HTML_TAG_RE = /<[^>]+>/g;

/** Matches tracking URLs (UTM params, redirect domains, etc). */
const TRACKING_URL_RE =
  /https?:\/\/\S*(?:utm_\w+=|bit\.ly|lnkd\.in|buff\.ly|t\.co)\S*/gi;

/** Matches any URL. */
const URL_RE = /https?:\/\/\S+/gi;

/** Matches LinkedIn artifacts like "See translation", "Edited", etc. */
const LINKEDIN_ARTIFACT_RE =
  /\b(?:See translation|Edited|See more|Show less)\b\.?/gi;

/** Matches hashtags (#foo). */
const HASHTAG_RE = /#[\w\u00C0-\u017F]+/g;

/** Matches emoji presentation characters. */
const EMOJI_RE = /\p{Emoji_Presentation}|\p{Emoji}\uFE0F/gu;

// ---- Public API ------------------------------------------------------------

/**
 * Clean a single raw post: strip HTML, normalise Unicode, extract metadata.
 */
export function cleanPost(raw: RawPost): CleanedPost {
  let text = raw.text;

  // 1. Strip HTML
  text = text.replace(HTML_TAG_RE, ' ');

  // 2. Remove LinkedIn artifacts
  text = text.replace(LINKEDIN_ARTIFACT_RE, '');

  // 3. Remove tracking URLs (preserve non-tracking URLs)
  text = text.replace(TRACKING_URL_RE, '');

  // 4. Normalise Unicode
  text = normaliseUnicode(text);

  // 5. Collapse multiple spaces but preserve intentional line breaks
  text = text
    .split('\n')
    .map((line) => line.replace(/\s{2,}/g, ' ').trim())
    .join('\n');

  // 6. Trim leading/trailing whitespace
  text = text.trim();

  // 7. Extract hashtags
  const hashtags = extractHashtags(text);

  // 8. Extract emojis with positions
  const emojis = extractEmojis(text);

  // 9. Detect language
  const detectedLanguage = detectLanguage(text);

  // 10. Count words and lines
  const wordCount = countWords(text);
  const lineCount = text.split('\n').filter((l) => l.trim().length > 0).length;

  return {
    originalText: raw.text,
    cleanedText: text,
    source: raw.source,
    date: raw.date,
    engagement: raw.engagement,
    weight: raw.weight,
    wordCount,
    lineCount,
    hashtags,
    emojis,
    detectedLanguage,
  };
}

/**
 * Clean a batch of raw posts.
 *
 * Filters out posts that are too short (< 20 words) and near-duplicates
 * (Jaccard similarity > 0.85).
 */
export function cleanBatch(posts: readonly RawPost[]): readonly CleanedPost[] {
  const cleaned = posts.map(cleanPost);

  // Filter too-short posts
  const filtered = cleaned.filter((p) => p.wordCount >= MIN_WORD_COUNT);

  // Remove near-duplicates
  return deduplicateByJaccard(filtered, 0.85);
}

// ---- Internal helpers ------------------------------------------------------

function normaliseUnicode(text: string): string {
  return (
    text
      // NFC normalisation
      .normalize('NFC')
      // Smart quotes to straight quotes
      .replace(/[\u2018\u2019]/g, "'")
      .replace(/[\u201C\u201D]/g, '"')
      // Em/en dashes to standard dashes
      .replace(/[\u2013\u2014]/g, '-')
      // Ellipsis character to three dots
      .replace(/\u2026/g, '...')
      // Non-breaking spaces to regular spaces
      .replace(/\u00A0/g, ' ')
  );
}

function extractHashtags(text: string): readonly string[] {
  const matches = text.match(HASHTAG_RE);
  if (!matches) return [];
  // Lowercase and deduplicate
  const seen = new Set<string>();
  const result: string[] = [];
  for (const tag of matches) {
    const lower = tag.toLowerCase();
    if (!seen.has(lower)) {
      seen.add(lower);
      result.push(lower);
    }
  }
  return result;
}

function extractEmojis(text: string): readonly EmojiOccurrence[] {
  const results: EmojiOccurrence[] = [];
  const matches = text.matchAll(EMOJI_RE);
  const textLength = text.length;

  for (const match of matches) {
    const index = match.index ?? 0;
    const relativePos = textLength > 0 ? index / textLength : 0;

    let position: 'start' | 'middle' | 'end';
    if (relativePos < 0.33) {
      position = 'start';
    } else if (relativePos > 0.66) {
      position = 'end';
    } else {
      position = 'middle';
    }

    results.push({ emoji: match[0]!, position });
  }

  return results;
}

/**
 * Simple language detection based on character-set heuristics.
 *
 * Returns ISO 639-1 code. Defaults to "en" for Latin-script text.
 */
function detectLanguage(text: string): string {
  // Strip emojis and URLs for cleaner detection
  const stripped = text.replace(EMOJI_RE, '').replace(URL_RE, '').trim();

  // CJK characters → zh/ja/ko (simplified detection)
  const cjkCount = (stripped.match(/[\u4E00-\u9FFF]/g) || []).length;
  if (cjkCount > stripped.length * 0.15) return 'zh';

  const hiraganaKatakana = (
    stripped.match(/[\u3040-\u309F\u30A0-\u30FF]/g) || []
  ).length;
  if (hiraganaKatakana > 5) return 'ja';

  const hangul = (stripped.match(/[\uAC00-\uD7AF]/g) || []).length;
  if (hangul > stripped.length * 0.15) return 'ko';

  // Arabic script
  const arabic = (stripped.match(/[\u0600-\u06FF]/g) || []).length;
  if (arabic > stripped.length * 0.15) return 'ar';

  // Cyrillic
  const cyrillic = (stripped.match(/[\u0400-\u04FF]/g) || []).length;
  if (cyrillic > stripped.length * 0.15) return 'ru';

  // Devanagari
  const devanagari = (stripped.match(/[\u0900-\u097F]/g) || []).length;
  if (devanagari > stripped.length * 0.15) return 'hi';

  // Spanish / Portuguese heuristic: common accented chars + word patterns
  const words = stripped.toLowerCase().split(/\s+/);
  const spanishWords = new Set([
    'de', 'la', 'el', 'en', 'que', 'los', 'del', 'las', 'por', 'con',
    'una', 'para', 'como', 'pero', 'sus', 'este', 'cuando',
  ]);
  const spanishHits = words.filter((w) => spanishWords.has(w)).length;
  if (words.length > 5 && spanishHits / words.length > 0.15) return 'es';

  // French heuristic
  const frenchWords = new Set([
    'de', 'la', 'le', 'les', 'des', 'un', 'une', 'du', 'et', 'en',
    'est', 'que', 'pour', 'dans', 'qui', 'pas', 'sur', 'avec', 'plus',
  ]);
  const frenchHits = words.filter((w) => frenchWords.has(w)).length;
  if (words.length > 5 && frenchHits / words.length > 0.18) return 'fr';

  // German heuristic
  const germanWords = new Set([
    'der', 'die', 'und', 'den', 'von', 'ein', 'ist', 'das', 'auf',
    'dem', 'nicht', 'mit', 'sich', 'des', 'eine', 'auch', 'als',
  ]);
  const germanHits = words.filter((w) => germanWords.has(w)).length;
  if (words.length > 5 && germanHits / words.length > 0.12) return 'de';

  // Default to English
  return 'en';
}

function countWords(text: string): number {
  const stripped = text
    .replace(HASHTAG_RE, '')
    .replace(EMOJI_RE, '')
    .replace(URL_RE, '')
    .trim();
  if (stripped.length === 0) return 0;
  return stripped.split(/\s+/).filter((w) => w.length > 0).length;
}

/** Jaccard similarity of two word-sets. */
function jaccardSimilarity(a: string, b: string): number {
  const wordsA = new Set(a.toLowerCase().split(/\s+/));
  const wordsB = new Set(b.toLowerCase().split(/\s+/));
  let intersection = 0;
  for (const w of wordsA) {
    if (wordsB.has(w)) intersection++;
  }
  const union = wordsA.size + wordsB.size - intersection;
  return union === 0 ? 1 : intersection / union;
}

function deduplicateByJaccard(
  posts: readonly CleanedPost[],
  threshold: number,
): readonly CleanedPost[] {
  const result: CleanedPost[] = [];

  for (const post of posts) {
    const isDuplicate = result.some(
      (existing) =>
        jaccardSimilarity(existing.cleanedText, post.cleanedText) > threshold,
    );
    if (!isDuplicate) {
      result.push(post);
    }
  }

  return result;
}
