# Auto-Linked: Voice Analysis Engine Design

**Version:** 1.0
**Date:** 2026-04-09
**Status:** Draft

---

## Table of Contents

1. [Overview](#1-overview)
2. [Input Sources](#2-input-sources)
3. [Voice Profile Schema](#3-voice-profile-schema)
4. [Analysis Pipeline](#4-analysis-pipeline)
5. [Statistical Analyzer](#5-statistical-analyzer)
6. [LLM Analyzer](#6-llm-analyzer)
7. [Profile Generator](#7-profile-generator)
8. [Profile Versioning and Drift Detection](#8-profile-versioning-and-drift-detection)
9. [Quality Scoring](#9-quality-scoring)
10. [Edge Cases](#10-edge-cases)
11. [File Structure](#11-file-structure)
12. [Cost Analysis](#12-cost-analysis)

---

## 1. Overview

The Voice Analysis Engine is the core differentiator of Auto-Linked. It learns a user's unique LinkedIn writing style and produces a structured **Voice Profile** that drives all downstream content generation. The engine combines deterministic statistical analysis with Claude LLM-based qualitative analysis, merging both into a single profile that the user can review and refine.

The design prioritizes:
- **Accuracy**: Posts generated from the profile should be indistinguishable from the user's own writing.
- **Cost efficiency**: Statistical analysis is free; LLM calls are minimized and batched.
- **Transparency**: Every profile field has a confidence score and evidence trail so the user can understand and override decisions.
- **Evolution**: Profiles are versioned and drift is detected automatically as the user's style evolves.

---

## 2. Input Sources

The engine accepts writing samples from four sources, each with different weight and reliability.

| Source | When Available | Sample Quality | Weight |
|--------|---------------|---------------|--------|
| **LinkedIn past posts** | After OAuth connection | High -- actual published content | 1.0 (primary) |
| **Onboarding questionnaire** | Always (step 2 of onboarding) | Medium -- stated preferences, not demonstrated | 0.4 (seed) |
| **Example posts** | User provides during onboarding or later | High -- curated best work | 0.8 |
| **Manual writing samples** | User pastes text into the app | High -- but context may differ | 0.7 |

### LinkedIn Past Posts

- Fetched via LinkedIn API after OAuth connection.
- Target: last 50-100 posts. Minimum useful: 5 posts. Ideal: 30+.
- Includes post text, engagement metrics (reactions, comments), and post date.
- Higher-engagement posts receive higher weight in analysis (the user's best writing reflects their true voice, not their worst).

### Onboarding Questionnaire

Structured questions that capture stated preferences:

| Question | Field Mapped To | Options |
|----------|----------------|---------|
| What's your professional role? | `vocabulary.industry_context` | Free text |
| What tone best describes your writing? | `tone.primary` | Professional-casual, Formal, Provocative, Educational, Inspirational |
| How do you feel about emojis in posts? | `emoji.frequency` | None, Light (1-2), Heavy (3+) |
| Do you use hashtags? | `hashtags.strategy` | None, Minimal (1-3), Aggressive (4+) |
| How long are your typical posts? | `structure.target_length` | Short (< 100 words), Medium (100-200), Long (200+) |
| Do you prefer spaced-out or dense formatting? | `formatting.density` | Dense, Spaced, List-heavy |
| What's your hook style? | `hooks.preferred_types` | Multi-select from 9 types |

### Example Posts

Users can paste 3-5 posts they consider their "best work." These are analyzed alongside LinkedIn posts but weighted slightly lower (0.8) because they are self-selected and may not represent the full range of the user's style.

### Manual Writing Samples

For users with no LinkedIn history, they can paste any professional writing (emails, blog posts, newsletter excerpts). These receive lower weight (0.7) because the context differs from LinkedIn-native writing.

---

## 3. Voice Profile Schema

The voice profile is stored as a JSONB column in the `voice_profiles` table with the following structure.

```typescript
interface VoiceProfile {
  // === TONE ===
  tone: {
    primary: ToneEnum;
    secondary: ToneEnum | null;
    formality_score: number;       // 0.0 (very casual) to 1.0 (very formal)
    confidence: number;            // 0.0 to 1.0
  };

  // === STRUCTURE ===
  structure: {
    avg_word_count: number;
    median_word_count: number;
    min_word_count: number;
    max_word_count: number;
    target_word_count: number;     // derived: used for generation
    avg_sentence_length: number;   // words per sentence
    avg_paragraph_length: number;  // sentences per paragraph
    confidence: number;
  };

  // === HOOKS ===
  hooks: {
    preferred_types: HookType[];   // ordered by frequency
    distribution: Record<HookType, number>;  // percentage each type appears
    examples: Record<HookType, string[]>;    // 1-3 examples per type from user's posts
    confidence: number;
  };

  // === CTAs ===
  ctas: {
    preferred_types: CTAType[];
    distribution: Record<CTAType, number>;
    examples: string[];            // actual CTA lines from user's posts
    frequency: number;             // what % of posts have a CTA (0.0-1.0)
    confidence: number;
  };

  // === VOCABULARY ===
  vocabulary: {
    signature_phrases: string[];   // recurring phrases (e.g., "Here's the thing", "Let me explain")
    industry_jargon: string[];     // domain-specific terms
    power_words: string[];         // frequently used impactful words
    avoided_words: string[];       // words the user never uses
    reading_level: string;         // "basic" | "intermediate" | "advanced"
    confidence: number;
  };

  // === EMOJI ===
  emoji: {
    frequency: EmojiFrequency;     // "none" | "light" | "heavy"
    avg_per_post: number;
    preferred_emojis: string[];    // top 5-10 most used
    position: EmojiPosition;       // "start" | "end" | "inline" | "mixed"
    confidence: number;
  };

  // === HASHTAGS ===
  hashtags: {
    strategy: HashtagStrategy;     // "none" | "minimal" | "aggressive"
    avg_per_post: number;
    preferred_tags: string[];      // most frequently used
    position: "end" | "inline";    // where hashtags appear
    branded_tags: string[];        // user's own recurring hashtags
    confidence: number;
  };

  // === FORMATTING ===
  formatting: {
    density: FormattingDensity;    // "dense" | "spaced" | "list-heavy"
    line_break_style: "single" | "double";
    uses_bullet_lists: boolean;
    uses_numbered_lists: boolean;
    uses_bold_text: boolean;       // LinkedIn supports Unicode bold
    avg_lines_per_post: number;
    confidence: number;
  };

  // === METADATA ===
  metadata: {
    posts_analyzed: number;
    analysis_date: string;         // ISO 8601
    version: number;
    sources: InputSource[];        // which sources contributed
    overall_confidence: number;    // weighted average of all section confidences
  };
}
```

### Enum Definitions

```typescript
type ToneEnum =
  | 'professional-casual'
  | 'formal'
  | 'provocative'
  | 'educational'
  | 'inspirational'
  | 'conversational'
  | 'authoritative'
  | 'storytelling';

type HookType =
  | 'question'           // "Have you ever wondered why..."
  | 'bold_claim'         // "Most people are wrong about..."
  | 'story_opener'       // "Last week, something happened..."
  | 'statistic'          // "73% of professionals don't..."
  | 'contrarian'         // "Unpopular opinion: ..."
  | 'confession'         // "I'll be honest: I used to..."
  | 'list_preview'       // "3 things I learned from..."
  | 'metaphor'           // "Building a startup is like..."
  | 'direct_address';    // "If you're a founder, read this."

type CTAType =
  | 'question'           // "What do you think?"
  | 'agree_disagree'     // "Agree or disagree?"
  | 'share_prompt'       // "Share if this resonated"
  | 'tag_someone'        // "Tag someone who needs this"
  | 'follow_for_more'    // "Follow me for more on..."
  | 'comment_prompt'     // "Drop a comment with your..."
  | 'action_step';       // "Try this today: ..."

type EmojiFrequency = 'none' | 'light' | 'heavy';
type EmojiPosition = 'start' | 'end' | 'inline' | 'mixed';
type HashtagStrategy = 'none' | 'minimal' | 'aggressive';
type FormattingDensity = 'dense' | 'spaced' | 'list-heavy';
type InputSource = 'linkedin_posts' | 'questionnaire' | 'example_posts' | 'manual_samples';
```

---

## 4. Analysis Pipeline

The pipeline runs as a BullMQ job (`analyze-voice` queue) and follows six stages:

```
┌──────────┐    ┌──────────┐    ┌──────────────┐    ┌──────────────┐    ┌──────────┐    ┌──────────────┐
│ Collect  │───▶│  Clean   │───▶│  Statistical │───▶│     LLM      │───▶│  Merge   │───▶│ User Review  │
│ Samples  │    │  & Prep  │    │  Analysis    │    │  Analysis    │    │ Profiles │    │ & Approval   │
└──────────┘    └──────────┘    └──────────────┘    └──────────────┘    └──────────┘    └──────────────┘
                                   (free)              (~$0.02)          (deterministic)    (UI step)
```

### Stage 1: Collect Samples

- Pull posts from all available sources (LinkedIn API, questionnaire, example posts, manual samples).
- Normalize into a common `AnalysisSample` structure:
  ```typescript
  interface AnalysisSample {
    text: string;
    source: InputSource;
    engagement_score: number | null;  // normalized 0-1, null if not available
    date: string | null;
    weight: number;                   // source-based weight
  }
  ```
- Sort by engagement score (highest first) for LLM batching, so the most representative posts are analyzed first.

### Stage 2: Clean and Prepare

- Strip LinkedIn-specific formatting artifacts (e.g., "See translation" links, "Edited" markers).
- Normalize Unicode characters (smart quotes to straight quotes, em dashes to standard dashes).
- Remove posts that are too short (< 20 words) -- these are usually reshares with a brief comment, not original content.
- Remove duplicate or near-duplicate posts (Jaccard similarity > 0.85).
- Tag each post with structural annotations: hook lines, body, CTA lines, hashtag block.

### Stage 3: Statistical Analysis

Runs entirely in Node.js with no external API calls. Produces quantitative metrics. See [Section 5](#5-statistical-analyzer) for full detail.

### Stage 4: LLM Analysis

Sends a batch of posts to Claude API for qualitative analysis: tone, vocabulary nuance, hook classification, CTA patterns. See [Section 6](#6-llm-analyzer) for full detail.

### Stage 5: Merge Profiles

Reconciles statistical and LLM outputs into a single `VoiceProfile`. See [Section 7](#7-profile-generator) for reconciliation rules.

### Stage 6: User Review

The merged profile is presented in the UI. The user can:
- View each section with evidence (example excerpts from their posts).
- Override any field (e.g., change tone from "formal" to "professional-casual").
- Accept the profile to proceed.
- User overrides set the confidence to 1.0 for that field.

---

## 5. Statistical Analyzer

The statistical analyzer extracts quantitative metrics from the cleaned sample set. It runs in-process with zero external calls and produces results instantly.

### Word Count Metrics

```typescript
interface WordCountStats {
  avg_word_count: number;
  median_word_count: number;
  min_word_count: number;
  max_word_count: number;
  std_dev: number;
  target_word_count: number;  // median, rounded to nearest 10
}
```

Calculation: Split text by whitespace, count tokens, compute standard statistical measures across all samples. The `target_word_count` is set to the median (more robust than mean for skewed distributions).

### Emoji Metrics

```typescript
interface EmojiStats {
  total_emojis: number;
  posts_with_emojis: number;
  posts_without_emojis: number;
  avg_per_post: number;
  frequency: EmojiFrequency;       // derived: 0 = "none", < 2 = "light", >= 2 = "heavy"
  top_emojis: Array<{ emoji: string; count: number }>;
  position_distribution: Record<EmojiPosition, number>;  // % at start, end, inline
}
```

Emoji detection uses a Unicode regex pattern (`/\p{Emoji_Presentation}/gu`). Position is determined by splitting the post into thirds and counting emoji occurrences in each.

### Hashtag Metrics

```typescript
interface HashtagStats {
  total_hashtags: number;
  posts_with_hashtags: number;
  avg_per_post: number;
  strategy: HashtagStrategy;        // 0 = "none", <= 3 = "minimal", > 3 = "aggressive"
  top_hashtags: Array<{ tag: string; count: number }>;
  position: "end" | "inline";       // if >80% appear in last 20% of text, "end"; else "inline"
}
```

### Formatting Metrics

```typescript
interface FormattingStats {
  avg_lines_per_post: number;
  avg_chars_per_line: number;
  double_line_break_ratio: number;  // % of line breaks that are double
  line_break_style: "single" | "double";  // whichever is > 60%
  bullet_list_posts: number;        // posts containing "- " or "* " or "• "
  numbered_list_posts: number;
  density: FormattingDensity;       // derived from line count / word count ratio
  uses_bold_text: boolean;          // detects Unicode bold characters
}
```

Density classification:
- **Dense**: avg lines per post < (word count / 15) -- few line breaks relative to content
- **List-heavy**: > 40% of posts contain bullet or numbered lists
- **Spaced**: everything else (frequent line breaks, short paragraphs)

### Structural Metrics

```typescript
interface StructuralStats {
  avg_sentence_length: number;      // words per sentence
  avg_paragraph_length: number;     // sentences per paragraph
  hook_line_avg_words: number;      // word count of first 1-2 lines
  has_cta_ratio: number;            // % of posts with a question or imperative in last 2 lines
  paragraph_count_avg: number;
}
```

Sentence detection uses a simple regex splitter (`/[.!?]+\s/`) with heuristics for abbreviations and URLs. Paragraph detection splits on double line breaks.

---

## 6. LLM Analyzer

The LLM analyzer uses Claude API to extract qualitative patterns that statistical analysis cannot capture: tone, vocabulary nuance, hook type classification, and writing style characteristics.

### System Prompt Template

```
You are an expert LinkedIn content analyst. Your job is to analyze a set of 
LinkedIn posts written by a single author and extract their unique writing voice.

You will receive a batch of posts. For each analysis dimension, provide:
1. Your classification
2. Confidence level (0.0 to 1.0)
3. Evidence: direct quotes from the posts that support your classification

Be precise. Do not guess. If the sample is too small to determine a pattern 
with confidence, say so and set confidence below 0.3.

Output your analysis as a JSON object matching the provided schema exactly.
Do not include any text outside the JSON object.
```

### User Prompt Template

```
Analyze these {count} LinkedIn posts from the same author.

POSTS:
---
{post_1}
---
{post_2}
---
... (up to 20 posts per batch)
---

Analyze the following dimensions:

1. TONE
   - Primary tone (one of: professional-casual, formal, provocative, educational, 
     inspirational, conversational, authoritative, storytelling)
   - Secondary tone (if present)
   - Formality score (0.0 = very casual, 1.0 = very formal)

2. HOOKS
   - For each post, classify the hook (first 1-2 lines) into one of:
     question, bold_claim, story_opener, statistic, contrarian, confession, 
     list_preview, metaphor, direct_address
   - Report the distribution across all posts

3. CTAs
   - For each post, classify the CTA (last 1-3 lines) into one of:
     question, agree_disagree, share_prompt, tag_someone, follow_for_more, 
     comment_prompt, action_step, none
   - Report the distribution

4. VOCABULARY
   - Signature phrases (recurring multi-word expressions)
   - Industry jargon used
   - Power words (impactful words used frequently)
   - Words or phrases the author avoids (notable absences)
   - Reading level (basic, intermediate, advanced)

5. WRITING STYLE
   - How does this author build arguments?
   - What makes their writing distinctive?
   - What patterns would a ghostwriter need to replicate?

Output as JSON:
{schema}
```

### Batching Strategy

- **Batch size**: 15-20 posts per Claude API call. This keeps the prompt within 8K-12K tokens (well within Claude's context window) while providing enough data for pattern detection.
- **Multiple batches**: If the user has > 20 posts, run two batches and merge results. Weight the batch with higher-engagement posts more heavily.
- **Single-batch threshold**: If the user has <= 20 posts, run a single batch.
- **Minimum viable**: 5 posts minimum. Below 5, the LLM is asked to note low confidence and the questionnaire data fills gaps.

### Output Validation

The LLM response is parsed and validated with Zod:

```typescript
const LLMAnalysisSchema = z.object({
  tone: z.object({
    primary: z.enum([
      'professional-casual', 'formal', 'provocative', 'educational',
      'inspirational', 'conversational', 'authoritative', 'storytelling'
    ]),
    secondary: z.enum([...]).nullable(),
    formality_score: z.number().min(0).max(1),
    confidence: z.number().min(0).max(1),
    evidence: z.array(z.string()).min(1),
  }),
  hooks: z.object({
    classifications: z.array(z.object({
      post_index: z.number(),
      type: z.enum([
        'question', 'bold_claim', 'story_opener', 'statistic',
        'contrarian', 'confession', 'list_preview', 'metaphor', 'direct_address'
      ]),
      hook_text: z.string(),
      confidence: z.number().min(0).max(1),
    })),
  }),
  ctas: z.object({
    classifications: z.array(z.object({
      post_index: z.number(),
      type: z.enum([
        'question', 'agree_disagree', 'share_prompt', 'tag_someone',
        'follow_for_more', 'comment_prompt', 'action_step', 'none'
      ]),
      cta_text: z.string().nullable(),
      confidence: z.number().min(0).max(1),
    })),
  }),
  vocabulary: z.object({
    signature_phrases: z.array(z.string()),
    industry_jargon: z.array(z.string()),
    power_words: z.array(z.string()),
    avoided_words: z.array(z.string()),
    reading_level: z.enum(['basic', 'intermediate', 'advanced']),
    confidence: z.number().min(0).max(1),
  }),
  writing_style: z.object({
    argument_pattern: z.string(),
    distinctive_traits: z.array(z.string()),
    ghostwriter_notes: z.array(z.string()),
  }),
});
```

If Zod validation fails, the job retries the Claude API call once with the validation error appended to the prompt. If it fails again, the profile is generated from statistical data only, and the user is notified that LLM analysis was incomplete.

---

## 7. Profile Generator

The profile generator merges the statistical analyzer output and the LLM analyzer output into a single `VoiceProfile`. When the two sources disagree, reconciliation rules determine the winner.

### Reconciliation Rules

| Field Category | Winner When Conflict | Rationale |
|---------------|---------------------|-----------|
| **Word counts** (avg, median, min, max) | Statistics | Exact counts are deterministic |
| **Emoji counts and frequency** | Statistics | Counting is deterministic |
| **Hashtag counts and frequency** | Statistics | Counting is deterministic |
| **Line counts and formatting density** | Statistics | Structural metrics are deterministic |
| **Tone** | LLM | Tone is subjective; LLM understands context |
| **Hook type classification** | LLM | Requires semantic understanding |
| **CTA type classification** | LLM | Requires semantic understanding |
| **Vocabulary** | LLM | Phrase detection needs context |
| **Reading level** | LLM | Statistical readability scores are unreliable for short-form content |

### Questionnaire Override

If the user's questionnaire answer contradicts the analysis:
- The analysis result takes precedence (demonstrated behavior > stated preference).
- The UI shows a note: "Your posts suggest X, but you indicated Y. Which is correct?"
- The user's choice is stored as the final answer with confidence 1.0.

### Confidence Scoring

Each section's confidence is calculated as:

```
section_confidence = base_confidence * sample_factor * agreement_factor
```

- **base_confidence**: The LLM's self-reported confidence for qualitative fields, or 0.9 for statistical fields (reduced from 1.0 because short LinkedIn posts can be noisy).
- **sample_factor**: `min(1.0, posts_analyzed / 20)`. Below 20 posts, confidence is proportionally reduced.
- **agreement_factor**: 1.0 if statistical and LLM agree, 0.7 if they disagree.

**overall_confidence**: Weighted average of all section confidences, where tone and hooks are weighted 2x (they have the most impact on generation quality).

---

## 8. Profile Versioning and Drift Detection

### Versioning

Every time the voice profile is updated (re-analysis, user edit, drift correction), a new version is created:

```typescript
// voice_profiles table
{
  id: bigint,
  user_id: bigint,
  version: number,           // auto-incrementing per user
  profile_data: jsonb,       // the VoiceProfile
  source: 'initial_analysis' | 'user_edit' | 'drift_correction' | 're_analysis',
  created_at: timestamptz,
  is_active: boolean,        // only one active per user
}
```

Users can view past versions and revert to any prior version.

### Drift Detection

**Problem**: A user's writing style evolves over time. After months of use, the original voice profile may no longer accurately represent their current voice.

**Solution**: Automatic drift detection runs after every 10 new posts are published.

**Algorithm**:

1. Collect the 10 most recent published posts.
2. Run the statistical analyzer on this batch.
3. Compare each statistical metric against the active voice profile.
4. Calculate a **drift score**:

```typescript
function calculateDriftScore(
  current: VoiceProfile,
  recent: StatisticalAnalysis
): number {
  const deltas = [
    Math.abs(current.structure.avg_word_count - recent.avg_word_count) / current.structure.avg_word_count,
    Math.abs(current.emoji.avg_per_post - recent.avg_emojis_per_post) / Math.max(current.emoji.avg_per_post, 0.1),
    Math.abs(current.hashtags.avg_per_post - recent.avg_hashtags_per_post) / Math.max(current.hashtags.avg_per_post, 0.1),
    // ... additional metrics
  ];

  return deltas.reduce((sum, d) => sum + d, 0) / deltas.length;
}
```

5. If drift score > **0.3** (30% average deviation), trigger a drift notification:
   - In-app: "Your writing style seems to have evolved. Would you like to update your voice profile?"
   - Email: Weekly report includes a drift warning.
6. If the user confirms, a full re-analysis is triggered (both statistical and LLM) using recent posts + historical posts.

**Threshold rationale**: 0.3 was chosen because LinkedIn writing naturally varies post-to-post. A threshold below 0.2 would produce too many false positives; above 0.4 would miss genuine shifts.

---

## 9. Quality Scoring

Quality scoring validates that generated content matches the user's voice profile. It runs as part of the content generation pipeline (see content-pipeline-design.md) but is designed and maintained by the voice engine team.

### 2-Tier Architecture

#### Tier 1: Statistical Pre-Check (Free)

Runs instantly on every generated post before it enters the review queue.

```typescript
interface StatisticalQualityCheck {
  word_count_in_range: boolean;     // within profile's min-max
  emoji_count_in_range: boolean;    // +/- 1 from profile avg
  hashtag_count_in_range: boolean;  // +/- 1 from profile avg
  line_break_style_match: boolean;  // matches profile density
  hook_present: boolean;            // first line is not a continuation
  cta_present: boolean;             // last lines contain question/imperative
  score: number;                    // 0-100
  passed: boolean;                  // score >= 60
}
```

Scoring weights:
- Word count in range: 25 points
- Formatting match: 20 points
- Hook present: 20 points
- CTA present: 15 points
- Emoji match: 10 points
- Hashtag match: 10 points

A post must score >= 60 to pass Tier 1. Failed posts are regenerated automatically (up to 2 retries).

#### Tier 2: LLM Comparison (~$0.01 per check)

Runs only when:
- The user has explicitly enabled "strict voice matching" in settings.
- A post passes Tier 1 but was previously regenerated (indicates potential quality issues).
- Periodic sampling: 1 in 10 posts for continuous calibration.

The LLM compares the generated post against 3-5 of the user's highest-engagement original posts:

```
Compare this generated post against the author's original posts.

GENERATED POST:
{generated_post}

ORIGINAL POSTS (same author):
{original_post_1}
{original_post_2}
{original_post_3}

Rate the voice match on these dimensions (0.0 to 1.0):
1. Tone consistency
2. Vocabulary match
3. Structural similarity
4. Hook style match
5. Overall "sounds like the same person"

If the overall score is below 0.7, explain what is different and how to fix it.
```

---

## 10. Edge Cases

### Case 1: 0 Posts (New User, No LinkedIn History)

**Situation**: User has never posted on LinkedIn. No posts to analyze.

**Strategy**:
1. Rely entirely on the onboarding questionnaire.
2. Ask the user to provide 2-3 example posts (from other platforms, or written on the spot).
3. If no examples: seed the profile from the questionnaire with low confidence (0.3-0.4 on all fields).
4. Generate the first 3-5 posts with explicit diversity: vary tone, hook types, and formats.
5. After the user approves/edits these initial posts, re-run analysis on the approved versions to build a data-driven profile.
6. Show a prominent "Your voice profile is still learning. It will improve after 10+ posts." banner.

### Case 2: Inconsistent Style

**Situation**: User has posts that vary wildly in style (e.g., some formal thought-leadership, some casual memes, some long stories).

**Strategy**:
1. The statistical analyzer will show high standard deviation on word count and formatting metrics.
2. The LLM analyzer is prompted to identify if there are distinct "modes" of writing.
3. If 2+ distinct modes are detected:
   - Present both modes to the user: "We detected two writing styles. Which do you want to use?"
   - Store the selected mode as the primary profile.
   - Optionally store the secondary mode for "format switching" (e.g., long-form stories on Tuesdays, short hot-takes on Fridays).

### Case 3: Multilingual Content

**Situation**: User posts in multiple languages (e.g., English and Spanish).

**Strategy**:
1. Language detection runs on each post using a lightweight model (or character-set heuristics for common languages).
2. Posts are grouped by language.
3. Analysis runs on the primary language only (the one with the most posts).
4. A note is shown: "We detected posts in {languages}. Your voice profile is based on your {primary_language} posts."
5. Future: Support separate voice profiles per language.

### Case 4: Very Short Posts Only

**Situation**: User only posts 1-3 sentence hot takes. There is not enough text for robust statistical analysis.

**Strategy**:
1. Lower the minimum word count threshold for inclusion (from 20 to 10 words).
2. Increase weight on the questionnaire (from 0.4 to 0.6).
3. Flag the profile as "limited data" and reduce confidence scores proportionally.
4. Prompt the LLM with a note: "These posts are very short. Focus on tone and vocabulary over structural patterns."

### Case 5: Reposts With Minimal Commentary

**Situation**: Many of the user's "posts" are reshares of others' content with a 1-2 sentence comment.

**Strategy**:
1. The cleaner identifies reshares by detecting common reshare patterns ("Great post by @X", URLs in the first line).
2. Reshares are excluded from analysis unless the user's commentary is >= 30 words.
3. If > 70% of posts are reshares, warn the user: "Most of your LinkedIn activity is reshares. We'll need more original content or manual samples to build your voice profile."

---

## 11. File Structure

```
apps/server/src/modules/voice/
├── types.ts                    # VoiceProfile, AnalysisSample, all type definitions
├── collector.ts                # Fetches posts from all input sources
├── cleaner.ts                  # Normalizes, deduplicates, annotates posts
├── statistical-analyzer.ts     # Deterministic metric extraction
├── llm-analyzer.ts             # Claude API integration, batching, Zod validation
├── profile-generator.ts        # Merges statistical + LLM into VoiceProfile
├── profile-diff.ts             # Compares two profiles, calculates drift score
├── quality-scorer.ts           # Tier 1 (statistical) + Tier 2 (LLM) quality checks
├── router.ts                   # tRPC router for voice module
├── service.ts                  # Business logic orchestration
├── prompts/
│   ├── voice-analysis.ts       # System + user prompt templates for analysis
│   ├── quality-check.ts        # Prompt template for Tier 2 quality scoring
│   └── drift-analysis.ts       # Prompt template for drift detection LLM pass
└── __tests__/
    ├── collector.test.ts
    ├── cleaner.test.ts
    ├── statistical-analyzer.test.ts
    ├── llm-analyzer.test.ts
    ├── profile-generator.test.ts
    ├── profile-diff.test.ts
    └── quality-scorer.test.ts
```

---

## 12. Cost Analysis

### Per-User Voice Analysis Cost

| Operation | API Calls | Input Tokens | Output Tokens | Cost (Claude Sonnet) |
|-----------|-----------|-------------|---------------|---------------------|
| Initial analysis (50 posts) | 3 batches | ~15,000 | ~3,000 | ~$0.06 |
| Drift detection (stats only) | 0 | 0 | 0 | $0.00 |
| Drift re-analysis (20 posts) | 1 batch | ~6,000 | ~2,000 | ~$0.02 |
| Quality check Tier 2 (per post) | 1 | ~2,000 | ~500 | ~$0.01 |

### Monthly Cost at Scale

| Users | Initial Analyses/mo | Drift Re-analyses/mo | Tier 2 Checks/mo | Total Voice Engine Cost |
|-------|--------------------|--------------------|------------------|----------------------|
| 1,000 | 100 (new users) | 50 | 2,000 | ~$30/mo |
| 10,000 | 1,000 | 500 | 20,000 | ~$300/mo |
| 100,000 | 10,000 | 5,000 | 200,000 | ~$3,000/mo |

Voice engine costs are a small fraction of total AI costs (content generation is ~10x more expensive due to volume).
