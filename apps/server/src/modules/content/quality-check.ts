// ---------------------------------------------------------------------------
// Quality Check — Deterministic quality scoring for generated posts
// ---------------------------------------------------------------------------
//
// 6 checks, each producing a sub-score. Weighted sum → final 0-100 score.
// Pass threshold: >= 60.
// ---------------------------------------------------------------------------

import type {
  GeneratedPost,
  GenerationContext,
  QualityIssue,
  QualityIssueType,
  QualityReport,
} from './types.js';

// ---------------------------------------------------------------------------
// AI phrase blocklist
// ---------------------------------------------------------------------------

const AI_BLOCKLIST: readonly string[] = [
  "in today's fast-paced world",
  "in today's digital landscape",
  "in today's ever-evolving",
  "in today's rapidly changing",
  "let's dive in",
  "let's dive deep",
  "let's unpack this",
  "game-changer",
  "game changer",
  "leverage synergies",
  "unlock your potential",
  "unlock the power",
  "it's not about x, it's about y",
  "here's the truth",
  "here's the thing nobody tells you",
  "here's what nobody talks about",
  "buckle up",
  "spoiler alert",
  "at the end of the day",
  "the bottom line",
  "without further ado",
  "that being said",
  "needless to say",
  "it goes without saying",
  "think about it",
  "let that sink in",
  "mind-blowing",
  "groundbreaking",
  "revolutionary",
  "paradigm shift",
  "disruptive",
  "actionable insights",
  "move the needle",
  "deep dive",
  "low-hanging fruit",
];

// ---------------------------------------------------------------------------
// Sensitivity keywords (lightweight check)
// ---------------------------------------------------------------------------

const SENSITIVITY_KEYWORDS: readonly string[] = [
  'democrat', 'republican', 'liberal', 'conservative', 'left-wing', 'right-wing',
  'abortion', 'gun control', 'immigration policy', 'political party',
  'religion is', 'atheist', 'prayer',
  'race war', 'white supremacy', 'racial superiority',
];

// ---------------------------------------------------------------------------
// Check weights
// ---------------------------------------------------------------------------

const WEIGHTS = {
  repetition: 15,
  toneMatch: 20,
  sensitivity: 10,
  aiDetection: 20,
  hookEffectiveness: 15,
  ctaPresence: 10,
  lengthCompliance: 10,
} as const;

// ---------------------------------------------------------------------------
// Main entry point
// ---------------------------------------------------------------------------

/**
 * Run all quality checks on a generated post.
 *
 * @param post    - The generated post to evaluate.
 * @param context - The generation context for comparison data.
 * @returns A QualityReport with score, pass/fail, and detailed issues.
 */
export function checkQuality(
  post: GeneratedPost,
  context: GenerationContext,
): QualityReport {
  const issues: QualityIssue[] = [];
  const contentLower = post.content.toLowerCase();

  // --- 1. Repetition check ---
  const repetitionScore = checkRepetition(post.content, context.recentPosts, issues);

  // --- 2. Tone match ---
  const toneScore = checkToneMatch(post.content, context, issues);

  // --- 3. Sensitivity ---
  const sensitivityScore = checkSensitivity(contentLower, issues);

  // --- 4. Generic AI detection ---
  const aiDetectionScore = checkAIDetection(contentLower, context, issues);

  // --- 5. Hook effectiveness ---
  const hookScore = checkHookEffectiveness(post.hook, context, issues);

  // --- 6. CTA presence ---
  const ctaScore = checkCTAPresence(post.content, issues);

  // --- 7. Length compliance ---
  const lengthScore = checkLengthCompliance(post.content, context, issues);

  // Compute weighted final score.
  const rawScore =
    (repetitionScore / 100) * WEIGHTS.repetition +
    (toneScore / 100) * WEIGHTS.toneMatch +
    (sensitivityScore / 100) * WEIGHTS.sensitivity +
    (aiDetectionScore / 100) * WEIGHTS.aiDetection +
    (hookScore / 100) * WEIGHTS.hookEffectiveness +
    (ctaScore / 100) * WEIGHTS.ctaPresence +
    (lengthScore / 100) * WEIGHTS.lengthCompliance;

  const score = Math.round(rawScore);

  return {
    score,
    passed: score >= 60,
    issues,
    checks: {
      repetition: repetitionScore,
      toneMatch: toneScore,
      sensitivity: sensitivityScore,
      aiDetection: aiDetectionScore,
      hookEffectiveness: hookScore,
      ctaPresence: ctaScore,
      lengthCompliance: lengthScore,
    },
  };
}

// ---------------------------------------------------------------------------
// Individual checks (each returns 0-100)
// ---------------------------------------------------------------------------

function checkRepetition(
  content: string,
  recentPosts: readonly string[],
  issues: QualityIssue[],
): number {
  if (recentPosts.length === 0) return 100;

  const contentWords = tokenize(content);
  let maxSimilarity = 0;

  for (const recent of recentPosts) {
    const recentWords = tokenize(recent);
    const similarity = jaccardSimilarity(contentWords, recentWords);
    if (similarity > maxSimilarity) {
      maxSimilarity = similarity;
    }
  }

  if (maxSimilarity > 0.7) {
    issues.push({
      type: 'repetition',
      severity: 'high',
      message: `High similarity (${Math.round(maxSimilarity * 100)}%) with a recent post.`,
      deduction: 30,
    });
    return 20;
  }

  if (maxSimilarity > 0.4) {
    issues.push({
      type: 'repetition',
      severity: 'medium',
      message: `Moderate similarity (${Math.round(maxSimilarity * 100)}%) with a recent post.`,
      deduction: 15,
    });
    return 60;
  }

  return 100;
}

function checkToneMatch(
  content: string,
  context: GenerationContext,
  issues: QualityIssue[],
): number {
  let score = 100;
  const words = content.split(/\s+/);

  // Check for avoided words.
  const avoidedWords = context.voiceProfile.vocabulary.avoidedWords;
  const contentLower = content.toLowerCase();
  const foundAvoided: string[] = [];

  for (const word of avoidedWords) {
    if (contentLower.includes(word.toLowerCase())) {
      foundAvoided.push(word);
    }
  }

  if (foundAvoided.length > 0) {
    const deduction = Math.min(30, foundAvoided.length * 10);
    score -= deduction;
    issues.push({
      type: 'tone_mismatch',
      severity: foundAvoided.length >= 3 ? 'high' : 'medium',
      message: `Post contains avoided words: ${foundAvoided.join(', ')}`,
      deduction,
    });
  }

  // Check sentence length consistency.
  const avgSentenceLen = words.length / Math.max(1, content.split(/[.!?]+/).filter(Boolean).length);
  // If sentences are much shorter or longer than expected for the tone, flag it.
  const tone = context.voiceProfile.tone;
  if (tone === 'professional' && avgSentenceLen < 5) {
    score -= 10;
    issues.push({
      type: 'tone_mismatch',
      severity: 'low',
      message: 'Sentences are very short for a professional tone.',
      deduction: 10,
    });
  }

  return Math.max(0, score);
}

function checkSensitivity(
  contentLower: string,
  issues: QualityIssue[],
): number {
  let score = 100;
  const found: string[] = [];

  for (const keyword of SENSITIVITY_KEYWORDS) {
    if (contentLower.includes(keyword.toLowerCase())) {
      found.push(keyword);
    }
  }

  if (found.length > 0) {
    const deduction = Math.min(40, found.length * 15);
    score -= deduction;
    issues.push({
      type: 'sensitivity',
      severity: found.length >= 2 ? 'high' : 'medium',
      message: `Post contains potentially sensitive content: ${found.join(', ')}`,
      deduction,
    });
  }

  return Math.max(0, score);
}

function checkAIDetection(
  contentLower: string,
  context: GenerationContext,
  issues: QualityIssue[],
): number {
  let score = 100;

  // Build exemption set from user's own writing patterns.
  const userPhrases = new Set(
    context.voiceProfile.vocabulary.frequentWords.map((w) => w.toLowerCase()),
  );

  let matchCount = 0;

  for (const phrase of AI_BLOCKLIST) {
    if (contentLower.includes(phrase.toLowerCase()) && !userPhrases.has(phrase.toLowerCase())) {
      matchCount++;
    }
  }

  if (matchCount > 0) {
    // 5 points per phrase, max 20 deduction per the design doc.
    const deduction = Math.min(20, matchCount * 5);
    score -= deduction;
    issues.push({
      type: 'generic_ai',
      severity: matchCount >= 3 ? 'high' : 'medium',
      message: `Found ${matchCount} generic AI phrase(s) in the post.`,
      deduction,
    });
  }

  return Math.max(0, score);
}

function checkHookEffectiveness(
  hook: string,
  _context: GenerationContext,
  issues: QualityIssue[],
): number {
  let score = 100;

  // Hook must exist and be non-empty.
  if (!hook || hook.trim().length === 0) {
    issues.push({
      type: 'hook_ineffective',
      severity: 'high',
      message: 'Post has no hook (empty first line).',
      deduction: 30,
    });
    return 30;
  }

  // Hook must be under 150 chars.
  if (hook.length > 150) {
    score -= 20;
    issues.push({
      type: 'hook_ineffective',
      severity: 'medium',
      message: `Hook is ${hook.length} chars (max 150). It will be cut off in the feed.`,
      deduction: 20,
    });
  }

  // Hook should be under 20 words for maximum impact.
  const hookWords = hook.split(/\s+/).filter(Boolean);
  if (hookWords.length > 25) {
    score -= 10;
    issues.push({
      type: 'hook_ineffective',
      severity: 'low',
      message: `Hook is ${hookWords.length} words — shorter hooks perform better.`,
      deduction: 10,
    });
  }

  return Math.max(0, score);
}

function checkCTAPresence(
  content: string,
  issues: QualityIssue[],
): number {
  // Check last ~300 chars for CTA signals.
  const tail = content.slice(-300).toLowerCase();

  const ctaSignals = [
    '?',          // question
    'comment',
    'share',
    'follow',
    'agree',
    'disagree',
    'tag someone',
    'what do you think',
    'let me know',
    'dm me',
    'drop a',
    'tell me',
    'your thoughts',
    'repost',
    'save this',
  ];

  const hasCta = ctaSignals.some((signal) => tail.includes(signal));

  if (!hasCta) {
    issues.push({
      type: 'missing_cta',
      severity: 'medium',
      message: 'No clear call-to-action found in the last portion of the post.',
      deduction: 15,
    });
    return 50;
  }

  return 100;
}

function checkLengthCompliance(
  content: string,
  context: GenerationContext,
  issues: QualityIssue[],
): number {
  const targetLength = context.voiceProfile.avgPostLength;
  const minLength = Math.floor(targetLength * 0.7);
  const maxLength = Math.ceil(targetLength * 1.3);
  const actualLength = content.length;

  if (actualLength < minLength) {
    const severity: QualityIssue['severity'] =
      actualLength < targetLength * 0.5 ? 'high' : 'medium';
    issues.push({
      type: 'length_violation',
      severity,
      message: `Post is ${actualLength} chars (target: ${targetLength}, min: ${minLength}).`,
      deduction: 15,
    });
    return severity === 'high' ? 40 : 65;
  }

  if (actualLength > maxLength) {
    issues.push({
      type: 'length_violation',
      severity: 'medium',
      message: `Post is ${actualLength} chars (target: ${targetLength}, max: ${maxLength}).`,
      deduction: 10,
    });
    return 70;
  }

  // Over LinkedIn limit
  if (actualLength > 3000) {
    issues.push({
      type: 'length_violation',
      severity: 'critical',
      message: `Post exceeds LinkedIn's 3000-char limit (${actualLength} chars).`,
      deduction: 25,
    });
    return 30;
  }

  return 100;
}

// ---------------------------------------------------------------------------
// Utility: Jaccard similarity on word sets
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
