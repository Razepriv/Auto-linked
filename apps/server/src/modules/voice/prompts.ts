// ---------------------------------------------------------------------------
// Voice Analysis Engine – Prompt Templates
// ---------------------------------------------------------------------------
// Builds system + user prompts for Claude API calls. Pure functions with
// no side effects.
// ---------------------------------------------------------------------------

import type { CleanedPost, QuestionnaireAnswers, VoiceProfile } from './types.js';

// ---- JSON output schema used in prompts ------------------------------------

const LLM_OUTPUT_SCHEMA = `{
  "tone": {
    "primary": "<one of: professional, conversational, inspirational, educational, humorous, provocative, storytelling, authoritative>",
    "secondary": "<same options as primary, or null>",
    "formality_score": "<number 0.0 to 1.0, 0 = very casual, 1 = very formal>",
    "confidence": "<number 0.0 to 1.0>",
    "evidence": ["<direct quote from posts supporting the classification>"]
  },
  "hooks": {
    "classifications": [
      {
        "post_index": "<number>",
        "type": "<one of: question, bold_statement, statistic, story, contrarian, listicle, quote, personal_anecdote, problem_statement>",
        "hook_text": "<the first 1-2 lines of the post>",
        "confidence": "<number 0.0 to 1.0>"
      }
    ]
  },
  "ctas": {
    "classifications": [
      {
        "post_index": "<number>",
        "type": "<one of: question, agree_disagree, share_experience, tag_someone, follow_for_more, link_in_comments, dm_me, repost, none>",
        "cta_text": "<the last 1-3 lines, or null if none>",
        "confidence": "<number 0.0 to 1.0>"
      }
    ]
  },
  "vocabulary": {
    "signature_phrases": ["<recurring multi-word expressions>"],
    "industry_jargon": ["<domain-specific terms>"],
    "power_words": ["<impactful words used frequently>"],
    "avoided_words": ["<words or phrases the author avoids>"],
    "reading_level": "<one of: basic, intermediate, advanced>",
    "confidence": "<number 0.0 to 1.0>"
  },
  "writing_style": {
    "argument_pattern": "<how the author builds arguments>",
    "distinctive_traits": ["<what makes the writing distinctive>"],
    "ghostwriter_notes": ["<patterns a ghostwriter must replicate>"]
  }
}`;

// ---- Public API ------------------------------------------------------------

/**
 * Build the system + user prompts for voice analysis.
 *
 * The user prompt embeds up to 20 posts and the JSON schema the LLM must
 * return. When a questionnaire is provided, it is appended as context.
 */
export function buildVoiceAnalysisPrompt(
  posts: readonly CleanedPost[],
  questionnaire?: QuestionnaireAnswers,
): { system: string; user: string } {
  const postCount = posts.length;
  const isSmallSample = postCount < 5;

  // -- System prompt --
  const system = [
    'You are an expert LinkedIn content analyst. Your job is to analyze a set of',
    'LinkedIn posts written by a single author and extract their unique writing voice.',
    '',
    'You will receive a batch of posts. For each analysis dimension, provide:',
    '1. Your classification',
    '2. Confidence level (0.0 to 1.0)',
    '3. Evidence: direct quotes from the posts that support your classification',
    '',
    'Be precise. Do not guess. If the sample is too small to determine a pattern',
    'with confidence, say so and set confidence below 0.3.',
    '',
    'Output your analysis as a JSON object matching the provided schema exactly.',
    'Do not include any text outside the JSON object.',
    'Do not wrap the JSON in markdown code fences.',
    '',
    isSmallSample
      ? [
          'IMPORTANT: You have been given fewer than 5 posts. This is a very small sample.',
          'Focus on tone and vocabulary over structural patterns. Set confidence scores',
          'proportionally lower. If you cannot determine a dimension reliably, set its',
          'confidence to 0.2 or below and note the limitation in evidence.',
        ].join('\n')
      : '',
  ]
    .filter(Boolean)
    .join('\n');

  // -- User prompt --
  const postBlocks = posts
    .map((p, i) => `[POST ${i + 1}]\n${p.cleanedText}`)
    .join('\n---\n');

  const questionnaireSuffix = questionnaire
    ? buildQuestionnaireContext(questionnaire)
    : '';

  const inconsistencyNote = [
    '',
    'NOTE: If you detect that the posts vary wildly in style (e.g. some formal',
    'thought-leadership, some casual memes, some long stories), identify the',
    'distinct "modes" of writing. Report the primary (most common) mode in your',
    'main classification, and mention other modes in writing_style.distinctive_traits.',
  ].join('\n');

  const user = [
    `Analyze these ${postCount} LinkedIn posts from the same author.`,
    '',
    'POSTS:',
    '---',
    postBlocks,
    '---',
    '',
    'Analyze the following dimensions:',
    '',
    '1. TONE',
    '   - Primary tone (one of: professional, conversational, inspirational, educational, humorous, provocative, storytelling, authoritative)',
    '   - Secondary tone (if present, or null)',
    '   - Formality score (0.0 = very casual, 1.0 = very formal)',
    '',
    '2. HOOKS',
    '   - For each post, classify the hook (first 1-2 lines) into one of:',
    '     question, bold_statement, statistic, story, contrarian, listicle, quote, personal_anecdote, problem_statement',
    '   - Report the distribution across all posts',
    '',
    '3. CTAs',
    '   - For each post, classify the CTA (last 1-3 lines) into one of:',
    '     question, agree_disagree, share_experience, tag_someone, follow_for_more, link_in_comments, dm_me, repost, none',
    '   - Report the distribution',
    '',
    '4. VOCABULARY',
    '   - Signature phrases (recurring multi-word expressions)',
    '   - Industry jargon used',
    '   - Power words (impactful words used frequently)',
    '   - Words or phrases the author avoids (notable absences)',
    '   - Reading level (basic, intermediate, advanced)',
    '',
    '5. WRITING STYLE',
    '   - How does this author build arguments?',
    '   - What makes their writing distinctive?',
    '   - What patterns would a ghostwriter need to replicate?',
    inconsistencyNote,
    questionnaireSuffix,
    '',
    'Output as JSON matching this schema exactly:',
    LLM_OUTPUT_SCHEMA,
  ].join('\n');

  return { system, user };
}

/**
 * Build the system + user prompts for comparing a generated post against a
 * user's voice profile and example posts.
 */
export function buildVoiceComparisonPrompt(
  profile: VoiceProfile,
  examples: readonly string[],
  newPost: string,
): { system: string; user: string } {
  const system = [
    'You are an expert LinkedIn content analyst specializing in voice matching.',
    'You will compare a generated post against an author\'s original posts and voice profile.',
    'Rate how closely the generated post matches the author\'s authentic voice.',
    '',
    'Output your analysis as a JSON object with the following structure:',
    '{',
    '  "tone_consistency": <number 0.0-1.0>,',
    '  "vocabulary_match": <number 0.0-1.0>,',
    '  "structural_similarity": <number 0.0-1.0>,',
    '  "hook_style_match": <number 0.0-1.0>,',
    '  "overall_score": <number 0.0-1.0>,',
    '  "feedback": "<if overall_score < 0.7, explain what is different and how to fix it>"',
    '}',
    '',
    'Do not include any text outside the JSON object.',
    'Do not wrap the JSON in markdown code fences.',
  ].join('\n');

  const profileSummary = buildProfileSummary(profile);
  const exampleBlocks = examples
    .map((ex, i) => `[ORIGINAL ${i + 1}]\n${ex}`)
    .join('\n---\n');

  const user = [
    'Compare this generated post against the author\'s original posts and voice profile.',
    '',
    'VOICE PROFILE SUMMARY:',
    profileSummary,
    '',
    'ORIGINAL POSTS (same author):',
    '---',
    exampleBlocks,
    '---',
    '',
    'GENERATED POST:',
    newPost,
    '',
    'Rate the voice match on these dimensions (0.0 to 1.0):',
    '1. Tone consistency',
    '2. Vocabulary match',
    '3. Structural similarity',
    '4. Hook style match',
    '5. Overall "sounds like the same person"',
    '',
    'If the overall score is below 0.7, explain what is different and how to fix it.',
  ].join('\n');

  return { system, user };
}

// ---- Helpers ---------------------------------------------------------------

function buildQuestionnaireContext(q: QuestionnaireAnswers): string {
  const lines: string[] = [
    '',
    'CONTEXT FROM USER QUESTIONNAIRE (stated preferences, may differ from demonstrated behavior):',
  ];

  if (q.professionalRole) {
    lines.push(`- Professional role: ${q.professionalRole}`);
  }
  if (q.preferredTone) {
    lines.push(`- Preferred tone: ${q.preferredTone}`);
  }
  if (q.emojiPreference) {
    lines.push(`- Emoji preference: ${q.emojiPreference}`);
  }
  if (q.hashtagPreference) {
    lines.push(`- Hashtag preference: ${q.hashtagPreference}`);
  }
  if (q.typicalPostLength) {
    lines.push(`- Typical post length: ${q.typicalPostLength}`);
  }
  if (q.formattingPreference) {
    lines.push(`- Formatting preference: ${q.formattingPreference}`);
  }
  if (q.hookPreferences && q.hookPreferences.length > 0) {
    lines.push(`- Preferred hook styles: ${q.hookPreferences.join(', ')}`);
  }

  lines.push(
    '',
    'Note: If the posts contradict the questionnaire, trust the posts (demonstrated behavior > stated preference).',
  );

  return lines.join('\n');
}

function buildProfileSummary(profile: VoiceProfile): string {
  const lines: string[] = [];

  lines.push(`Tone: ${profile.tone.value} (confidence: ${profile.tone.confidence})`);

  if (profile.hookPatterns.length > 0) {
    const hooks = profile.hookPatterns.map((h) => h.value).join(', ');
    lines.push(`Hook patterns: ${hooks}`);
  }

  if (profile.ctaPatterns.length > 0) {
    const ctas = profile.ctaPatterns.map((c) => c.value).join(', ');
    lines.push(`CTA patterns: ${ctas}`);
  }

  lines.push(`Emoji: ${profile.emoji.frequency} (preferred: ${profile.emoji.preferred.join(', ') || 'none'})`);
  lines.push(`Hashtags: ${profile.hashtags.style}`);
  lines.push(`Formatting: ${profile.formatting.style}, line breaks: ${profile.formatting.lineBreaks}`);

  if (profile.vocabulary.frequentWords.length > 0) {
    lines.push(`Frequent words: ${profile.vocabulary.frequentWords.slice(0, 10).join(', ')}`);
  }

  if (profile.vocabulary.jargonTerms.length > 0) {
    lines.push(`Jargon: ${profile.vocabulary.jargonTerms.slice(0, 10).join(', ')}`);
  }

  return lines.join('\n');
}
