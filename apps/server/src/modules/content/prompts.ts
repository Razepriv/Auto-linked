// ---------------------------------------------------------------------------
// Prompt Construction — System + User prompts for Claude content generation
// ---------------------------------------------------------------------------

import type {
  GenerationParams,
  VoiceProfileSnapshot,
} from './types.js';

// ---------------------------------------------------------------------------
// AI-sounding phrases to explicitly ban
// ---------------------------------------------------------------------------

const AI_NEGATIVE_PHRASES: readonly string[] = [
  "in today's fast-paced world",
  "in today's digital landscape",
  "in today's ever-evolving",
  "in today's rapidly changing",
  "let's dive in",
  "let's dive deep",
  "let's unpack this",
  "game-changer",
  "game changer",
  "leverage",
  "synergy",
  "synergies",
  "unlock your potential",
  "unlock the power",
  "it's not about X, it's about Y",
  "here's the truth",
  "here's the thing nobody tells you",
  "here's what nobody talks about",
  "buckle up",
  "spoiler alert",
  "hot take",
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
  "circle back",
  "low-hanging fruit",
  "best-in-class",
  "next-level",
  "level up",
];

/**
 * Build the system prompt that establishes voice constraints for Claude.
 *
 * @param voiceProfile - The user's voice profile snapshot.
 * @param userName     - The user's display name.
 * @returns A system prompt string.
 */
export function buildSystemPrompt(
  voiceProfile: VoiceProfileSnapshot,
  userName: string,
): string {
  const lines: string[] = [
    `You are a LinkedIn ghostwriter. You write posts that sound exactly like ${userName}.`,
    '',
    'VOICE PROFILE:',
    `- Primary tone: ${voiceProfile.tone}`,
    `- Average post length: ${voiceProfile.avgPostLength} characters`,
    `- Emoji frequency: ${voiceProfile.emojiFrequency}`,
    voiceProfile.emoji.preferred.length > 0
      ? `- Preferred emojis: ${voiceProfile.emoji.preferred.join(' ')}`
      : '- Preferred emojis: none specified',
    `- Hashtag style: ${voiceProfile.hashtagStyle}`,
    voiceProfile.hashtags.recurring.length > 0
      ? `- Recurring hashtags: ${voiceProfile.hashtags.recurring.join(', ')}`
      : '',
    `- Hashtag placement: ${voiceProfile.hashtags.placement}`,
    `- Formatting style: ${voiceProfile.formatting}`,
    `- Line break style: ${voiceProfile.lineBreakStyle}`,
    voiceProfile.vocabulary.frequentWords.length > 0
      ? `- Signature phrases: ${voiceProfile.vocabulary.frequentWords.slice(0, 10).join(', ')}`
      : '',
    voiceProfile.vocabulary.jargonTerms.length > 0
      ? `- Industry jargon to use naturally: ${voiceProfile.vocabulary.jargonTerms.slice(0, 10).join(', ')}`
      : '',
    '',
    'CRITICAL RULES:',
    `1. Match the tone precisely. This author writes in a ${voiceProfile.tone} style.`,
    `2. Use ${voiceProfile.lineBreakStyle} line breaks between paragraphs.`,
    `3. Target ${voiceProfile.avgPostLength} characters (+/- 30%).`,
    `4. Use ${voiceProfile.emojiFrequency} emojis.`,
    `5. Include hashtags at the ${voiceProfile.hashtags.placement} of the post using ${voiceProfile.hashtagStyle} style.`,
    '6. Write in first person as the author.',
    '7. DO NOT sound like generic AI.',
    '8. DO NOT use markdown formatting. LinkedIn does not render markdown.',
    '   Use Unicode bold (\uD835\uDDE2\uD835\uDDFC\uD835\uDDF9\uD835\uDDF1) for emphasis if the author uses it.',
    '9. Every line break in your output will appear as-is on LinkedIn. Format accordingly.',
    '10. The first line (the hook) must be under 150 characters to display fully before "see more".',
    '11. Maximum 3000 characters total (LinkedIn limit).',
  ];

  // Add avoided words if present.
  if (voiceProfile.vocabulary.avoidedWords.length > 0) {
    lines.push(
      `12. DO NOT use these words/phrases: ${voiceProfile.vocabulary.avoidedWords.join(', ')}`,
    );
  }

  // Always add the AI-phrase blocklist.
  lines.push('');
  lines.push('ABSOLUTELY NEVER use these AI-sounding phrases:');
  for (const phrase of AI_NEGATIVE_PHRASES) {
    lines.push(`- "${phrase}"`);
  }

  return lines.filter((l) => l !== '').join('\n');
}

/**
 * Build the user prompt that provides the specific assignment and context.
 *
 * @param params - All generation parameters.
 * @returns A user prompt string.
 */
export function buildUserPrompt(params: GenerationParams): string {
  const sections: string[] = [];

  // Assignment block
  sections.push(
    `Write a LinkedIn post for ${params.userName}.`,
    '',
    'ASSIGNMENT:',
    `- Pillar: ${params.pillar.name} — ${params.pillar.description}`,
    `- Topic/Angle: ${params.topic}`,
    `- Format: ${params.format}`,
    `- Hook type: ${params.hookType}`,
    `- Content angle: ${params.angle}`,
  );

  // Context block
  if (params.trendingTopics.length > 0) {
    sections.push(
      '',
      'TRENDING TOPICS (use if relevant, ignore if not):',
      ...params.trendingTopics.map((t) => `- ${t.title}: ${t.summary}`),
    );
  }

  if (params.recentPosts.length > 0) {
    sections.push(
      '',
      'RECENT POSTS (avoid repeating similar ideas):',
      ...params.recentPosts.map((p, i) => `--- Recent ${i + 1} ---\n${p.slice(0, 300)}`),
    );
  }

  // Examples block
  if (params.topPosts.length > 0) {
    sections.push(
      '',
      "EXAMPLES OF THE AUTHOR'S BEST POSTS (match this style):",
      ...params.topPosts.map((p, i) => `--- Example ${i + 1} ---\n${p}`),
    );
  }

  // Negative examples
  if (params.negativeExamples.length > 0) {
    sections.push(
      '',
      'NEGATIVE EXAMPLES (the author wants to AVOID this style):',
      ...params.negativeExamples.map((p, i) => `--- Negative ${i + 1} ---\n${p}`),
    );
  }

  // Format-specific guidance
  sections.push('', getFormatGuidance(params.format));

  // JSON output schema
  sections.push(
    '',
    'Output as JSON (and ONLY JSON, no other text):',
    '{',
    '  "post_text": "the full post text with line breaks as \\n",',
    '  "hashtags": ["tag1", "tag2", "tag3"],',
    '  "media_recommendation": {',
    '    "type": "none" | "image" | "carousel" | "poll",',
    '    "description": "what the visual should show",',
    '    "alt_text": "accessibility description"',
    '  },',
    '  "strategy_explanation": "brief explanation of the strategy behind this post"',
    '}',
  );

  return sections.join('\n');
}

/**
 * Build additional guidance specific to carousel-format posts.
 */
export function buildCarouselPrompt(): string {
  return [
    'FORMAT GUIDANCE (Carousel):',
    '- Structure the content as a slide deck (5-8 slides).',
    '- Slide 1: Title slide with a compelling headline (this is the hook).',
    '- Slides 2-7: One key point per slide. 3-5 bullet points max per slide. Large text.',
    '- Final slide: CTA slide — follow, comment, share.',
    '- In media_recommendation, include "slides" array:',
    '  [{ "title": "...", "bullets": ["...", "..."] }, ...]',
    '- Write accompanying post text (3-5 sentences) that teases the carousel content.',
    '- The post text appears alongside the carousel preview on the feed.',
  ].join('\n');
}

/**
 * Build additional guidance specific to poll-format posts.
 */
export function buildPollPrompt(): string {
  return [
    'FORMAT GUIDANCE (Poll):',
    '- Write a short post text (2-4 sentences) that frames the poll question.',
    '- The poll question should be clear and opinionated to drive engagement.',
    '- Provide exactly 4 poll options. Each option should be 1-5 words.',
    '- In media_recommendation, include:',
    '  { "type": "poll", "question": "...", "options": ["...", "...", "...", "..."] }',
    '- The post text + poll should spark a debate or curiosity.',
  ].join('\n');
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

function getFormatGuidance(format: string): string {
  switch (format) {
    case 'carousel':
      return buildCarouselPrompt();
    case 'poll':
      return buildPollPrompt();
    case 'image':
      return [
        'FORMAT GUIDANCE (Image):',
        '- Write the post text assuming an image will appear above it.',
        '- The image should complement the text, not duplicate it.',
        '- In media_recommendation, describe the image in detail: subject, style, colors, mood.',
        '- The post text should make sense even without the image.',
        '- Keep post text slightly shorter than a text-only post.',
      ].join('\n');
    case 'text':
    default:
      return [
        'FORMAT GUIDANCE (Text):',
        '- No media needed. The words do all the work.',
        '- Optimize the hook for "see more" clicks (LinkedIn truncates after ~3 lines).',
        '- Use white space aggressively — short paragraphs, single-sentence lines.',
        '- Strong hook + clear CTA = high engagement.',
      ].join('\n');
  }
}
