# Auto-Linked: Content Generation Pipeline Design

**Version:** 1.0
**Date:** 2026-04-09
**Status:** Draft

---

## Table of Contents

1. [Overview](#1-overview)
2. [Content Pillars](#2-content-pillars)
3. [Content Calendar](#3-content-calendar)
4. [Generation Pipeline](#4-generation-pipeline)
5. [Prompt Architecture](#5-prompt-architecture)
6. [Hook Type Rotation](#6-hook-type-rotation)
7. [Review Queue](#7-review-queue)
8. [Media Pipeline](#8-media-pipeline)
9. [Trending Topics](#9-trending-topics)
10. [Quality Check](#10-quality-check)
11. [Cost Analysis](#11-cost-analysis)

---

## 1. Overview

The content generation pipeline transforms a user's voice profile and content strategy into a steady stream of LinkedIn posts that sound like the user wrote them. It runs as a combination of scheduled BullMQ jobs (weekly batch generation) and on-demand triggers (manual regeneration, filling gaps).

Key design principles:
- **Voice fidelity first**: A post that does not sound like the user is worse than no post. Quality checks enforce this.
- **Strategic variety**: Rotate pillars, hooks, formats, and topics to prevent monotony.
- **Cost awareness**: Claude API calls are the dominant cost. Batch where possible, cache reusable context, and only generate media after user approval.
- **User control**: The user always has the final say. Auto-publish is off by default. Every post goes through the review queue.

---

## 2. Content Pillars

### Definition

Content pillars are the 3-5 topic areas that define a user's LinkedIn presence. Each pillar represents a domain of expertise or interest that the user wants to be known for.

Examples for a startup founder:
1. **Startup Lessons** (weight: 0.30) -- what I've learned building my company
2. **Leadership** (weight: 0.25) -- managing teams, hiring, culture
3. **Industry Trends** (weight: 0.20) -- commentary on SaaS / AI / fintech
4. **Productivity** (weight: 0.15) -- tools, habits, systems
5. **Personal Growth** (weight: 0.10) -- career reflections, mentorship

### Data Model

```typescript
interface ContentPillar {
  id: string;
  user_id: string;
  name: string;                    // "Startup Lessons"
  description: string;             // "Stories and lessons from building my company"
  weight: number;                  // 0.0-1.0, all pillars sum to 1.0
  keywords: string[];              // topic keywords for context gathering
  example_topics: string[];        // specific topic ideas
  performance_score: number;       // rolling 30-day avg engagement (0.0-1.0)
  posts_generated: number;         // total posts generated for this pillar
  posts_published: number;         // total posts published
  last_used_at: string | null;     // when this pillar was last used for generation
  created_at: string;
  updated_at: string;
}
```

### Weighted Rotation

Pillar selection for each post follows a **weighted rotation with recency penalty**:

```typescript
function selectPillar(pillars: ContentPillar[]): ContentPillar {
  const now = Date.now();

  const scored = pillars.map(p => {
    const baseWeight = p.weight;

    // Recency penalty: reduce weight if used recently
    const hoursSinceLastUse = p.last_used_at
      ? (now - new Date(p.last_used_at).getTime()) / 3_600_000
      : 168; // 1 week if never used
    const recencyMultiplier = Math.min(1.0, hoursSinceLastUse / 72);

    const finalScore = baseWeight * recencyMultiplier;
    return { pillar: p, score: finalScore };
  });

  // Weighted random selection
  const totalScore = scored.reduce((sum, s) => sum + s.score, 0);
  let random = Math.random() * totalScore;
  for (const { pillar, score } of scored) {
    random -= score;
    if (random <= 0) return pillar;
  }
  return scored[0].pillar;
}
```

### Performance Tracking

Each pillar's `performance_score` is a rolling 30-day average of normalized engagement scores from published posts in that pillar. Updated after each analytics fetch.

### Rebalancing Suggestions

After 30 days of analytics data, the system generates rebalancing suggestions:

- If a pillar consistently outperforms others (>2x avg engagement), suggest increasing its weight.
- If a pillar consistently underperforms (<0.5x avg engagement), suggest decreasing its weight or refreshing its approach.
- Suggestions are shown in the weekly report and in the Pillars settings page. The user must manually approve weight changes.

---

## 3. Content Calendar

### Weekly Template

The content calendar defines a repeating weekly template. Each day maps to a pillar and format combination.

```typescript
interface CalendarSlot {
  id: string;
  user_id: string;
  day_of_week: 0 | 1 | 2 | 3 | 4 | 5 | 6;  // 0=Sunday
  pillar_id: string | null;                     // null = skip this day
  format: PostFormat;
  scheduled_time: string;                       // "09:00" UTC
  is_active: boolean;
}

type PostFormat = 'text' | 'image' | 'carousel' | 'poll';
```

Default template for a 5x/week poster:

| Day | Pillar | Format | Time |
|-----|--------|--------|------|
| Monday | Pillar A (Industry Trends) | Text | 9:00 AM |
| Tuesday | Pillar B (Personal Story) | Image | 8:30 AM |
| Wednesday | Pillar C (How-to / Tactical) | Carousel | 10:00 AM |
| Thursday | Pillar A (Hot Take / Opinion) | Text | 9:00 AM |
| Friday | Pillar D (Community Question) | Poll | 8:00 AM |
| Saturday | -- | -- | -- |
| Sunday | -- | -- | -- |

### Format Rotation and Limits

LinkedIn's algorithm rewards variety. The calendar enforces format distribution limits per week:

| Format | Max Per Week | Rationale |
|--------|-------------|-----------|
| **Text** | Unlimited | Bread and butter; always available |
| **Image** | 3 | Image generation has cost; LinkedIn shows text+image differently |
| **Carousel** | 2 | Carousel PDFs take more prep; LinkedIn limits carousel engagement if overused |
| **Poll** | 1 | LinkedIn penalizes frequent polls; they also feel low-effort |

### Topic Selection Algorithm

When generating a post for a calendar slot, the topic is selected via a scoring algorithm:

```
topic_score = (pillar_relevance * 0.35)
            + (format_fit * 0.20)
            + (trending_boost * 0.15)
            + (performance_prediction * 0.20)
            - (repetition_penalty * 0.10)
```

| Factor | Calculation | Range |
|--------|------------|-------|
| **pillar_relevance** | How well the topic matches the pillar's keywords and description | 0.0-1.0 |
| **format_fit** | How well the topic suits the assigned format (e.g., step-by-step advice fits carousel, opinions fit text) | 0.0-1.0 |
| **trending_boost** | Whether the topic overlaps with current trending topics in the user's industry | 0.0-1.0 (0 if not trending) |
| **performance_prediction** | Based on past engagement for similar topics/formats/hooks in this pillar | 0.0-1.0 |
| **repetition_penalty** | How recently a similar topic was generated (Jaccard similarity with recent posts) | 0.0-1.0 (high = bad) |

Topic candidates are either:
1. Generated by Claude from the pillar description + current context.
2. Pulled from the trending topics cache.
3. Suggested by the user in the pillar's `example_topics` list.

---

## 4. Generation Pipeline

The pipeline runs as a BullMQ job (`generate-content` queue) and follows 7 steps.

```
┌──────────┐   ┌──────────┐   ┌──────────┐   ┌──────────┐   ┌──────────┐   ┌──────────┐   ┌──────────┐
│ 1. Select│──▶│ 2. Gather│──▶│ 3. Gen   │──▶│ 4. Apply │──▶│ 5. Media │──▶│ 6. QC    │──▶│ 7. Queue │
│ Pillar + │   │ Context  │   │ via      │   │ Voice    │   │ Suggest  │   │ Check    │   │ Insert   │
│ Format   │   │          │   │ Claude   │   │ Profile  │   │          │   │          │   │          │
└──────────┘   └──────────┘   └──────────┘   └──────────┘   └──────────┘   └──────────┘   └──────────┘
```

### Step 1: Select Pillar + Format + Angle

- Pillar selected via weighted rotation (Section 2).
- Format determined by calendar slot.
- Angle (specific topic/perspective) selected via topic scoring algorithm (Section 3).
- Hook type selected via least-recently-used rotation (Section 6).

### Step 2: Gather Context

Assemble all context the LLM needs:

```typescript
interface GenerationContext {
  voice_profile: VoiceProfile;
  pillar: ContentPillar;
  format: PostFormat;
  hook_type: HookType;
  angle: string;                        // specific topic or perspective
  trending_topics: TrendingTopic[];     // 0-3 relevant trending items
  top_posts: string[];                  // 3-5 best-performing past posts (few-shot examples)
  negative_examples: string[];          // 2-3 skipped or low-engagement posts
  recent_posts: string[];               // last 5 published posts (to avoid repetition)
  user_name: string;
  user_role: string;
  user_industry: string;
}
```

### Step 3: Generate via Claude

Send the assembled prompt (see Section 5) to Claude API. The model returns a structured JSON response:

```typescript
interface GeneratedPost {
  content: string;          // full post text with formatting
  hook: string;             // first 1-2 lines extracted
  hashtags: string[];       // 3-5 suggested hashtags
  media_recommendation: {
    type: 'none' | 'image' | 'carousel';
    description: string;    // what the image/carousel should show
    alt_text: string;       // accessibility text
  };
  strategy_note: string;    // brief explanation of why this post was written this way
}
```

### Step 4: Apply Voice Profile Constraints

Post-generation validation and adjustment:

1. **Word count**: If outside the profile's min-max range, ask Claude to shorten/lengthen.
2. **Emoji**: If emoji count does not match profile frequency, add/remove emojis.
3. **Hashtags**: Replace suggested hashtags with user's preferred tags (from profile) where relevant.
4. **Formatting**: Ensure line break style matches profile (single vs. double).
5. **Banned words**: Check against user's `avoided_words` list. Replace if found.

These adjustments are deterministic string operations, not additional Claude API calls, except for length adjustment which requires a follow-up call.

### Step 5: Media Suggestion

- For **text** format: No media, or recommend "text-only works best for this post."
- For **image** format: Generate a description for later AI image generation. Do not generate the image yet (cost optimization -- only generate after user approval).
- For **carousel** format: Generate slide outlines (title + 3-5 bullet points per slide, 5-8 slides). Carousel PDF generation happens after approval.
- For **poll** format: Generate poll question + 4 options.

### Step 6: Quality Check

Run the Tier 1 statistical quality check (defined in voice-engine-design.md, Section 9). The post must score >= 60 to pass.

If the post fails:
1. Log the failure reason.
2. Regenerate the post (back to Step 3) with the failure reason appended to the prompt.
3. Maximum 2 automatic retries. After 3 total failures, insert the best-scoring attempt into the queue with a "low quality" flag visible to the user.

### Step 7: Queue Insert

Insert the post into the database:

```typescript
{
  user_id: string,
  content: string,
  hook: string,
  pillar_id: string,
  format: PostFormat,
  hook_type: HookType,
  media_suggestion: MediaSuggestion | null,
  status: 'draft',
  quality_score: number,
  scheduled_at: DateTime,       // from calendar slot
  generation_context: jsonb,    // stored for debugging and regeneration
  regeneration_count: 0,
  strategy_note: string,
  created_at: now(),
}
```

Enqueue a `send-notification` job to remind the user to review.

---

## 5. Prompt Architecture

### System Prompt

```
You are a LinkedIn ghostwriter. You write posts that sound exactly like {user_name}, 
a {user_role} in {user_industry}.

VOICE PROFILE:
{voice_profile_json}

CRITICAL RULES:
1. Match the tone precisely. This author writes in a {tone.primary} style with 
   {tone.formality_score} formality.
2. Use {formatting.line_break_style} line breaks between paragraphs.
3. Target {structure.target_word_count} words (+/- 20%).
4. Use {emoji.frequency} emojis ({emoji.avg_per_post} per post on average). 
   Preferred emojis: {emoji.preferred_emojis}.
5. Include {hashtags.avg_per_post} hashtags at the {hashtags.position} of the post.
6. Start with a {hook_type} hook.
7. End with a {cta_type} CTA.
8. Use the author's signature phrases naturally: {vocabulary.signature_phrases}.
9. DO NOT use these words/phrases: {vocabulary.avoided_words}.
10. DO NOT sound like generic AI. No "In today's fast-paced world", "Let's dive in", 
    "game-changer", "leverage", "unlock", or other overused AI phrases.
11. DO NOT use markdown formatting. LinkedIn does not render markdown. Use Unicode 
    bold (𝗯𝗼𝗹𝗱) for emphasis if the author uses it.
12. Every line break in your output will appear as-is on LinkedIn. Format accordingly.
```

### User Prompt

```
Write a LinkedIn post for {user_name}.

ASSIGNMENT:
- Pillar: {pillar.name} — {pillar.description}
- Topic/Angle: {angle}
- Format: {format}
- Hook type: {hook_type}

CONTEXT:
- Trending topics (use if relevant, ignore if not): {trending_topics}
- Recent posts to AVOID repeating: {recent_post_summaries}

EXAMPLES OF THE AUTHOR'S BEST POSTS (match this style):
---
{top_post_1}
---
{top_post_2}
---
{top_post_3}
---

NEGATIVE EXAMPLES (the author wants to AVOID this style):
---
{negative_example_1}
---
{negative_example_2}
---

{format_specific_guidance}

Output as JSON:
{
  "content": "the full post text with line breaks",
  "hook": "the first 1-2 lines",
  "hashtags": ["tag1", "tag2", "tag3"],
  "media_recommendation": {
    "type": "none" | "image" | "carousel",
    "description": "what the visual should show",
    "alt_text": "accessibility description"
  },
  "strategy_note": "brief explanation of the strategy behind this post"
}
```

### Format-Specific Guidance

Appended to the user prompt based on format:

**Text post:**
```
FORMAT GUIDANCE (Text):
- No media needed. The words do all the work.
- Optimize the hook for "see more" clicks (LinkedIn truncates after ~3 lines).
- Use white space aggressively — short paragraphs, single-sentence lines.
```

**Image post:**
```
FORMAT GUIDANCE (Image):
- Write the post text assuming an image will appear above it.
- The image should complement the text, not duplicate it.
- In media_recommendation, describe the image in detail: subject, style, colors, mood.
- The post text should make sense even without the image (users on poor connections may not load it).
```

**Carousel post:**
```
FORMAT GUIDANCE (Carousel):
- Structure the content as a slide deck (5-8 slides).
- Slide 1: Title slide with a compelling headline (this is the hook).
- Slides 2-7: One key point per slide. 3-5 bullet points max per slide. Large text.
- Final slide: CTA slide — follow, comment, share.
- In media_recommendation, output the carousel as:
  {
    "type": "carousel",
    "slides": [
      { "title": "...", "bullets": ["...", "..."] },
      ...
    ]
  }
- Write accompanying post text (3-5 sentences) that teases the carousel content.
```

**Poll post:**
```
FORMAT GUIDANCE (Poll):
- Write a short post text (2-4 sentences) that frames the poll question.
- The poll question should be clear and opinionated to drive engagement.
- Provide exactly 4 poll options. Each option should be 1-5 words.
- In media_recommendation, output:
  {
    "type": "poll",
    "question": "...",
    "options": ["...", "...", "...", "..."]
  }
```

---

## 6. Hook Type Rotation

### The 9 Hook Types

| Type | Pattern | Example |
|------|---------|---------|
| **question** | Ask something that makes the reader stop | "Have you ever had a meeting that could've been an email?" |
| **bold_claim** | State something provocative or surprising | "Most startup advice is wrong." |
| **story_opener** | Begin a narrative | "Last Tuesday, I almost quit." |
| **statistic** | Lead with a number | "73% of B2B buyers check LinkedIn before purchasing." |
| **contrarian** | Challenge conventional wisdom | "Unpopular opinion: hustle culture is a scam." |
| **confession** | Vulnerability or admission | "I'll be honest — I have no idea what I'm doing half the time." |
| **list_preview** | Promise a structured list | "5 things I wish I knew before raising a Series A:" |
| **metaphor** | Use an unexpected comparison | "Building a product is like cooking dinner for 100 people." |
| **direct_address** | Speak directly to a specific audience | "If you're a first-time founder, read this." |

### Least-Recently-Used Selection

To prevent hook repetition, the pipeline tracks which hook types have been used recently and selects the least-recently-used type that is compatible with the voice profile.

```typescript
function selectHookType(
  voiceProfile: VoiceProfile,
  recentHookTypes: Array<{ type: HookType; used_at: string }>
): HookType {
  const preferred = voiceProfile.hooks.preferred_types;
  const distribution = voiceProfile.hooks.distribution;

  // Build a priority list: all hook types sorted by least recent use
  const allTypes: HookType[] = [
    'question', 'bold_claim', 'story_opener', 'statistic',
    'contrarian', 'confession', 'list_preview', 'metaphor', 'direct_address'
  ];

  const scored = allTypes.map(type => {
    const lastUsed = recentHookTypes.find(r => r.type === type);
    const hoursSince = lastUsed
      ? (Date.now() - new Date(lastUsed.used_at).getTime()) / 3_600_000
      : 999;

    // Prefer types the user naturally uses (from voice profile)
    const profileWeight = distribution[type] ?? 0;

    // Score: higher = more likely to be selected
    const score = (hoursSince / 168) * 0.6 + profileWeight * 0.4;

    return { type, score };
  });

  // Filter to types that appear in the user's profile (>= 5% distribution)
  // unless all types are below threshold (then use all)
  const viable = scored.filter(s => (distribution[s.type] ?? 0) >= 0.05);
  const candidates = viable.length >= 3 ? viable : scored;

  // Weighted random from top 3 candidates
  candidates.sort((a, b) => b.score - a.score);
  const top3 = candidates.slice(0, 3);
  const totalScore = top3.reduce((sum, s) => sum + s.score, 0);
  let random = Math.random() * totalScore;
  for (const { type, score } of top3) {
    random -= score;
    if (random <= 0) return type;
  }
  return top3[0].type;
}
```

---

## 7. Review Queue

### Workflow States

```
                 ┌──────────────────────────────────────────────────────────┐
                 │                                                          │
                 ▼                                                          │
  ┌──────────┐     ┌──────────┐     ┌───────────┐     ┌───────────┐      │
  │  draft   │────▶│ approved │────▶│ scheduled │────▶│ published │      │
  └──────────┘     └──────────┘     └───────────┘     └───────────┘      │
       │                                                                   │
       ├────────────────────────────────────────────────────────────────────┘
       │  (regenerate → new draft)
       │
       └──────▶ ┌──────────┐
                │ skipped  │
                └──────────┘
```

### User Actions

| Action | From Status | To Status | What Happens |
|--------|------------|-----------|--------------|
| **Approve** | draft | approved | Post is locked and scheduled for publish |
| **Edit** | draft | draft (updated) | User modifies content in Tiptap editor, then approves |
| **Regenerate** | draft | draft (new) | Original is archived; new post generated with optional feedback |
| **Skip** | draft | skipped | Post is removed from queue; does not count toward weekly quota |

### Batch Review

For users who prefer efficiency over per-post review:

- The queue shows all pending posts in a list view.
- **Bulk approve**: Select multiple posts and approve all at once.
- **Keyboard shortcuts**:
  - `A` — Approve current post and advance
  - `S` — Skip current post and advance
  - `R` — Open regenerate dialog
  - `E` — Open editor for current post
  - `J` / `K` — Navigate between posts (vim-style)

### Regeneration With Feedback

When a user clicks "Regenerate," they can provide optional guidance:

```typescript
interface RegenerationRequest {
  post_id: string;
  feedback: string | null;   // "Make it shorter", "More personal", "Use a question hook"
  preserve_hook: boolean;     // keep the hook, regenerate the body
  preserve_cta: boolean;      // keep the CTA, regenerate the rest
}
```

The feedback is injected into the prompt as an additional instruction:

```
The user reviewed the previous version and wants changes:
FEEDBACK: {feedback}
{preserve_hook ? "KEEP the same hook style and opening." : ""}
{preserve_cta ? "KEEP the same CTA." : ""}

Previous version (for reference):
{previous_content}
```

**Maximum 3 regenerations** per post. After 3, the user must either approve, edit manually, or skip. This prevents infinite regeneration loops (which waste API credits).

### Auto-Publish Rules

Auto-publish is **off by default**. When enabled:

1. User sets an auto-publish window (e.g., 24 hours).
2. If a draft post is not reviewed within the window, it is automatically approved and published.
3. Auto-published posts are flagged as `auto_approved: true` in the database.
4. Users receive a notification before auto-publish: "Your post will auto-publish in 2 hours. Review now?"
5. Auto-publish only applies to posts that pass quality check with score >= 75 (stricter than the standard 60 threshold).

---

## 8. Media Pipeline

### Architecture

Media is generated **after** the user approves the post, not during content generation. This is a critical cost optimization: if a user skips or regenerates a post, no media generation cost is incurred.

```
Post approved with media_suggestion
  → Media generation job enqueued
  → Worker generates/fetches media
  → Media uploaded to Cloudflare R2
  → Post updated with media_url
  → Post moves to scheduled status
```

### AI Image Generation

- **Provider**: DALL-E 3 (primary) or Flux (fallback).
- **Input**: The `media_recommendation.description` from the generated post.
- **Output**: 1024x1024 image, resized to LinkedIn's recommended 1200x627 for link posts or 1080x1080 for square format.
- **Cost**: ~$0.04 per image (DALL-E 3 standard quality).
- **Prompt template**:
  ```
  Professional LinkedIn post image. {description}. 
  Clean, modern design. No text overlays. High contrast. 
  Corporate-friendly. Photorealistic or clean illustration style.
  ```

### Carousel PDF Generation

- **Input**: Slide data from `media_recommendation.slides`.
- **Output**: PDF document where each page is a slide.
- **Process**:
  1. Apply user-selected template (3-5 templates available: corporate, casual, bold, minimal, dark).
  2. Render slides using a headless PDF library (e.g., `@react-pdf/renderer`).
  3. Each slide: title (large), bullet points (medium), brand colors, user's name + avatar on first/last slide.
  4. Output: PDF uploaded to R2, thumbnail generated for preview.
- **LinkedIn upload**: Carousel is uploaded as a document (PDF) via the LinkedIn document API.

### Stock Photo Search

For users who prefer stock photos over AI-generated images:

- **Providers**: Unsplash API (free tier: 50 req/hr) and Pexels API (free tier: 200 req/hr).
- **Search query**: Derived from post content keywords + pillar keywords.
- **Selection**: Show top 6 results; user picks one. If auto-selection is enabled, pick the highest-relevance result.
- **Attribution**: Unsplash requires attribution. Store photographer name and link; append as a comment on the LinkedIn post.

### LinkedIn Image Sizing

| Content Type | Recommended Size | Aspect Ratio |
|-------------|-----------------|--------------|
| Single image | 1200 x 627 | 1.91:1 |
| Square image | 1080 x 1080 | 1:1 |
| Carousel/document | 1080 x 1080 per page | 1:1 |
| Profile-linked image | 1200 x 628 | 1.91:1 |

Images are resized server-side using `sharp` before upload to R2.

---

## 9. Trending Topics

### Data Sources

| Source | Update Frequency | Data Type | API |
|--------|-----------------|-----------|-----|
| **Google Trends** | Every 4 hours | Rising search terms | Unofficial API / scraping |
| **Hacker News** | Every 2 hours | Top stories in tech | Official API (free) |
| **RSS Feeds** | Every 1 hour | Industry news per pillar | User-configurable feeds |
| **News API** | Every 4 hours | Headlines by category | newsapi.org (free tier: 100 req/day) |

### Trending Topic Schema

```typescript
interface TrendingTopic {
  id: string;
  title: string;
  summary: string;           // 1-2 sentence description
  source: string;             // "google_trends" | "hacker_news" | "rss" | "news_api"
  source_url: string;
  relevance_tags: string[];   // industry tags for matching to pillars
  discovered_at: string;
  expires_at: string;         // 72 hours after discovery
  engagement_potential: number;  // 0.0-1.0 estimated
}
```

### Evergreen vs. Timely Balance

The content calendar targets a **70% evergreen / 30% timely** split:

- **Evergreen posts** (70%): Topics that are always relevant. Driven by pillar descriptions and user's expertise. These posts have a long shelf life and can be recycled/adapted.
- **Timely posts** (30%): React to trending topics, industry news, or current events. These posts have a short shelf life (72 hours) but higher engagement potential because of recency.

The topic selection algorithm (Section 3) applies a `trending_boost` multiplier to timely topics, but the overall calendar enforces the 70/30 split by limiting timely slots to 1-2 per week.

### Topic Expiry

Trending topics expire after 72 hours. This prevents stale news from being used in posts. The `expires_at` field is checked during topic selection; expired topics are excluded.

### Relevance Matching

Trending topics are matched to user pillars via keyword overlap:

```
relevance_score = jaccard_similarity(topic.relevance_tags, pillar.keywords)
```

Only topics with `relevance_score >= 0.2` are considered for a given pillar. This prevents forcing irrelevant trending topics into a user's content.

---

## 10. Quality Check

Every generated post passes through a quality check before entering the review queue. The check runs as a deterministic function (no API calls) and produces a pass/fail result with a score.

### Check Dimensions

| Check | Weight | What It Detects |
|-------|--------|----------------|
| **Repetition** | 15 | Jaccard similarity > 0.4 with any post in last 14 days |
| **Tone match** | 20 | Word choice and sentence structure consistent with voice profile |
| **Sensitivity** | 10 | Potentially controversial content (politics, religion, explicit) |
| **Generic AI detection** | 20 | Overused AI phrases: "In today's fast-paced world", "game-changer", "Let's dive in", "leverage synergies", "unlock potential" |
| **Hook effectiveness** | 15 | Hook is present, matches assigned type, is < 20 words |
| **CTA presence** | 10 | Last 1-3 lines contain a question or call to action |
| **Length compliance** | 10 | Word count within voice profile's target range |

### Scoring

```typescript
interface QualityCheckResult {
  score: number;           // 0-100
  passed: boolean;         // score >= 60
  checks: {
    repetition: { score: number; details: string };
    tone_match: { score: number; details: string };
    sensitivity: { score: number; details: string };
    ai_detection: { score: number; details: string };
    hook_effectiveness: { score: number; details: string };
    cta_presence: { score: number; details: string };
    length_compliance: { score: number; details: string };
  };
}
```

### Generic AI Detection

A blocklist of phrases that make content sound like generic AI:

```typescript
const AI_BLOCKLIST = [
  "in today's fast-paced world",
  "in today's digital landscape",
  "let's dive in",
  "let's dive deep",
  "game-changer",
  "game changer",
  "leverage",
  "synergy",
  "synergies",
  "unlock your potential",
  "it's not about X, it's about Y",
  "here's the truth",
  "here's the thing nobody tells you",
  "buckle up",
  "spoiler alert",
  "hot take",  // only if not in user's voice profile
  "at the end of the day",
  "the bottom line",
  "without further ado",
  "that being said",
  "needless to say",
  "it goes without saying",
  "think about it",
  "let that sink in",
];
```

Each phrase found deducts 5 points from the `ai_detection` check (max deduction: 20 points). Phrases that appear in the user's own posts (from voice analysis) are exempted.

### Sensitivity Check

A lightweight check for potentially sensitive content:

- Political keywords and hot-button phrases.
- Religious references.
- Profanity (unlikely from Claude, but checked defensively).
- Demographic generalizations.

Sensitive posts are not blocked but flagged: the review queue shows a yellow warning icon so the user can review carefully.

### Pass/Fail Thresholds

| Score | Action |
|-------|--------|
| >= 80 | Pass — high quality. Eligible for auto-publish. |
| 60-79 | Pass — acceptable. Manual review required. |
| 40-59 | Fail — auto-retry (up to 2 retries). |
| < 40 | Fail — flag as "low quality," insert anyway, warn user. |

---

## 11. Cost Analysis

### Per-Post Generation Cost

| Step | API Calls | Input Tokens | Output Tokens | Cost (Claude Sonnet) |
|------|-----------|-------------|---------------|---------------------|
| Context gathering | 0 | 0 | 0 | $0.00 |
| Post generation | 1 | ~3,000 | ~800 | ~$0.012 |
| Voice constraint adjustment | 0-1 | ~1,500 | ~400 | ~$0.005 (if needed) |
| Quality check | 0 | 0 | 0 | $0.00 |
| Regeneration (if needed) | 0-1 | ~3,500 | ~800 | ~$0.013 (if needed) |
| **Total per post** | | | | **~$0.015 avg** |

### Per-Post Media Cost (When Applicable)

| Media Type | Cost | Notes |
|-----------|------|-------|
| AI image (DALL-E 3) | ~$0.04 | Standard quality |
| Carousel PDF | ~$0.00 | Server-side rendering, no API cost |
| Stock photo | $0.00 | Free API tiers |

### Monthly Cost at Scale

| Users | Posts/mo | Generation Cost | Media Cost (30% image) | Total Content Pipeline |
|-------|---------|----------------|----------------------|----------------------|
| 1,000 | 16,000 | ~$240 | ~$192 | ~$432/mo |
| 10,000 | 160,000 | ~$2,400 | ~$1,920 | ~$4,320/mo |
| 100,000 | 1,600,000 | ~$24,000 | ~$19,200 | ~$43,200/mo |

At $29/user/month, the content pipeline costs ~$0.43/user/month at 1K users (1.5% of revenue). Cost efficiency improves at scale due to prompt caching and batching optimizations.
