# Auto-Linked: AI LinkedIn Content Engine

## Product Requirements Document (PRD)

**Version:** 1.0
**Date:** 2026-04-09
**Status:** Draft

---

## 1. Problem Statement

Professionals know that consistent LinkedIn posting builds personal brand, generates leads, and opens opportunities. Yet 90%+ of professionals post inconsistently because:

- **Writer's block** — staring at a blank editor daily is exhausting
- **Voice inconsistency** — they sound different every time they try
- **Time cost** — researching topics, finding images, writing, editing, scheduling takes 30-60 min per post
- **No strategy** — they post randomly instead of building a coherent narrative
- **No feedback** — they don't know what works so they can't improve

Existing tools (Buffer, Hootsuite, Taplio) provide scheduling but not *thinking*. They don't learn your voice, don't build strategy, and don't adapt based on what works.

---

## 2. Product Vision

**Auto-Linked** is an AI ghostwriter that learns your LinkedIn voice, builds a content strategy around your expertise, and runs your posting engine on autopilot — with you in the approval seat.

**One-liner:** "Your LinkedIn, your voice, zero effort."

---

## 3. Target Users

### Primary: The Busy Professional
- Founders, consultants, VPs, senior engineers
- Know LinkedIn matters but don't have time
- Have posted before (some history exists)
- Willing to pay $20-50/month for time savings

### Secondary: The LinkedIn Beginner
- New to personal branding
- No posting history yet
- Needs more guidance on pillars and voice
- May need example-based onboarding

---

## 4. Core User Journey

```
[Onboard] --> [Connect LinkedIn] --> [Analyze Voice] --> [Define Strategy]
    --> [Generate Content Queue] --> [Review/Approve] --> [Auto-Publish]
    --> [Track Performance] --> [Adapt Strategy] --> [Loop]
```

### Phase 1: Onboarding & Voice Learning
1. User signs up
2. System asks structured questions:
   - What's your role/industry?
   - What topics do you want to be known for? (suggest 3-5 "content pillars")
   - What's your tone? (professional, casual, provocative, educational)
   - How often do you want to post? (daily, 3x/week, 5x/week)
   - Do you prefer short punchy posts or long stories?
3. User connects LinkedIn account (OAuth)
4. System fetches last 50-100 posts (if available)
5. AI analyzes: vocabulary, sentence structure, emoji usage, hashtag patterns, post length distribution, topic clusters, hook styles, CTA patterns
6. System generates a "Voice Profile" the user can review and tweak

### Phase 2: Content Strategy
1. System proposes a weekly content calendar:
   - Mon: Industry insight (Pillar A)
   - Tue: Personal story / lesson learned (Pillar B)
   - Wed: How-to / tactical advice (Pillar C)
   - Thu: Hot take / opinion (Pillar A)
   - Fri: Weekend reflection / community question (Pillar D)
2. User approves/modifies the calendar template
3. System identifies trending topics in user's industry (via news feeds, LinkedIn trending)

### Phase 3: Content Generation
1. System generates a week's worth of posts in advance
2. Each post includes:
   - **Hook** (first 2 lines — most critical for LinkedIn)
   - **Body** (the insight/story/advice)
   - **CTA** (engagement driver — question, agree/disagree, share prompt)
   - **Hashtags** (3-5 relevant, not spammy)
   - **Media suggestion** (AI-generated image, carousel outline, or "text-only recommended")
3. Posts land in a **Review Queue**

### Phase 4: Review & Approval
1. User opens daily review (web app, mobile, or email digest)
2. For each post, user can:
   - **Approve** — schedule as-is
   - **Edit** — modify and approve
   - **Regenerate** — "try again" with optional guidance
   - **Skip** — remove from queue
3. Auto-publish if user doesn't review within configurable window (optional, off by default)

### Phase 5: Publishing
1. Post is published at optimal time (learned from user's audience engagement patterns)
2. If media is attached, system generates/sources it:
   - AI-generated images (via DALL-E, Flux, etc.)
   - Carousel PDFs (auto-generated from bullet points)
   - Stock photos (via Unsplash/Pexels API with proper attribution)
3. System posts via LinkedIn API (`w_member_social` scope)

### Phase 6: Analytics & Adaptation
1. System tracks per-post metrics (24h, 48h, 7d after posting):
   - Impressions
   - Reactions (like, celebrate, support, etc.)
   - Comments
   - Reposts
   - Profile views spike
2. Weekly performance report:
   - Best performing post
   - Worst performing post
   - Engagement trend (up/down/flat)
   - Pillar performance comparison
3. AI adapts:
   - More content like top performers
   - Less content like underperformers
   - Adjust posting times based on engagement windows
   - Refine hook styles that get more "see more" clicks

---

## 5. Feature Breakdown

### P0 — Must Have (MVP)

| Feature | Description |
|---------|-------------|
| **LinkedIn OAuth** | Connect account, fetch profile + past posts |
| **Voice Analysis** | Analyze writing style from past posts + questionnaire |
| **Content Pillars** | User defines 3-5 topic areas |
| **Post Generation** | AI generates posts in user's voice |
| **Review Queue** | Web UI to approve/edit/reject/regenerate posts |
| **Scheduling** | Set publish time per day of week |
| **LinkedIn Publishing** | Post text content via API |
| **Onboarding Flow** | Guided Q&A to set up voice + strategy |

### P1 — Should Have (v1.1)

| Feature | Description |
|---------|-------------|
| **Image Generation** | AI-generated images for posts |
| **Carousel Generator** | Auto-create PDF carousels from bullet points |
| **Basic Analytics** | Track impressions/reactions per post |
| **Performance Reports** | Weekly email digest of post performance |
| **Mobile Review** | Mobile-friendly review UI or Telegram/WhatsApp bot |
| **Trending Topics** | Suggest timely topics based on industry news |

### P2 — Nice to Have (v2.0)

| Feature | Description |
|---------|-------------|
| **Adaptive Strategy** | Auto-adjust content mix based on performance |
| **Comment Drafts** | AI-generated replies to comments on your posts |
| **A/B Hook Testing** | Generate 2 hooks, pick winner for next time |
| **Team Mode** | Ghostwrite for multiple team members |
| **Content Repurposing** | Turn blog posts / tweets / newsletters into LinkedIn posts |
| **Engagement Pod Alternative** | Smart notification to engage with peers' posts |

---

## 6. Technical Architecture

### High-Level Stack

```
Frontend:       Next.js (web app) + React Native or PWA (mobile)
Backend:        Node.js / Python (FastAPI)
AI Engine:      Claude API (content generation, voice analysis)
Database:       PostgreSQL (users, posts, analytics)
Queue:          Redis + BullMQ (scheduled publishing)
Storage:        S3 / Cloudflare R2 (images, carousels)
Auth:           NextAuth.js or Clerk (user auth)
LinkedIn:       LinkedIn Marketing API (OAuth + Publishing)
Image Gen:      DALL-E / Flux / Stable Diffusion API
Analytics:      LinkedIn API (organic stats endpoint)
```

### Key Technical Decisions

#### LinkedIn API Access
- Requires LinkedIn Marketing Developer Platform app
- Scope: `r_liteprofile`, `r_basicprofile`, `w_member_social`
- Rate limits: 100 requests/day per member for posting
- **Risk:** LinkedIn could revoke API access. Mitigation: also support "copy to clipboard" manual posting as fallback
- Fetching past posts: `r_organization_social` or scrape profile (with user consent, using their own cookies — legally gray, needs legal review)

#### Voice Profile Schema
```
{
  tone: "professional-casual" | "formal" | "provocative" | "educational",
  avg_post_length: number,        // words
  emoji_frequency: "none" | "light" | "heavy",
  hashtag_style: "none" | "minimal" | "aggressive",
  hook_patterns: string[],        // "Question", "Bold claim", "Story opener", etc.
  cta_patterns: string[],         // "What do you think?", "Share if you agree", etc.
  vocabulary_fingerprint: string,  // key phrases, industry jargon
  formatting: "dense" | "spaced" | "list-heavy",
  line_break_style: "single" | "double",
}
```

#### Content Generation Pipeline
```
1. Select pillar + format from content calendar
2. Gather context: trending topics, past performance data, voice profile
3. Generate post via Claude API with structured prompt
4. Apply voice profile constraints (length, tone, formatting)
5. Generate media suggestion
6. Insert into review queue with scheduled publish time
```

---

## 7. Data Model (Core Entities)

```
User
  - id, email, name, linkedin_id, oauth_tokens
  - voice_profile (JSON)
  - content_pillars (JSON array)
  - posting_schedule (JSON)
  - created_at, updated_at

Post
  - id, user_id
  - content (text)
  - hook (first 2 lines, extracted)
  - pillar (FK to content pillar)
  - format: "text" | "image" | "carousel" | "poll"
  - media_url (nullable)
  - status: "draft" | "approved" | "scheduled" | "published" | "skipped"
  - scheduled_at (datetime)
  - published_at (datetime, nullable)
  - linkedin_post_id (nullable)
  - created_at, updated_at

PostAnalytics
  - id, post_id
  - impressions, reactions, comments, reposts
  - snapshot_at (datetime — track over time)

ContentPillar
  - id, user_id
  - name, description
  - weight (how often to use, 0.0-1.0)
  - performance_score (rolling average)
```

---

## 8. LinkedIn API Integration Details

### OAuth Flow
1. User clicks "Connect LinkedIn"
2. Redirect to LinkedIn OAuth consent screen
3. Receive authorization code
4. Exchange for access token + refresh token
5. Store encrypted tokens in DB
6. Token refresh via background job before expiry

### Publishing Flow
1. At scheduled time, job picks up approved post
2. Call `POST https://api.linkedin.com/v2/ugcPosts` (or v2/posts for new API)
3. If media attached: upload via `registerUpload` → upload binary → include in post
4. Store `linkedin_post_id` for analytics tracking
5. If API fails: retry 3x with backoff, then notify user

### Analytics Fetching
1. Background job runs every 6 hours for posts < 7 days old
2. Call `GET /organizationalEntityShareStatistics` or equivalent personal endpoint
3. Store snapshot in PostAnalytics table
4. Aggregate for weekly reports

---

## 9. AI Prompt Architecture

### Voice Analysis Prompt
```
Input: 50 LinkedIn posts from user
Task: Extract writing patterns

Output:
- Dominant tone (with evidence)
- Hook style distribution
- Average post structure
- Emoji/hashtag habits
- Signature phrases
- CTA patterns
- Topic clusters
```

### Post Generation Prompt
```
Input:
- Voice profile (JSON)
- Content pillar + specific angle
- Trending context (optional)
- Past top-performing posts as examples
- Constraints (length, format)

Task: Write a LinkedIn post that sounds like {user_name}

Output:
- Post text (formatted with line breaks)
- Suggested hashtags
- Media recommendation
- Brief explanation of strategy behind this post
```

### Key Prompt Engineering Principles
- Few-shot with user's own best posts
- Constrain output format strictly (line breaks matter on LinkedIn)
- Include negative examples ("don't sound like generic AI")
- Rotate hook types to avoid repetition
- Inject current events / trending topics for freshness

---

## 10. Monetization

### Pricing Tiers

| Tier | Price | Limits |
|------|-------|--------|
| **Free** | $0/mo | 3 posts/week, text only, no analytics |
| **Pro** | $29/mo | Unlimited posts, images, carousels, analytics, all pillars |
| **Team** | $79/mo | 5 team members, shared content library, approval workflows |

### Revenue Drivers
- Primary: SaaS subscription
- Secondary: AI credits for heavy users (image gen, carousel gen)
- Future: Marketplace for prompt templates / content strategies

---

## 11. Competitive Landscape

| Competitor | What They Do | Auto-Linked Advantage |
|------------|-------------|----------------------|
| **Taplio** | LinkedIn scheduling + AI writing | We learn YOUR voice, not generic AI |
| **AuthoredUp** | LinkedIn editor + analytics | We auto-generate, not just format |
| **Buffer** | Multi-platform scheduling | We're LinkedIn-native with deep AI |
| **Supergrow** | AI LinkedIn posts | We have feedback loop + adaptation |
| **Shield** | LinkedIn analytics only | We combine analytics WITH generation |

**Our moat:** Voice cloning + adaptive strategy. The longer you use it, the better it writes as you.

---

## 12. Risks & Mitigations

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|------------|
| LinkedIn revokes API access | Medium | Critical | Fallback: copy-to-clipboard + browser extension for manual posting |
| AI content detected as spam | Medium | High | Human-in-the-loop approval, voice personalization, no duplicate content |
| Content quality too low | Medium | High | Few-shot from user's best posts, iterative prompt refinement, regenerate option |
| Low user retention | Medium | Medium | Weekly performance reports create habit loop, gamification of streak |
| Competitor copies approach | High | Medium | Voice profile is a switching cost — the more you use, the harder to leave |
| LinkedIn ToS changes | Medium | High | Stay within official API, no scraping, no automation of engagement |

---

## 13. Success Metrics

### North Star: Posts Published Per User Per Week
(Target: 4+ posts/week sustained for 3+ months)

### Supporting Metrics

| Metric | Target | Why It Matters |
|--------|--------|---------------|
| Onboarding completion rate | >70% | Users who finish onboarding stay |
| Posts approved (vs regenerated/skipped) | >60% approval rate | AI quality signal |
| Weekly active users | >50% of signups | Retention |
| Avg engagement per post | 2x user's pre-Auto-Linked baseline | Proving value |
| Time from signup to first published post | <24 hours | Fast time-to-value |
| Monthly churn | <5% | Sustainable business |

---

## 14. MVP Scope & Timeline

### MVP (8-10 weeks)

**Week 1-2: Foundation**
- Project setup (Next.js + FastAPI/Node)
- Auth system (email + social login)
- Database schema + migrations
- LinkedIn OAuth integration

**Week 3-4: Voice Engine**
- Onboarding questionnaire flow
- LinkedIn post fetching (past posts)
- Voice analysis pipeline (Claude API)
- Voice profile storage + display

**Week 5-6: Content Generation**
- Content pillar setup UI
- Post generation pipeline
- Review queue UI (approve/edit/regenerate/skip)
- Content calendar view

**Week 7-8: Publishing**
- LinkedIn publishing integration
- Scheduling system (BullMQ / cron)
- Post status tracking
- Error handling + retry logic

**Week 9-10: Polish & Launch**
- Basic analytics (post-publish metrics)
- Email notifications (daily review reminder, weekly report)
- Landing page + waitlist
- Beta launch to 50 users

### Post-MVP Roadmap
- Month 3: Image generation, carousel generator
- Month 4: Adaptive strategy, A/B hook testing
- Month 5: Mobile app, comment drafts
- Month 6: Team mode, content repurposing

---

## 15. Open Questions

1. **LinkedIn API approval** — How long does Marketing Developer Platform review take? Do we need a company page or can we use personal profiles?
2. **Past post access** — Can we reliably get a user's post history via API, or do we need an alternative (browser extension, manual paste)?
3. **Image generation costs** — At scale, AI image gen per post could be expensive. Should images be opt-in only on Pro tier?
4. **Legal review** — Do we need to disclose AI-generated content on LinkedIn? Any jurisdiction-specific requirements?
5. **Engagement automation** — Should we ever auto-like or auto-comment? (Recommendation: NO — too risky for ToS violation)

---

## Appendix A: User Interview Questions

Use these to validate the idea before building:

1. How often do you currently post on LinkedIn?
2. What stops you from posting more?
3. If an AI could write posts in your voice, would you trust it?
4. What would make you pay $29/month for this?
5. Do you care more about saving time or improving content quality?
6. Would you want full auto-publish or always review first?
7. What's the #1 thing you'd want from a LinkedIn content tool?

---

## Appendix B: Example Generated Post

**Pillar:** Career advice
**Format:** Story + lesson
**Voice:** Professional-casual, light emoji, double-spaced

```
I got rejected from my dream job 3 years ago.

The hiring manager said I "lacked leadership experience."

Instead of sulking, I did something unconventional:

I started leading a community project.
No title. No budget. No team assigned to me.
Just me and a Notion doc.

Within 6 months:
- 200 members joined
- We shipped 3 open source tools
- Two companies reached out to sponsor us

Last month, that same hiring manager sent ME a LinkedIn message.

"We have a VP role. You'd be perfect."

The lesson?

Leadership isn't given. It's taken.

Don't wait for permission to lead.

#leadership #careers #growthmindset
```

---

*This PRD is a living document. Update as user research and technical discovery progress.*
