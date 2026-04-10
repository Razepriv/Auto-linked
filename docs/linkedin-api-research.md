# LinkedIn API Research for Auto-Linked

**Date:** 2026-04-09
**Status:** Research Complete
**Sources:** Official LinkedIn/Microsoft Developer Documentation (learn.microsoft.com/linkedin)

---

## Table of Contents

1. [LinkedIn API Access](#1-linkedin-api-access)
2. [OAuth 2.0 Flow](#2-oauth-20-flow)
3. [Publishing Endpoints](#3-publishing-endpoints)
4. [Reading User's Past Posts](#4-reading-users-past-posts)
5. [Analytics Endpoints](#5-analytics-endpoints)
6. [Risks & Restrictions](#6-risks--restrictions)
7. [Alternative Approaches](#7-alternative-approaches)
8. [Recommended Architecture for Auto-Linked](#8-recommended-architecture-for-auto-linked)

---

## 1. LinkedIn API Access

### How to Get `w_member_social` Scope

There are **two paths** to obtain `w_member_social`:

#### Path A: "Share on LinkedIn" Product (Self-Service -- Easiest)

- Available to **all developers** without special approval.
- Enable via the LinkedIn Developer Portal: My Apps > Products tab > "Share on LinkedIn".
- Grants: `w_member_social` (post, comment, and like on behalf of an authenticated member).
- **This is sufficient for MVP posting functionality.**
- Does NOT grant read access to member posts (`r_member_social` is restricted).

#### Path B: Community Management API (Requires Approval)

- Must be approved by LinkedIn after an application review.
- Grants a broader set of permissions including:
  - `w_member_social` -- post on behalf of member
  - `w_member_social_feed` -- manage comments/reactions
  - `r_organization_social` -- read org posts
  - `r_organization_social_feed` -- read org social actions
  - `rw_organization_admin` -- manage org pages
  - `r_basicprofile` -- read member name, photo, headline
  - `r_1st_connections_size` -- connection count
  - `r_member_profileAnalytics` -- profile analytics (API versions >= 202504)
  - `r_member_postAnalytics` -- **post analytics** (API versions >= 202506)
- **Does NOT include `r_member_social`** (reading a member's own past posts). That permission is restricted to select approved partners only.

#### Path C: Advertising API (Alternative)

- Also grants `w_member_social` along with advertising-related permissions.
- Overkill for Auto-Linked unless we add ad management features.

### Marketing Developer Platform Application Process

#### Development Tier (Step 1)

1. Create a LinkedIn Developer Application at https://www.linkedin.com/developers/apps
2. Navigate to Products tab and apply for "Community Management API"
3. Submit the access request form with:
   - Business email address (must be verified; personal emails are rejected)
   - Organization's legal name, registered address, website, privacy policy
   - The LinkedIn Page associated with the organization must have a super admin who has verified the app
   - App name must NOT include "LinkedIn" or "Microsoft" names/logos
4. LinkedIn reviews for: approved use case, verified business email, verified organization, verified website, LinkedIn Page verification.

**Development Tier Limits:**
- 500 API calls per app per 24 hours
- 100 API calls per member per app per 24 hours
- BATCH_GET calls are NOT allowed
- Webhook push notifications are disabled
- Must complete integration and testing within 12 months

#### Standard Tier (Step 2)

1. Must first have Development Tier approved and fully integrated
2. Submit Standard Tier access request form via Developer Portal > My Apps > Products
3. Must provide:
   - Company and product overview
   - Description of use case
   - Test credentials for LinkedIn reviewers
   - **Screen recording/screencast** of the app demonstrating:
     - OAuth flow
     - User posting via the app
     - How comments on posts are displayed
     - What personal data fields from LinkedIn profiles are shown
     - All core functionality using LinkedIn data
   - Narration recommended, high resolution, downloadable
4. LinkedIn reviews for compliance with API terms, privacy policy, data storage requirements, security.

**Standard Tier:** No rate limit restrictions.

#### Approval Timeline

- LinkedIn does NOT publish a guaranteed approval timeline.
- Community feedback suggests: **2-8 weeks** for Development Tier, potentially longer for Standard Tier.
- LinkedIn reserves the right to reject at its discretion; if rejected, you must create a new app and reapply.
- For Matched Audiences API (not needed here), LinkedIn states "up to 60 days."

### Rate Limits

Rate limits reset at **midnight UTC** daily. Two types apply:

| Limit Type | Description |
|-----------|------------|
| **Application** | Total calls your entire app can make per day |
| **Member** | Total calls a single member's token can make per day |

**Standard rate limits are NOT published in documentation.** You must check them via the Developer Portal > App > Analytics tab (shows usage and limits for endpoints you've called at least once).

**Known limits (Development Tier - Community Management API):**

| Endpoint Category | App Limit (24h) | Member Limit (24h) |
|------------------|-----------------|-------------------|
| All APIs (Dev Tier) | 500 | 100 |
| BATCH_GET (Dev Tier) | 0 (not allowed) | 0 |
| All APIs (Standard Tier) | No restrictions | No restrictions |

**Rate Limit Response:**
- HTTP `429 Too Many Requests` when exceeded
- Email alerts sent to developer admins when app exceeds 75% of quota (1-2 hour delay)

---

## 2. OAuth 2.0 Flow

### Authorization Code Flow (3-Legged OAuth)

LinkedIn uses a standard OAuth 2.0 Authorization Code flow.

#### Step 1: Redirect User to LinkedIn Authorization

```
GET https://www.linkedin.com/oauth/v2/authorization
  ?response_type=code
  &client_id={your_client_id}
  &redirect_uri={your_callback_url}
  &state={random_csrf_token}
  &scope=w_member_social%20profile%20email
```

| Parameter | Required | Description |
|-----------|----------|-------------|
| response_type | Yes | Always `code` |
| client_id | Yes | From Developer Portal |
| redirect_uri | Yes | Must be HTTPS, must match portal config exactly |
| state | Recommended | CSRF protection value |
| scope | Yes | Space-delimited, URL-encoded permission list |

**Notes:**
- Redirect URIs must be absolute, HTTPS, no fragments (#)
- Parameters in redirect URIs are ignored
- Social login (Google/Apple) and passkey supported on desktop/Android; add `enable_extended_login=true` for other platforms

#### Step 2: Receive Authorization Code

User approves, LinkedIn redirects to:
```
https://your-app.com/callback?code={authorization_code}&state={your_state}
```

- Authorization code is valid for **30 minutes**
- MUST validate `state` parameter matches what you sent

#### Step 3: Exchange Code for Access Token

```
POST https://www.linkedin.com/oauth/v2/accessToken
Content-Type: application/x-www-form-urlencoded

grant_type=authorization_code
&code={authorization_code}
&client_id={your_client_id}
&client_secret={your_client_secret}
&redirect_uri={your_callback_url}
```

#### Token Response

```json
{
  "access_token": "AQXNnd2kXITHELmW...",
  "expires_in": 5184000,
  "refresh_token": "AQWAft_WjYZKwuWX...",
  "refresh_token_expires_in": 525600,
  "scope": "w_member_social"
}
```

### Token Expiry and Refresh Strategy

| Token Type | Lifetime | Notes |
|-----------|----------|-------|
| Access Token | **60 days** (5,184,000 seconds) | ~500 chars, plan for 1000+ |
| Refresh Token | **365 days** (525,600 seconds) | Available to approved MDP partners |

**Refresh Token Flow:**

```
POST https://www.linkedin.com/oauth/v2/accessToken
Content-Type: application/x-www-form-urlencoded

grant_type=refresh_token
&refresh_token={your_refresh_token}
&client_id={your_client_id}
&client_secret={your_client_secret}
```

**Critical behavior:**
- Using a refresh token generates a new access token (60-day TTL) but the refresh token TTL does NOT reset -- it counts down from the original 365 days.
- Example: If you refresh on day 59, new access token = 60 days, but refresh token only has 306 days left.
- When the refresh token expires, the user MUST re-authorize via the full OAuth flow.
- LinkedIn reserves the right to revoke tokens at any time for technical or policy reasons.

**Programmatic refresh tokens are only available to approved Marketing Developer Platform (MDP) partners.** Without approval, the fallback is to silently re-run the OAuth flow while the user is still logged into linkedin.com (the consent screen is bypassed if the token hasn't expired and the user is still logged in).

### Scopes Needed for Auto-Linked

| Scope | Purpose | How to Get |
|-------|---------|-----------|
| `profile` | Read member name, photo, headline (OpenID Connect) | Self-service: "Sign in with LinkedIn using OpenID Connect" |
| `email` | Read member email | Self-service: same product as above |
| `w_member_social` | Create posts, comments, likes on behalf of member | Self-service: "Share on LinkedIn" product |
| `r_member_social` | **Read member's own posts** | **RESTRICTED** -- approved partners only, NOT available via Community Management API |
| `r_basicprofile` | Read name, photo, headline, public URL | Community Management API or Advertising API |
| `r_member_profileAnalytics` | Profile viewer/follower analytics | Community Management API (v202504+) |
| `r_member_postAnalytics` | **Per-post analytics for member posts** | Community Management API (v202506+) |

---

## 3. Publishing Endpoints

### API Base URL and Required Headers

All requests to the LinkedIn Marketing/Community Management API require:

```
Authorization: Bearer {access_token}
X-Restli-Protocol-Version: 2.0.0
Linkedin-Version: {YYYYMM}  (e.g., 202603)
Content-Type: application/json
```

**Important:** The `ugcPosts` API is deprecated. Use the **Posts API** (`/rest/posts`) for all new development.

### Create a Text-Only Post

```
POST https://api.linkedin.com/rest/posts
```

```json
{
  "author": "urn:li:person:{member_id}",
  "commentary": "Your post text here with line breaks\n\nand formatting.",
  "visibility": "PUBLIC",
  "distribution": {
    "feedDistribution": "MAIN_FEED",
    "targetEntities": [],
    "thirdPartyDistributionChannels": []
  },
  "lifecycleState": "PUBLISHED",
  "isReshareDisabledByAuthor": false
}
```

**Response:** `201 Created`, Post ID in `x-restli-id` header.

**For member posts:** Use `"author": "urn:li:person:{id}"` (obtained from the profile API after OAuth).

### Create a Post with Image

**Step 1: Initialize image upload**

```
POST https://api.linkedin.com/rest/images?action=initializeUpload

{
  "initializeUploadRequest": {
    "owner": "urn:li:person:{member_id}"
  }
}
```

Response includes `uploadUrl` and `image` URN (e.g., `urn:li:image:C4E10AQFoyyAjHPMQuQ`).

**Step 2: Upload the binary**

```
PUT {uploadUrl}
Content-Type: image/jpeg  (or image/png, image/gif)
Body: <binary image data>
```

**Step 3: Create the post**

```json
{
  "author": "urn:li:person:{member_id}",
  "commentary": "Post with image",
  "visibility": "PUBLIC",
  "distribution": {
    "feedDistribution": "MAIN_FEED",
    "targetEntities": [],
    "thirdPartyDistributionChannels": []
  },
  "content": {
    "media": {
      "altText": "Description for accessibility",
      "id": "urn:li:image:C4E10AQFoyyAjHPMQuQ"
    }
  },
  "lifecycleState": "PUBLISHED",
  "isReshareDisabledByAuthor": false
}
```

**Supported image formats:** JPG, PNG, GIF (up to 250 frames). Max: 36,152,320 pixels.

### Create a Multi-Image Post

Use the **MultiImage API** for organic posts with multiple images. Each image must be uploaded separately via the Images API first.

### Create a Document/Carousel Post (PDF)

This is how LinkedIn "carousels" work for organic posts -- they are PDF documents displayed as swipeable slides.

**Step 1: Initialize document upload**

```
POST https://api.linkedin.com/rest/documents?action=initializeUpload

{
  "initializeUploadRequest": {
    "owner": "urn:li:person:{member_id}"
  }
}
```

**Step 2: Upload the PDF**

```
PUT {uploadUrl}
Content-Type: application/pdf
Body: <binary PDF data>
```

**Step 3: Create the post**

```json
{
  "author": "urn:li:person:{member_id}",
  "commentary": "Check out this carousel!",
  "visibility": "PUBLIC",
  "distribution": {
    "feedDistribution": "MAIN_FEED",
    "targetEntities": [],
    "thirdPartyDistributionChannels": []
  },
  "content": {
    "media": {
      "title": "My Carousel.pdf",
      "id": "urn:li:document:D5510AQFx87994pYx0Q"
    }
  },
  "lifecycleState": "PUBLISHED",
  "isReshareDisabledByAuthor": false
}
```

**Supported document formats:** PDF, PPT, PPTX, DOC, DOCX. Max: **100 MB, 300 pages**.

**Note:** True "Carousel" content type (with individual cards linking to different URLs) is **sponsored-only**. Organic carousels are achieved via document (PDF) posts.

### Create a Poll Post

```json
{
  "author": "urn:li:person:{member_id}",
  "commentary": "What do you think?",
  "visibility": "PUBLIC",
  "distribution": {
    "feedDistribution": "MAIN_FEED",
    "targetEntities": [],
    "thirdPartyDistributionChannels": []
  },
  "lifecycleState": "PUBLISHED",
  "isReshareDisabledByAuthor": false,
  "content": {
    "poll": {
      "question": "What is your preferred framework?",
      "options": [
        { "text": "React" },
        { "text": "Vue" },
        { "text": "Angular" },
        { "text": "Svelte" }
      ],
      "settings": {
        "duration": "THREE_DAYS"
      }
    }
  }
}
```

**Poll constraints:**
- Question: max 140 characters
- Options: min 2, max 4; each max 30 characters
- Duration: `ONE_DAY`, `THREE_DAYS`, `SEVEN_DAYS`, `FOURTEEN_DAYS`
- Polls are organic only (no sponsored poll posts)
- Poll content cannot be updated after creation

### Supported Content Types Summary

| Content Type | Organic | Sponsored | API |
|-------------|---------|-----------|-----|
| Text only | Yes | Yes | Posts API |
| Single Image | Yes | Yes | Images API + Posts API |
| Multi-Image | Yes | No | MultiImage API + Posts API |
| Video | Yes | Yes | Videos API + Posts API |
| Document (PDF carousel) | Yes | Yes | Documents API + Posts API |
| True Carousel (cards w/ links) | No | Yes | Carousel API (ads only) |
| Poll | Yes | No | Posts API |
| Article (link preview) | Yes | Yes | Posts API |

### Mentions and Hashtags

- **Mentions:** `"commentary": "Hello @[CompanyName](urn:li:organization:123)"`
- **Hashtags:** `"commentary": "Great insights #leadership #tech"`
- Organization mentions must match the full name (case-sensitive)
- Member mentions can match first name, last name, or full name

---

## 4. Reading User's Past Posts

### Can We Fetch a User's Post History via API?

**This is the biggest challenge for Auto-Linked.**

#### Official API: `r_member_social` (RESTRICTED)

The endpoint to fetch a member's posts is:

```
GET https://api.linkedin.com/rest/posts?author={encoded_person_urn}&q=author&count=100&sortBy=LAST_MODIFIED
```

**However, this requires `r_member_social` permission, which is:**
- Listed as "restricted" and "available to approved users only"
- NOT included in the Community Management API product
- NOT included in the Advertising API product
- NOT available via self-service
- Only granted to select partners (major platforms like Hootsuite, Sprout Social, etc.)

#### What IS Available Without `r_member_social`

1. **`w_member_social`** -- Write-only. Can create posts but cannot read back a member's post history.
2. **Organization posts** (`r_organization_social`) -- Can read posts from Company Pages the member administers, but NOT personal profile posts.
3. **Social Actions** (`w_member_social_feed` / `r_organization_social_feed`) -- Can read/write comments and reactions, but not list a member's posts.
4. **`r_member_postAnalytics`** (v202506+) -- May provide analytics for member posts, but the exact scope of access (whether it includes post content retrieval or just metrics) needs verification.

### Alternatives for Voice Analysis

Since fetching past posts via API is severely limited, Auto-Linked should implement these alternatives:

| Approach | Effort | Reliability | Legal |
|---------|--------|-------------|-------|
| **Manual paste** -- User copies/pastes their best posts into the app | Low | High | Clean |
| **Browser extension** -- Extension reads posts from linkedin.com with user consent | Medium | Medium | Gray area (see Section 7) |
| **LinkedIn profile URL scraping** -- Scrape public posts from profile page | Medium | Low (limited to public, LinkedIn blocks) | Risky (ToS violation) |
| **CSV export** -- LinkedIn allows users to download their data (Settings > Get a copy of your data) | Low | High | Clean |
| **Ask during onboarding** -- Structured questionnaire about writing style | Low | Medium | Clean |
| **Apply for `r_member_social`** -- Long shot, but worth trying once we have traction | High | High | Clean |

**Recommendation for MVP:** Combine manual paste + onboarding questionnaire + LinkedIn data export (CSV). Add browser extension in v1.1.

---

## 5. Analytics Endpoints

### Organization Share Statistics

**Endpoint:** `GET https://api.linkedin.com/rest/organizationalEntityShareStatistics`

**Required Permission:** `rw_organization_admin`

**This endpoint only works for Company Pages**, not personal profiles.

#### Per-Post Statistics (Organization)

```
GET https://api.linkedin.com/rest/organizationalEntityShareStatistics
  ?q=organizationalEntity
  &organizationalEntity=urn%3Ali%3Aorganization%3A{id}
  &shares=List(urn%3Ali%3Ashare%3A{post_id_1},urn%3Ali%3Ashare%3A{post_id_2})
```

**Response fields per post:**

| Field | Description |
|-------|-------------|
| `clickCount` | Number of clicks |
| `commentCount` | Number of comments |
| `engagement` | Organic clicks + likes + comments + shares / impressions |
| `impressionCount` | Number of impressions |
| `likeCount` | Number of likes |
| `shareCount` | Number of reposts |
| `uniqueImpressionsCount` | Unique impressions |

**Limitations:**
- Data only available within the past **12 months** (rolling window)
- Returns organic statistics only (not sponsored)
- Time-bound statistics not supported for specific share queries
- Does not support pagination

### Social Actions API (Per-Post Likes/Comments Count)

Works for both member and organization posts. Available via `socialActions` endpoint:

```
GET https://api.linkedin.com/rest/socialActions/{encoded_post_urn}
```

Response includes `likesSummary.totalLikes` and `commentsSummary.aggregatedTotalComments`.

**Supports batch:** Can fetch social actions for multiple posts in one call.

**Permissions needed:** `w_member_social` or `r_organization_social` (depending on post type).

### Member Post Analytics (NEW -- v202506+)

The Community Management API now includes `r_member_postAnalytics` permission (supported in API versions starting from 202506). This is the most promising path for personal post analytics.

**Status:** This permission was recently added. Documentation may still be evolving. It is part of the Community Management API product and should provide post-level analytics (impressions, reactions, etc.) for member profiles.

### Member Profile Analytics (v202504+)

`r_member_profileAnalytics` provides:
- Number of profile viewers
- Number of followers
- Search appearances

### Data Freshness

- Organization share statistics: Near real-time for aggregate, some delay for per-post
- Social actions (likes/comments count): Real-time
- LinkedIn documentation does not specify exact delays for analytics data

### Recommended Analytics Strategy for Auto-Linked

1. **MVP (Personal profiles):** Use `socialActions` endpoint to get likes and comments count per post (available with `w_member_social`). This gives engagement metrics but NOT impressions.
2. **v1.1:** Apply for Community Management API with `r_member_postAnalytics` to get full analytics including impressions.
3. **Organization pages:** Use `organizationalEntityShareStatistics` for complete metrics.

---

## 6. Risks & Restrictions

### LinkedIn API Terms of Service -- Key Restrictions

#### Data Storage Restrictions (CRITICAL)

- **Member social activity data** (posts, comments, reactions): Can only be stored for **48 hours**
- **Member profile data** (name, photo, etc.): Can only be stored for **24 hours**
- This means Auto-Linked must either:
  - Re-fetch data on each display, OR
  - Only store aggregated/derived data (voice profile, analytics summaries) rather than raw LinkedIn data

#### Prohibited Uses

1. **No Social Feeds:** Cannot display a feed of LinkedIn posts on an external website or intranet
2. **No Advertising/Sales/Recruiting use of member data:** Cannot use LinkedIn member data for lead generation, CRM enrichment, audience building, or ad targeting
3. **No Exporting member data:** Member data can only be displayed within your application; cannot be exported or transferred
4. **No Combining data:** Cannot combine LinkedIn member data with other data sources to build profiles
5. **No Headless/Fake Accounts:** Cannot create fake profiles or use individual profiles to manage multiple customers
6. **Data Minimization:** Cannot request more data than your application actually needs

#### AI-Generated Content -- ToS Assessment

LinkedIn's API terms do **not explicitly prohibit** AI-generated content posted via the API. However:

- LinkedIn's Professional Community Policies require content to be authentic
- Content must comply with LinkedIn's "Do's and Don'ts" and community guidelines
- Mass-generated identical or near-identical content could be flagged as spam
- **Human-in-the-loop approval** (as planned in Auto-Linked's PRD) is a strong mitigant

#### Account Ban Triggers

- Posting identical content across multiple accounts
- Excessive posting frequency (appears automated/spammy)
- Engagement automation (auto-liking, auto-commenting at scale)
- Creating fake profiles
- Violating rate limits persistently
- Using scraping to access LinkedIn data
- Content that violates Professional Community Policies

#### API Access Revocation Risk

LinkedIn explicitly states it "retains the right to monitor your application and suspend or discontinue access to the Community Management APIs for any non-compliance with the Marketing API Terms, even if your application was previously approved."

### Mitigation Strategies for Auto-Linked

| Risk | Mitigation |
|------|-----------|
| API access revoked | Build "copy to clipboard" fallback from day 1 |
| Content flagged as spam | Voice personalization ensures unique content per user; human approval loop |
| Data storage violations | Store voice profiles (derived data) not raw posts; re-fetch as needed |
| 48-hour data retention | Cache analytics snapshots as aggregates, not raw LinkedIn data |
| Account bans | Rate limit posting to 1-2/day max; no engagement automation |
| AI content detection | Vary content structure, inject personal anecdotes, avoid templates |

---

## 7. Alternative Approaches

### Browser Extension Approach

**Concept:** A Chrome/Firefox extension that runs on linkedin.com with user consent, able to:
- Read the user's post history directly from the DOM
- Extract engagement metrics visible on the profile
- Potentially publish posts by automating the LinkedIn editor

**Pros:**
- Bypasses API restrictions on reading member posts
- No API approval needed for reading
- Can access all data visible to the logged-in user

**Cons:**
- Fragile: LinkedIn DOM changes frequently, breaking extensions
- Legal gray area: LinkedIn's User Agreement prohibits scraping, but a user-initiated extension reading their own data is arguably different
- Distribution: Must go through Chrome Web Store review
- LinkedIn has been known to send cease-and-desist to extension developers (see hiQ Labs v. LinkedIn case, though that was public data scraping)
- Cannot run headlessly/in background for scheduled tasks

**Recommendation:** Useful as a supplementary tool for initial voice analysis (reading past posts), but NOT as the primary publishing mechanism.

### Copy-to-Clipboard Fallback

**Concept:** Generate the post content in Auto-Linked, then present a "Copy to Clipboard" button. User manually pastes into LinkedIn's native editor.

**Pros:**
- Zero API dependency; works even if API access is revoked
- No ToS risk whatsoever
- User has full control and visibility

**Cons:**
- Friction: Defeats the "zero effort" value proposition
- Cannot schedule posts
- Cannot track which posts were actually published
- Cannot fetch analytics automatically

**Recommendation:** Essential fallback for MVP resilience. Should always be available alongside API publishing.

### Third-Party Services

#### Phantombuster

- LinkedIn automation platform
- Can extract profile data, post history, connections
- Uses browser automation (headless Chrome) with user's cookies
- **Risk:** Violates LinkedIn ToS; accounts have been restricted/banned
- **Not recommended** for a production SaaS product

#### Existing LinkedIn SaaS Tools (Taplio, AuthoredUp, Buffer, Hootsuite)

- These are competitors, not integration partners
- They have obtained the necessary API approvals (often `r_member_social`)
- Their approval process took months/years of relationship building with LinkedIn

#### LinkedIn Data Export (Settings > Get a Copy of Your Data)

- LinkedIn allows users to download their data as CSV/JSON
- Includes posts, comments, connections, messages
- Takes up to 24 hours for LinkedIn to prepare the export
- **Recommended for MVP:** Ask users to upload their LinkedIn data export for voice analysis

### Unipile / Nango / Similar Unified API Providers

- Third-party services that aggregate LinkedIn API access
- Some claim to offer expanded LinkedIn access
- Risk: May be using unauthorized methods; LinkedIn could shut them down
- Not recommended as primary integration path

---

## 8. Recommended Architecture for Auto-Linked

### MVP API Strategy

```
Phase 1 (Week 1-2): OAuth + Basic Publishing
  - Apply for "Share on LinkedIn" (self-service, instant)
  - Apply for "Sign in with LinkedIn using OpenID Connect" (self-service)
  - Implement OAuth 2.0 with refresh token handling
  - Scopes: profile, email, w_member_social
  - Can publish: text, image, document (PDF carousel), poll posts
  
Phase 2 (Week 3-4): Voice Analysis (No API needed)
  - Onboarding questionnaire (in-app)
  - LinkedIn data export upload (user downloads from LinkedIn Settings)
  - Manual post paste (user copies their best 10-20 posts)
  - Parse and analyze with Claude API
  
Phase 3 (Week 7-8): Publishing Pipeline
  - POST https://api.linkedin.com/rest/posts with w_member_social
  - Image upload via Images API
  - PDF carousel via Documents API
  - Store linkedin_post_id for tracking
  
Phase 4 (Parallel): Apply for Community Management API
  - Start application once MVP is functional
  - Need working demo + screencast for review
  - Unlocks: r_member_postAnalytics, profile analytics
  - Timeline: 2-8 weeks for Development Tier approval

Phase 5 (Post-MVP): Analytics
  - Use socialActions endpoint for likes/comments count (available now)
  - Use r_member_postAnalytics when Community Management API approved
  - Background job every 6h to snapshot analytics
```

### Token Management

```
- Store encrypted access_token + refresh_token in DB
- Background job checks token expiry daily
- Refresh access token when < 7 days remaining
- If refresh_token < 30 days remaining, notify user to re-authorize
- If refresh fails, queue notification for manual re-auth
- Always have copy-to-clipboard fallback available
```

### API Versioning

LinkedIn Marketing APIs are versioned with `Linkedin-Version: YYYYMM` header. As of April 2026:
- Current: `202603` (March 2026)
- The Marketing Version 202503 has been sunset
- Always use the latest supported version
- Monitor the migrations page for deprecation notices

### Required Headers for Every Request

```
Authorization: Bearer {access_token}
X-Restli-Protocol-Version: 2.0.0
Linkedin-Version: 202603
Content-Type: application/json
```

---

## Appendix A: Key API Endpoints Reference

| Purpose | Method | Endpoint |
|---------|--------|----------|
| Create post | POST | `https://api.linkedin.com/rest/posts` |
| Get post by URN | GET | `https://api.linkedin.com/rest/posts/{encoded_urn}` |
| Find posts by author | GET | `https://api.linkedin.com/rest/posts?author={encoded_urn}&q=author` |
| Delete post | DELETE | `https://api.linkedin.com/rest/posts/{encoded_urn}` |
| Update post | POST | `https://api.linkedin.com/rest/posts/{encoded_urn}` (PARTIAL_UPDATE) |
| Initialize image upload | POST | `https://api.linkedin.com/rest/images?action=initializeUpload` |
| Initialize document upload | POST | `https://api.linkedin.com/rest/documents?action=initializeUpload` |
| Get social actions | GET | `https://api.linkedin.com/rest/socialActions/{encoded_urn}` |
| Create comment | POST | `https://api.linkedin.com/rest/socialActions/{encoded_urn}/comments` |
| Create like | POST | `https://api.linkedin.com/rest/socialActions/{encoded_urn}/likes` |
| Org share statistics | GET | `https://api.linkedin.com/rest/organizationalEntityShareStatistics` |
| OAuth authorize | GET | `https://www.linkedin.com/oauth/v2/authorization` |
| OAuth token exchange | POST | `https://www.linkedin.com/oauth/v2/accessToken` |

## Appendix B: Scope Quick Reference

| Scope | Access Method | Purpose for Auto-Linked |
|-------|-------------|----------------------|
| `profile` | Self-service (OpenID Connect) | User's name, photo, headline |
| `email` | Self-service (OpenID Connect) | User's email |
| `w_member_social` | Self-service ("Share on LinkedIn") | **Create posts** |
| `r_basicprofile` | Community Management API | Name, photo, headline, public URL |
| `r_member_social` | **RESTRICTED** (select partners only) | Read user's past posts |
| `r_member_postAnalytics` | Community Management API (v202504+) | Per-post analytics |
| `r_member_profileAnalytics` | Community Management API (v202506+) | Profile views, followers |
| `w_member_social_feed` | Community Management API | Manage comments/reactions |

## Appendix C: Sources

- [Posts API](https://learn.microsoft.com/en-us/linkedin/marketing/community-management/shares/posts-api)
- [OAuth Authorization Code Flow](https://learn.microsoft.com/en-us/linkedin/shared/authentication/authorization-code-flow)
- [Getting Access](https://learn.microsoft.com/en-us/linkedin/shared/authentication/getting-access)
- [Programmatic Refresh Tokens](https://learn.microsoft.com/en-us/linkedin/shared/authentication/programmatic-refresh-tokens)
- [Rate Limits](https://learn.microsoft.com/en-us/linkedin/shared/api-guide/concepts/rate-limits)
- [Images API](https://learn.microsoft.com/en-us/linkedin/marketing/community-management/shares/images-api)
- [Documents API](https://learn.microsoft.com/en-us/linkedin/marketing/community-management/shares/documents-api)
- [Poll API](https://learn.microsoft.com/en-us/linkedin/marketing/community-management/shares/poll-post-api)
- [Organization Share Statistics](https://learn.microsoft.com/en-us/linkedin/marketing/community-management/organizations/share-statistics)
- [Social Actions API](https://learn.microsoft.com/en-us/linkedin/marketing/community-management/shares/network-update-social-actions)
- [Increasing Access / Permissions Table](https://learn.microsoft.com/en-us/linkedin/marketing/increasing-access)
- [Community Management App Review](https://learn.microsoft.com/en-us/linkedin/marketing/community-management-app-review)
- [Restricted Use Cases](https://learn.microsoft.com/en-us/linkedin/marketing/restricted-use-cases)
- [Marketing API Getting Started](https://learn.microsoft.com/en-us/linkedin/marketing/getting-started)
