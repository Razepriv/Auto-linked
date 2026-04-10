# Auto-Linked Security Threat Model

**Version:** 1.0
**Date:** 2026-04-09
**Status:** Draft
**Scope:** Full product surface — MVP through v2.0

---

## Table of Contents

1. [Executive Summary](#1-executive-summary)
2. [Threat Surface Map](#2-threat-surface-map)
3. [OWASP Top 10 Analysis](#3-owasp-top-10-analysis)
4. [Authentication and Authorization](#4-authentication-and-authorization)
5. [Data Protection](#5-data-protection)
6. [API Security](#6-api-security)
7. [LinkedIn-Specific Risks](#7-linkedin-specific-risks)
8. [Infrastructure Security](#8-infrastructure-security)
9. [Recommendations Matrix](#9-recommendations-matrix)

---

## 1. Executive Summary

Auto-Linked is an AI-powered LinkedIn content engine that occupies a uniquely high-risk security position: it stores OAuth tokens granting write access to users' LinkedIn identities, processes personal voice data, generates content on behalf of users, and publishes that content autonomously. A breach in any of these areas causes real-world reputational and financial harm to users — not just data exposure.

The three highest-severity risks are:

| Rank | Risk | Consequence |
|------|------|-------------|
| 1 | LinkedIn OAuth token theft | Attacker posts as user, destroys professional reputation |
| 2 | Plaintext token storage | Single DB breach exposes all user LinkedIn accounts |
| 3 | Missing authorization on post/publish endpoints | Any authenticated user can publish as another user |

All three are fully preventable with standard controls. This document defines the complete security posture required for safe operation.

---

## 2. Threat Surface Map

### 2.1 Asset Inventory

| Asset | Sensitivity | Location | Threat |
|-------|-------------|----------|--------|
| LinkedIn access tokens | CRITICAL | PostgreSQL, Redis queue | Token theft → unauthorized posting |
| LinkedIn refresh tokens | CRITICAL | PostgreSQL | Long-lived; compromise = persistent access |
| Claude API key | CRITICAL | Environment / secrets manager | API abuse, billing fraud |
| DALL-E / image gen API keys | HIGH | Environment / secrets manager | Billing fraud, NSFW generation abuse |
| User email addresses | HIGH | PostgreSQL | Spam, phishing, credential stuffing |
| Voice profiles (writing fingerprint) | HIGH | PostgreSQL (JSON column) | PII leak, voice forgery |
| Past LinkedIn posts (fetched) | HIGH | PostgreSQL / S3 | PII exposure, user embarrassment |
| Generated post content (queue) | MEDIUM | PostgreSQL | Leak before user approves |
| Post analytics data | MEDIUM | PostgreSQL | Behavioral profiling |
| Payment/billing records | HIGH | Stripe (external) | Fraud, PCI scope |
| Session tokens / JWTs | HIGH | Browser cookies, Redis | Session hijack |
| S3 / R2 media files | MEDIUM | Object storage | Unauthorized access, cost abuse |

### 2.2 Trust Boundaries

```
[Browser / Mobile Client]
        |  HTTPS only
        v
[Next.js Frontend / API Routes]  <-- public internet boundary
        |  Internal network
        v
[FastAPI / Node Backend]
    |           |           |
    v           v           v
[PostgreSQL]  [Redis]   [S3 / R2]
                |
                v
        [BullMQ Workers]
            |       |
            v       v
    [LinkedIn API] [Claude API]
```

Every boundary crossing is an attack surface. The BullMQ workers are particularly dangerous: they run with elevated privilege (LinkedIn tokens, Claude API key) and execute on a schedule without real-time user oversight.

### 2.3 Attack Actor Profiles

| Actor | Motivation | Capability |
|-------|-----------|------------|
| Opportunistic attacker | Steal tokens for spam/scam LinkedIn campaigns | Low-medium; automated scanning |
| Competitor | Steal voice profiles, user lists | Medium |
| Insider threat (employee) | Access user tokens, read DMs indirectly | High (has DB access) |
| Automated scraper | Abuse free tier; drain Claude API credits | Low; automated |
| Nation-state / APT | Target high-value professional users (executives, VPs) | High |

---

## 3. OWASP Top 10 Analysis

### A01: Broken Access Control

**Risk Level: CRITICAL**

Auto-Linked has multiple surfaces where access control failures would be catastrophic:

**Specific risks:**

- **Cross-user post access:** A user modifying `POST /posts/:id/approve` with another user's post ID publishes content on behalf of a different user. The backend MUST verify `post.user_id === authenticated_user.id` on every post operation.
- **LinkedIn publishing without ownership check:** The BullMQ worker picks up jobs by post ID. If job queue is manipulated, a post belonging to user A could be published using user B's token — or vice versa.
- **Voice profile exposure:** `GET /users/:id/voice-profile` must not be accessible by other users. Voice profiles contain behavioral fingerprints and example posts.
- **Analytics endpoint leakage:** `GET /posts/:id/analytics` must enforce ownership. Post performance data reveals content strategy.
- **Tier-based feature bypass:** Free users must not access Pro endpoints (image generation, carousel generation, unlimited posts) by manipulating requests.
- **Team mode (v2):** When a user can post on behalf of a team member, the authorization model becomes dramatically more complex. Implement explicit team membership checks with per-action permissions.

**Required controls:**
- Ownership middleware on every resource endpoint (`posts`, `analytics`, `voice-profile`, `pillars`, `schedule`)
- Never use resource IDs as the sole authorization check — always cross-reference against the authenticated user's ID in the query
- Row-level security in PostgreSQL as a defense-in-depth backstop

### A02: Cryptographic Failures

**Risk Level: CRITICAL**

LinkedIn OAuth tokens stored in plaintext give any attacker with DB read access a ready-made toolkit to post as every user simultaneously.

**Specific risks:**

- Tokens stored as plaintext `VARCHAR` in `oauth_tokens` column
- Tokens logged in application logs during debugging
- Tokens appearing in error messages sent to Sentry or similar
- Tokens transmitted over HTTP (non-TLS) to LinkedIn API
- Refresh tokens not rotated after use
- JWT signing secret is weak or hardcoded

**Required controls:**
- Encrypt `access_token` and `refresh_token` at rest using AES-256-GCM before writing to DB
- Store encryption key in secrets manager (not in the DB, not in env alongside the DB password)
- Scrub tokens from all log output — use token masking middleware
- Enforce TLS 1.2+ for all external API calls; disable older TLS in Node.js/Python HTTP clients
- JWT: use RS256 (asymmetric) rather than HS256; store private key in secrets manager

### A03: Injection

**Risk Level: HIGH**

**Specific risks:**

- **SQL injection via user-controlled inputs:** Content pillars, voice profile tweaks, post edits, search/filter parameters on the review queue. Any raw string interpolation into PostgreSQL queries is exploitable.
- **Prompt injection:** User-controlled content fed into Claude API prompts can manipulate AI behavior. A malicious user could craft a LinkedIn post or voice questionnaire answer that hijacks the system prompt, causing Claude to generate harmful content, leak other users' voice profiles, or ignore safety constraints.
- **NoSQL/Redis injection:** BullMQ job payloads constructed with unsanitized user input could manipulate job parameters.

**Required controls:**
- Use parameterized queries exclusively (Prisma ORM or `pg` with `$1` placeholders). Zero raw string SQL.
- Treat all AI prompt inputs as untrusted. Use structural separation: put user content in a designated JSON field rather than string-concatenating into the system prompt.
- Validate and sanitize content pillar names, post content, and questionnaire answers before they enter any prompt template.
- Validate BullMQ job payloads against a strict schema before execution.

### A04: Insecure Design

**Risk Level: HIGH**

**Specific risks:**

- **Auto-publish without confirmation:** The PRD notes auto-publish is "off by default" but will be a feature. Publishing content autonomously on behalf of a user is an irreversible action. There is no "undo" for a live LinkedIn post visible to thousands of connections.
- **Batch publishing race condition:** If a user is disconnected mid-approval and a scheduled job fires, the system may publish an unapproved post.
- **No publish rate limiting per user:** If the job queue is corrupted or a bug triggers mass re-queuing, a user could have 50 posts published in minutes — resulting in an immediate LinkedIn ban.
- **Cascading token use:** The system that fetches analytics uses the same token as the system that publishes. A token compromised for analytics reads is also a token that can publish.

**Required controls:**
- Implement a pre-publish confirmation lock: a post must have `status = 'approved'` AND a `approved_at` timestamp within a configurable window before the worker will publish it.
- Hard limit: no more than 3 LinkedIn API publish calls per user per hour, enforced at the worker level with a Redis counter.
- Consider separate OAuth scopes for read operations vs. write operations if LinkedIn API supports it (or use separate token sets).

### A05: Security Misconfiguration

**Risk Level: HIGH**

**Specific risks:**

- Debug mode or stack traces exposed in production API responses
- CORS configured with `origin: '*'` on the FastAPI backend
- S3/R2 buckets with public read access (media files are user-private until published)
- Redis exposed on a public port without authentication
- Default PostgreSQL credentials used in staging environments that share infra with production
- NextAuth.js `NEXTAUTH_SECRET` left as the default or set to a weak value
- LinkedIn OAuth client secret stored in the frontend bundle

**Required controls:**
- Set `NODE_ENV=production` and equivalent; verify it disables error stack traces in responses
- CORS: allowlist only the specific frontend origins (production domain + staging domain)
- S3/R2: private buckets; use pre-signed URLs for serving media. Never make buckets public.
- Redis: require `AUTH` password; bind to internal network only
- LinkedIn client secret lives only in backend environment; the frontend only receives the authorization URL

### A06: Vulnerable and Outdated Components

**Risk Level: MEDIUM**

**Specific risks:**

- `next`, `fastapi`, `bullmq`, `next-auth` — all fast-moving packages with frequent security patches
- LinkedIn SDK or HTTP client libraries with known CVEs
- AI SDK packages (Anthropic SDK) receiving breaking security fixes
- Image generation libraries with deserialization vulnerabilities
- Python packages with transitive dependency vulnerabilities

**Required controls:**
- `npm audit --audit-level=high` and `pip audit` in CI pipeline; block merge on HIGH/CRITICAL
- Dependabot or Renovate for automated dependency PRs
- Pin exact versions in production; use lock files (`package-lock.json`, `poetry.lock`)
- Monthly dependency review as a calendar task

### A07: Identification and Authentication Failures

**Risk Level: CRITICAL**

**Specific risks:**

- **Account takeover via email link:** If "magic link" login is used without proper token expiry or single-use enforcement, link forwarding allows account takeover.
- **LinkedIn OAuth state parameter missing or not validated:** Without CSRF protection on the OAuth callback, an attacker can trick a user into linking their LinkedIn account to the attacker's Auto-Linked account.
- **Weak session management:** Sessions not invalidated on password change or LinkedIn disconnect.
- **No brute-force protection:** Login endpoint accepts unlimited attempts.
- **JWT without expiry:** Long-lived access JWTs that don't expire until explicit logout.

**Required controls:**
- Enforce the `state` parameter in LinkedIn OAuth: generate cryptographically random value, store in session, verify on callback
- Implement PKCE for the LinkedIn OAuth flow
- JWT: short-lived access tokens (15 minutes) + refresh token rotation
- Rate limit login attempts: 5 per minute per IP, 10 per hour per email
- Invalidate all sessions on password change and on LinkedIn OAuth disconnect
- Magic links: single-use, 15-minute expiry, bound to the requesting IP

### A08: Software and Data Integrity Failures

**Risk Level: MEDIUM**

**Specific risks:**

- **BullMQ job tampering:** If Redis is compromised, an attacker can inject malicious job payloads — e.g., pointing a publish job at a different user's token or different post content.
- **Webhook integrity:** If LinkedIn sends webhooks (token expiry notifications, etc.) without signature verification, an attacker can spoof these events to force token revocations or status changes.
- **Supply chain attack:** Malicious npm package introduced via a compromised dependency.

**Required controls:**
- Validate all BullMQ job payloads against a strict JSON schema before processing
- Verify webhook signatures (HMAC-SHA256) before processing any incoming webhook
- Use `npm ci` (not `npm install`) in CI/CD to enforce lock file integrity
- Enable npm package provenance checks where available

### A09: Security Logging and Monitoring Failures

**Risk Level: HIGH**

**Specific risks:**

- LinkedIn tokens appearing in logs when API calls fail (error logs often include request headers)
- No alerting when a user's LinkedIn token is used from an unexpected IP
- No alerting on bulk publish failures (which could indicate token theft and LinkedIn blocking the attacker)
- No audit trail of who approved or modified posts in Team mode
- Logs stored indefinitely, accumulating PII (email addresses, post content)

**Required controls:**
- Structured logging with explicit token scrubbing middleware — mask any field matching `token`, `secret`, `key`, `password`, `authorization`
- Alert on: >3 failed LinkedIn API calls in 1 minute for a single user; unusual publish time (outside user's configured schedule); login from new country
- Audit log table: `(user_id, action, resource_id, timestamp, ip_address)` for all post approve/publish/edit actions
- Log retention: 90 days for application logs, 1 year for audit logs. Purge on schedule.

### A10: Server-Side Request Forgery (SSRF)

**Risk Level: MEDIUM**

**Specific risks:**

- **Trending topics feature:** The PRD mentions fetching trending topics via "news feeds." If the URL for these feeds can be influenced by user input, an attacker can point the server at internal cloud metadata endpoints (e.g., `http://169.254.169.254/latest/meta-data/` on AWS) to extract instance credentials.
- **Media URL handling:** If the system accepts user-provided media URLs and fetches them server-side (e.g., to upload to LinkedIn), this is a direct SSRF vector.
- **Content repurposing (v2):** Fetching blog posts / newsletters from user-provided URLs is a high-risk SSRF surface.

**Required controls:**
- Never allow user-supplied URLs to be fetched server-side without validation
- Allowlist URL schemes to `https://` only
- Resolve and block requests to RFC 1918 ranges (10.x, 172.16.x, 192.168.x) and link-local (169.254.x.x) before fetching
- Use a dedicated outbound proxy that enforces egress allowlists for user-provided URL fetches

---

## 4. Authentication and Authorization

### 4.1 User Authentication Flow

Auto-Linked uses two authentication layers: app-level auth (email/password or social login via NextAuth.js/Clerk) and LinkedIn OAuth (for API access).

**App-level auth requirements:**

```
Password requirements:
  - Minimum 12 characters
  - Hashed with bcrypt (cost factor >= 12) or Argon2id
  - NEVER stored or logged in plaintext at any point

Session requirements:
  - JWT access token: 15-minute expiry
  - Refresh token: 7-day expiry, rotated on each use, stored in HttpOnly cookie
  - Refresh token stored as bcrypt hash in DB (so DB breach doesn't yield usable tokens)
  - Session invalidated on: logout, password change, email change, account deletion

MFA:
  - TOTP (Google Authenticator) recommended for Pro/Team tiers
  - Required for Team mode admins (v2)
```

**Social login (Google/GitHub via NextAuth.js):**
- Verify `id_token` signature against provider's JWKS endpoint before creating session
- Do not trust `email` from OAuth payload without `email_verified: true`
- Link social accounts to existing email accounts only with explicit user confirmation

### 4.2 LinkedIn OAuth Security

The LinkedIn OAuth flow is the most security-critical flow in the product. A flawed implementation here gives attackers write access to users' professional identities.

**Required implementation:**

```
Step 1: Authorization Request
  - Generate state = crypto.randomBytes(32).toString('hex')
  - Generate PKCE: code_verifier = random 43-128 char string
               code_challenge = base64url(sha256(code_verifier))
  - Store state + code_verifier in server-side session (not cookie, not URL param)
  - Include state and code_challenge in authorization URL

Step 2: Callback Handling
  - Verify state matches stored state BEFORE exchanging code
  - If state mismatch: reject, log security event, do not proceed
  - Exchange code + code_verifier for tokens
  - Verify token response contains expected scopes (r_liteprofile, w_member_social)

Step 3: Token Storage
  - Encrypt access_token and refresh_token with AES-256-GCM
  - Use a per-user encryption key derived from a master key + user_id (so a leaked master key alone is not sufficient)
  - Store encrypted blobs in DB; store encryption key in secrets manager
  - Never log, cache in Redis unencrypted, or return tokens in API responses

Step 4: Token Refresh
  - Refresh 30 minutes before expiry (background job)
  - Rotate refresh token on every use (if LinkedIn supports it)
  - On refresh failure: set user's linkedin_status = 'reconnect_required'; notify user; halt publishing
  - Delete old token immediately after successful rotation
```

**LinkedIn scopes — principle of least privilege:**

| Scope | Required For | When to Request |
|-------|-------------|-----------------|
| `r_liteprofile` | Display user name/photo | OAuth onboarding |
| `r_basicprofile` | Additional profile data | OAuth onboarding |
| `w_member_social` | Publishing posts | OAuth onboarding |
| `r_organization_social` | Past post fetch | Request separately if needed |

Do not request `r_organization_social` at onboarding if past post fetching can be done without it. Request additional scopes only when the feature is used (incremental authorization).

### 4.3 API Endpoint Authorization

Every backend endpoint must apply authorization at three levels:

**Level 1 — Authentication check:** Is the request from a valid, non-expired session?
**Level 2 — Ownership check:** Does the authenticated user own the resource being accessed?
**Level 3 — Tier check:** Does the user's subscription tier permit this action?

```
Middleware stack (applied in order):
  1. requireAuth()         — validates JWT, returns 401 if invalid/expired
  2. requireOwnership()    — verifies resource.user_id === req.user.id, returns 403 if not
  3. requireTier('pro')    — checks subscription tier, returns 402/403 if insufficient
```

**High-risk endpoints requiring all three levels:**

| Endpoint | Auth | Ownership | Tier |
|----------|------|-----------|------|
| POST /posts/:id/approve | Yes | Yes | — |
| POST /posts/:id/publish | Yes | Yes | — |
| GET /posts/:id/analytics | Yes | Yes | Pro |
| POST /generate | Yes | — | Free: limit check |
| DELETE /users/:id | Yes | Yes (self only) | — |
| GET /users/:id/voice-profile | Yes | Yes | — |
| POST /linkedin/disconnect | Yes | Yes | — |

### 4.4 Role-Based Access Control (Free / Pro / Team)

```
Free:
  - Max 3 approved posts per week (enforced server-side, not just UI)
  - No analytics endpoints
  - No image/carousel generation
  - Text-only publishing

Pro:
  - Unlimited posts
  - Analytics access
  - Image + carousel generation
  - All publishing formats

Team (v2):
  - team_admin: can create/remove members, approve posts on behalf of members
  - team_member: can view own posts; cannot access other members' content
  - team_viewer: read-only access to team analytics
  - Admin cannot access member's LinkedIn token directly — the system acts on their behalf
```

**Critical:** Tier limits must be enforced at the database/service layer. Client-side checks (hiding UI elements) are cosmetic only and trivially bypassed.

---

## 5. Data Protection

### 5.1 Encryption at Rest

**PostgreSQL field-level encryption:**

LinkedIn tokens are the highest-value target in the database. Standard database encryption (TDE) protects against physical disk theft but not against a compromised database user. Field-level encryption provides an additional layer.

```sql
-- Column schema (tokens stored as encrypted blobs)
ALTER TABLE users
  ADD COLUMN linkedin_access_token_enc  BYTEA,    -- AES-256-GCM encrypted
  ADD COLUMN linkedin_refresh_token_enc BYTEA,
  ADD COLUMN linkedin_token_iv          BYTEA,    -- IV per token
  ADD COLUMN linkedin_token_tag         BYTEA;    -- GCM auth tag

-- NEVER store plain text tokens
-- The column oauth_tokens (from PRD data model) must NOT be a plain JSON field
```

**Voice profile and post content:**
- Voice profiles contain behavioral PII (writing patterns, topic preferences). Store as encrypted JSON or use PostgreSQL column encryption for the `voice_profile` JSONB column.
- Post content (drafts in review queue) should be considered sensitive until published. Restrict DB access by service role.

**Key management:**
- Use AWS KMS, HashiCorp Vault, or equivalent for master encryption keys
- Never store the encryption key in the same database that holds the encrypted data
- Rotate encryption keys annually; implement key rotation without downtime (re-encrypt in place)

### 5.2 Encryption in Transit

- All external traffic: TLS 1.2 minimum, TLS 1.3 preferred
- HSTS header: `Strict-Transport-Security: max-age=31536000; includeSubDomains; preload`
- Internal service communication: TLS even inside the private network (mutual TLS for service-to-service in production)
- Disable: TLS 1.0, TLS 1.1, weak cipher suites (RC4, DES, 3DES), SSLv3
- Certificate rotation: automated via Let's Encrypt or ACM; alert 30 days before expiry

### 5.3 Token Storage Strategy

The `oauth_tokens` field described in the PRD data model must not be implemented as a plaintext JSON column. The following strategy is required:

```
Storage layers:

1. Database (persistent):
   - Encrypted with AES-256-GCM using per-record IV
   - Key stored in secrets manager (not env file)
   - Access restricted to backend service DB user only

2. Redis (transient, for active publishing jobs):
   - Tokens decrypted only at job execution time
   - Stored in Redis with TTL = job execution window (max 5 minutes)
   - Redis key pattern: job:{job_id}:token (not user:{user_id}:token — reduces blast radius)
   - Redis AUTH password required; no public exposure

3. Application memory:
   - Decrypted token held in memory only for the duration of the API call
   - Not assigned to variables that persist beyond the function scope
   - Not included in any serialized state, session, or log

4. Never stored in:
   - Browser localStorage or sessionStorage
   - URL parameters
   - HTTP response bodies (to the frontend)
   - Error messages or logs
   - Environment variables on shared hosting
```

### 5.4 Data Retention and Deletion Policy

| Data Type | Retention | Deletion Trigger |
|-----------|-----------|------------------|
| LinkedIn tokens | Until disconnect or account deletion | User disconnects LinkedIn; account deleted |
| Voice profiles | Until account deletion | User request; account deletion |
| Past fetched posts | 90 days max, or until account deletion | Rolling purge; account deletion |
| Generated drafts (skipped/rejected) | 30 days | Rolling purge |
| Published post records | 2 years (for analytics continuity) | Account deletion within 30 days |
| Analytics snapshots | 2 years | Account deletion within 30 days |
| Audit logs | 1 year | Non-deletable (compliance) |
| Email addresses | Until account deletion | Account deletion within 30 days |
| Payment records | 7 years (legal requirement) | Not deleted |

**Right to erasure (GDPR Article 17):**
- Implement `DELETE /users/me` endpoint that triggers a full data erasure job
- Erasure job: delete tokens immediately; schedule deletion of posts, analytics, voice profile within 30 days
- Return confirmation with estimated completion time
- Payment records exempt from immediate deletion (legal hold)

### 5.5 GDPR / CCPA Compliance

**GDPR requirements (applies to EU users):**

- **Lawful basis:** Process user data under "contract" (necessary to provide the service) and "consent" (for analytics and email notifications). Document each data type's legal basis.
- **Data minimization:** Only collect what is necessary. Do not store full LinkedIn post content longer than needed for voice analysis.
- **Privacy by design:** New features must include a privacy impact assessment before implementation.
- **Data portability (Article 20):** Provide `GET /users/me/export` returning all user data as JSON.
- **DPA:** Execute Data Processing Agreements with: Anthropic (Claude API), OpenAI (DALL-E), AWS/Cloudflare (infrastructure), Stripe (payments).

**CCPA requirements (applies to California users):**

- Privacy policy must disclose all data collection and third-party sharing
- "Do Not Sell My Personal Information" option (even if data is not sold)
- Honor opt-out within 15 business days

**PII in AI prompts:**
- User's past LinkedIn posts sent to Claude API contain PII (names, employers, opinions)
- Confirm Anthropic's data processing agreement covers this use case
- Do not use user content to train models without explicit opt-in consent
- Document in privacy policy that post content is sent to Claude API for processing

---

## 6. API Security

### 6.1 Rate Limiting Strategy

Rate limiting serves two purposes: protecting against abuse and protecting users from accidental runaway behavior (e.g., a bug that triggers mass post generation).

**Tier-based rate limits:**

| Endpoint | Free | Pro | Team | Window |
|----------|------|-----|------|--------|
| POST /generate | 5 req | 30 req | 100 req | per hour |
| POST /posts/:id/approve | 10 req | 50 req | 200 req | per hour |
| POST /linkedin/publish (internal worker) | 3 calls | 3 calls | 3 calls | per user per hour |
| GET /analytics/* | 10 req | 60 req | 200 req | per hour |
| POST /auth/login | 5 req | 5 req | 5 req | per minute per IP |
| POST /auth/register | 3 req | — | — | per hour per IP |

**Implementation:**
- Use `express-rate-limit` (Node) or `slowapi` (FastAPI) with Redis backing for distributed rate limiting
- Return `Retry-After` header on 429 responses
- Separate rate limit counters per user ID (not just per IP) to handle proxies
- LinkedIn API calls: enforce LinkedIn's own limits (100 requests/day per member) with a Redis counter; never attempt a call that would exceed the limit

### 6.2 Input Validation

All user-supplied input must be validated at the API boundary before any processing.

**Validation requirements by endpoint:**

```
POST /onboarding/questionnaire:
  - tone: enum(['professional', 'casual', 'provocative', 'educational'])
  - posting_frequency: enum(['daily', '3x/week', '5x/week'])
  - pillars: array, max 5 items, each item max 100 chars, no HTML
  - Strip and reject any <script>, javascript:, or data: URI content

POST /posts/:id/edit:
  - content: string, max 3000 chars (LinkedIn limit), no executable content
  - Sanitize with DOMPurify-equivalent on server side even if frontend sanitizes

POST /content-pillars:
  - name: string, max 50 chars, alphanumeric + spaces + hyphens only
  - description: string, max 500 chars
  - weight: float, 0.0-1.0 range

POST /schedule:
  - time: ISO 8601 time string, validated against timezone
  - days: array of valid weekday names
```

**General rules:**
- Reject requests with unexpected fields (strict schema validation, not additive)
- Validate content-type header; reject malformed JSON
- Maximum request body size: 50KB for all endpoints except media upload (which has its own limits)
- Validate LinkedIn post content against LinkedIn's character limits before attempting API call (avoid wasting API quota on doomed requests)

### 6.3 CSRF Protection

The application uses both session cookies and JWTs. CSRF applies to cookie-based flows.

**Requirements:**
- `SameSite=Strict` on all session cookies
- `HttpOnly=true` on all session and refresh token cookies
- `Secure=true` on all cookies (HTTPS only)
- Double-submit CSRF token pattern for state-mutating endpoints if `SameSite=Strict` is not sufficient (e.g., cross-origin API calls)
- NextAuth.js: verify that the built-in CSRF protection is enabled and not overridden

### 6.4 CORS Configuration

**Required configuration:**

```javascript
// Correct
cors({
  origin: [
    'https://app.autolinked.com',
    'https://staging.autolinked.com',
  ],
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH'],
  allowedHeaders: ['Content-Type', 'Authorization'],
  credentials: true,  // Required for cookies
})

// WRONG — never do this
cors({ origin: '*' })                        // allows any origin
cors({ origin: true })                       // reflects request origin
cors({ credentials: true, origin: '*' })    // invalid combination; browsers reject it but some clients don't
```

**Additional rules:**
- The FastAPI backend must have its own CORS configuration independent of the Next.js layer — do not rely on the frontend to enforce origin restrictions
- Preflight OPTIONS requests must return correct headers without triggering authentication middleware

### 6.5 API Key Rotation

| Key | Rotation Frequency | Trigger for Immediate Rotation |
|-----|--------------------|-------------------------------|
| Claude API key | Every 90 days | Any suspected exposure |
| DALL-E / image gen key | Every 90 days | Any suspected exposure |
| LinkedIn client secret | Every 180 days | Any suspected exposure |
| NextAuth secret | Every 90 days | Any suspected exposure |
| DB encryption master key | Annual | Any suspected exposure |
| Redis AUTH password | Every 90 days | Any suspected exposure |

Rotation procedure:
1. Generate new key in provider console
2. Deploy new key to secrets manager
3. Perform zero-downtime rotation (keep both old and new active during transition)
4. Verify new key works in staging
5. Deploy to production
6. Revoke old key
7. Update rotation log

---

## 7. LinkedIn-Specific Risks

### 7.1 Token Theft Scenario

**Threat:** An attacker who obtains a user's LinkedIn access token can:
- Post arbitrary content to the user's LinkedIn profile
- Damage professional reputation irreversibly
- Use the account for spam, scam, or disinformation campaigns
- Read the user's connections and network data (within granted scopes)

**Attack vectors specific to Auto-Linked:**
- Database breach: plaintext tokens → immediate mass account compromise
- Redis breach: tokens in job queue → compromise of users with pending scheduled posts
- Log exposure: tokens logged during API error debugging
- XSS attack: if the frontend ever handles tokens, a script injection could exfiltrate them
- SSRF from Redis: attacker uses a misconfigured Redis instance to read job data

**Mitigations:**
- Encryption at rest (see Section 5.3)
- Tokens never touch the frontend
- Token masking in all log output
- Redis on internal network with AUTH
- Immediate revocation capability: `POST /users/me/linkedin/revoke` endpoint that deletes tokens from DB, Redis, and calls LinkedIn's token revocation endpoint

### 7.2 Account Ban Due to Automated Posting Patterns

**Threat:** LinkedIn detects Auto-Linked as automation and bans user accounts or revokes API access.

**Risk factors:**
- Posting at exactly the same time every day (non-human pattern)
- Posting more frequently than a human would (>5 posts/day)
- Identical formatting across multiple users (template fingerprint)
- Rapid sequential API calls (bulk scheduling)
- Publishing from a datacenter IP rather than user's browser

**Mitigations:**
- Add random jitter (±15 minutes) to all scheduled publish times
- Enforce maximum 3 posts/day per user at the scheduling layer
- Ensure voice profiles produce genuinely different content for each user — avoid shared templates
- Use LinkedIn's official Marketing API (not scraping or unofficial endpoints)
- Implement exponential backoff on all LinkedIn API errors, especially 429 (rate limit) and 403
- Monitor for LinkedIn API deprecation announcements and maintain a compatibility layer

### 7.3 ToS Violation Risks

**LinkedIn Terms of Service relevant prohibitions:**
- Automated engagement (auto-like, auto-comment, auto-follow) — the PRD explicitly rules this out (correct decision)
- Scraping without consent — fetching past posts must use the official API or explicit user-granted access
- Impersonation — generating content that misrepresents who the user is
- Spam — posting duplicate or near-duplicate content

**Required controls:**
- Never implement auto-like, auto-comment, or auto-follow regardless of user request
- Past post fetching: use only LinkedIn API endpoints; do not use browser automation or cookie-based scraping
- Content deduplication check: before publishing, verify the post content is not a near-duplicate of a recently published post (cosine similarity check)
- Post a clear disclosure in user-facing materials that posts are AI-assisted (supports LinkedIn's transparency expectations)

### 7.4 Token Revocation Handling

When a LinkedIn token is revoked (user changes password, revokes app access in LinkedIn settings, or LinkedIn force-revokes due to policy violation):

**Required behavior:**
1. LinkedIn API returns `401 Unauthorized`
2. Worker detects 401 response
3. Worker marks `users.linkedin_status = 'disconnected'`
4. Worker cancels all pending publish jobs for this user
5. Worker sends user notification: "Your LinkedIn connection needs to be re-established"
6. Worker logs security event (token revocation can indicate account compromise)
7. Worker does NOT retry with the same token

**Dead token detection:**
- Run a daily lightweight validation job: attempt a `GET /v2/me` call for each user with an active token
- Flag tokens that return 401 before the user's next scheduled post attempts
- Alert users proactively rather than letting them discover their post didn't go out

---

## 8. Infrastructure Security

### 8.1 Secret Management

**Hierarchy of secret storage (most to least preferred):**

1. **Secrets manager** (AWS Secrets Manager, HashiCorp Vault, GCP Secret Manager): Claude API key, LinkedIn client secret, DB encryption master key, DALL-E key
2. **Environment variables** (set in deployment platform, not in `.env` files committed to source): Database URL, Redis URL, NextAuth secret
3. **Never acceptable:** Hardcoded in source code, committed `.env` files, in-container config files, in Docker image layers

**Development secrets:**
- Developers use separate non-production API keys with restricted permissions
- Never use production LinkedIn client credentials in development
- Use a shared secrets manager (1Password Teams, Doppler) for team secret sharing — not Slack, email, or git

**Secret scanning:**
- `git-secrets` or `gitleaks` pre-commit hook on all developer machines
- GitHub secret scanning enabled on repository
- CI/CD pipeline scans for secrets before any build artifacts are produced
- If a secret is accidentally committed: immediately rotate it, remove from git history with `git filter-repo`, consider the secret compromised even if the commit was brief

### 8.2 Container Security

The BullMQ workers are the highest-privilege containers in the system — they hold the ability to both read LinkedIn tokens and make API calls.

**Requirements:**
- Workers run as non-root user (`USER node` or `USER app` in Dockerfile)
- Read-only filesystem where possible; explicitly mount writable volumes only where needed
- No SSH access to production containers; use `kubectl exec` with audit logging if debugging is needed
- Container images scanned with Trivy or Snyk before deployment; block deployment on HIGH/CRITICAL CVEs
- Separate container images for API, frontend, and workers — no monolithic container with unnecessary tools
- Worker containers have network egress restricted to: LinkedIn API, Claude API, DALL-E API, PostgreSQL, Redis — nothing else

**Kubernetes / container platform:**
- Secrets injected via secrets manager sidecar (AWS Secrets Manager CSI, Vault Agent Injector) — not via `env` in deployment YAML
- Network policies enforce inter-pod communication rules
- Pod security standards: `restricted` profile for worker pods

### 8.3 Dependency Vulnerability Scanning

**CI/CD pipeline gates:**

```yaml
# Required pipeline steps (fail build if any fail)
steps:
  - name: npm audit
    command: npm audit --audit-level=high
    on_failure: block_merge

  - name: pip audit (if Python backend)
    command: pip-audit --desc on
    on_failure: block_merge

  - name: container scan
    command: trivy image --severity HIGH,CRITICAL --exit-code 1 $IMAGE
    on_failure: block_merge

  - name: secret scan
    command: gitleaks detect --source . --exit-code 1
    on_failure: block_merge
```

**Ongoing monitoring:**
- GitHub Dependabot alerts enabled for all repositories
- Weekly automated dependency update PRs (Renovate or Dependabot)
- Subscribe to security advisories for key packages: `next`, `bullmq`, `next-auth`, `@anthropic-ai/sdk`

### 8.4 Logging and Monitoring (Without Leaking PII)

**What to log:**

| Event | Log Level | Fields to Include | Fields to NEVER Include |
|-------|-----------|-------------------|------------------------|
| User login | INFO | user_id, ip, timestamp, success/fail | password, session token |
| LinkedIn OAuth complete | INFO | user_id, timestamp, scopes granted | access_token, refresh_token |
| Post published | INFO | user_id, post_id, timestamp, linkedin_post_id | post_content |
| LinkedIn API error | WARN | user_id, error_code, endpoint, timestamp | token, request headers |
| Token refresh | INFO | user_id, timestamp, success/fail | old_token, new_token |
| Rate limit hit | WARN | user_id or ip, endpoint, timestamp | — |
| Post content generated | DEBUG (dev only) | user_id, pillar, format, timestamp | post_content, voice_profile |
| Payment event | INFO | user_id, event_type, timestamp | card_number, CVV |

**Alerting rules:**

```
CRITICAL alerts (PagerDuty / immediate response):
  - >10 failed LinkedIn API calls across different users in 1 minute (token harvesting signal)
  - Any request to internal metadata endpoint (SSRF attempt)
  - Secret scanner detects potential token in logs
  - DB query contains DROP, TRUNCATE, or UPDATE without WHERE

HIGH alerts (Slack, <1 hour response):
  - Login failure rate >20% for any 5-minute window
  - >5 failed publish attempts for a single user
  - LinkedIn token revoked for >10 users in 1 hour (possible mass compromise signal)
  - Any 500 error rate >1% of requests

MEDIUM alerts (daily digest):
  - Dependency vulnerability advisory published for a dependency in use
  - User account accessed from new country
  - Unusual post volume for a user (>10x their normal rate)
```

**Log sanitization middleware (required before any log statement):**

```javascript
// Example Node.js log sanitizer
const SENSITIVE_PATTERNS = [
  /Bearer\s+[\w\-\.]+/gi,           // Bearer tokens
  /"access_token"\s*:\s*"[^"]+"/gi, // JSON token fields
  /"refresh_token"\s*:\s*"[^"]+"/gi,
  /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g, // emails in logs
];

function sanitizeLog(message) {
  return SENSITIVE_PATTERNS.reduce(
    (msg, pattern) => msg.replace(pattern, '[REDACTED]'),
    message
  );
}
```

---

## 9. Recommendations Matrix

### 9.1 MVP Security Requirements (Block Ship if Missing)

These controls must be in place before the first user touches the system. They are non-negotiable.

| Priority | Control | Rationale |
|----------|---------|-----------|
| P0-SEC-01 | LinkedIn tokens encrypted at rest (AES-256-GCM) | Token plaintext = instant account takeover for all users on DB breach |
| P0-SEC-02 | Ownership middleware on all post/publish endpoints | Missing check = any user can publish as any other user |
| P0-SEC-03 | LinkedIn OAuth `state` parameter + PKCE | Missing = OAuth CSRF, attacker links victim's LinkedIn to own account |
| P0-SEC-04 | Rate limiting on login and generation endpoints | Missing = brute force and API cost abuse |
| P0-SEC-05 | Secrets in environment / secrets manager (not hardcoded) | Hardcoded key = any developer with repo access has production access |
| P0-SEC-06 | HTTPS enforced, HSTS header set | Without TLS, tokens trivially intercepted in transit |
| P0-SEC-07 | HttpOnly + SameSite=Strict + Secure on session cookies | Missing = XSS can steal sessions; CSRF can trigger state mutations |
| P0-SEC-08 | JWT short expiry (15 min access, 7 day refresh with rotation) | Long-lived JWTs = revocation is impossible without a denylist |
| P0-SEC-09 | Parameterized queries exclusively (no raw SQL concatenation) | SQL injection on any query = full DB compromise |
| P0-SEC-10 | LinkedIn API 401 handling: halt publish, notify user, clear token | Without this, failed tokens cause silent publish failures or crash loops |
| P0-SEC-11 | Max 3 LinkedIn publishes per user per hour (Redis counter) | Without this, a bug could mass-post and trigger LinkedIn account ban |
| P0-SEC-12 | Log scrubbing middleware (tokens, emails never in logs) | Logs shipped to third-party services (Datadog, Sentry) would leak tokens |
| P0-SEC-13 | CORS: allowlist specific origins only | Without this, any website can make authenticated requests to the API |
| P0-SEC-14 | `npm audit` in CI pipeline, block on HIGH/CRITICAL | Known CVE in a dependency = known exploit path |

### 9.2 V1.1 Security Requirements (Ship Within 60 Days of MVP)

| Priority | Control | Rationale |
|----------|---------|-----------|
| P1-SEC-01 | Field-level encryption for voice profiles | Voice profiles are behavioral PII; warrant same protection as tokens |
| P1-SEC-02 | Token validation background job (daily dead-token check) | Proactive notification better than silent publish failure |
| P1-SEC-03 | Audit log table for all post approve/publish/edit actions | Required for investigating user disputes and security incidents |
| P1-SEC-04 | Data export endpoint (`GET /users/me/export`) | GDPR Article 20 compliance |
| P1-SEC-05 | Data deletion endpoint (`DELETE /users/me`) with purge job | GDPR Article 17 compliance |
| P1-SEC-06 | TOTP MFA option for Pro users | High-value accounts warrant stronger auth |
| P1-SEC-07 | SSRF protection on any user-provided URL fetching | Required before trending topics or content repurposing features |
| P1-SEC-08 | Container security scanning in CI/CD (Trivy) | Container vulnerabilities become runtime exploits |
| P1-SEC-09 | Prompt injection mitigations (structured prompt inputs) | Grows in importance as AI features expand |
| P1-SEC-10 | Privacy policy + cookie consent banner | Legal requirement in EU before collecting any data |

### 9.3 V2.0 Security Requirements (Team Mode Prerequisites)

| Priority | Control | Rationale |
|----------|---------|-----------|
| P2-SEC-01 | Full RBAC for Team mode (admin/member/viewer) | Team mode fundamentally changes authorization model |
| P2-SEC-02 | Per-member audit trail in Team mode | Team admin must not be able to post without a trail |
| P2-SEC-03 | MFA required for Team admins | Team mode gives one account access to multiple LinkedIn identities |
| P2-SEC-04 | Webhook signature verification (HMAC-SHA256) | If LinkedIn sends webhooks, unverified webhooks = event spoofing |
| P2-SEC-05 | Egress allowlist for user-provided URL fetches (content repurposing) | Content repurposing introduces SSRF surface area |
| P2-SEC-06 | Encryption key rotation procedure (zero-downtime) | Required for annual rotation policy |
| P2-SEC-07 | Penetration test by external security firm | Before handling Team plan ($79/mo) customer data |

### 9.4 Security Review Triggers

The following code changes must be reviewed by a security specialist (or this threat model updated) before merging:

- Any change to LinkedIn OAuth callback handling
- Any new endpoint that accepts a URL as input
- Any change to the BullMQ job payload schema
- Any new external API integration
- Any database schema change to the `users` table (especially `oauth_tokens`)
- Any change to authentication or session management
- Addition of Team mode or multi-user features
- Any change to CORS or CSP configuration

---

## Appendix A: Security Checklist for Pre-Launch

```
Authentication
  [ ] LinkedIn OAuth state parameter validated on callback
  [ ] PKCE implemented for LinkedIn OAuth
  [ ] JWT expiry: access=15min, refresh=7d
  [ ] Refresh tokens rotate on each use
  [ ] Session invalidated on disconnect / password change
  [ ] Login rate limited (5/min per IP)
  [ ] Passwords hashed with bcrypt cost>=12 or argon2id

Token Storage
  [ ] access_token encrypted in DB (AES-256-GCM)
  [ ] refresh_token encrypted in DB (AES-256-GCM)
  [ ] Encryption key in secrets manager, not DB
  [ ] Tokens never logged (log scrubber in place)
  [ ] Tokens never returned to frontend in API responses
  [ ] Redis requires AUTH; not publicly exposed

Authorization
  [ ] Ownership middleware on all post/publish endpoints
  [ ] Tier enforcement server-side (not just UI)
  [ ] No resource enumeration (IDs are UUIDs, not sequential integers)

API
  [ ] CORS: specific origins only (no wildcard)
  [ ] HTTPS enforced; HTTP redirects to HTTPS
  [ ] HSTS header set with preload
  [ ] CSP header configured
  [ ] Rate limiting on all public endpoints
  [ ] Input validation on all endpoints (schema-based)
  [ ] Request body size limits enforced
  [ ] SQL: parameterized queries only; no string concatenation

Infrastructure
  [ ] No secrets in source code or Docker images
  [ ] npm audit passes at HIGH level in CI
  [ ] Container runs as non-root user
  [ ] S3/R2 buckets are private (no public access)
  [ ] Production error messages do not include stack traces

Compliance
  [ ] Privacy policy published before first user signup
  [ ] Cookie consent implemented for EU users
  [ ] Data export endpoint functional
  [ ] Data deletion endpoint functional and tested
  [ ] DPA executed with Anthropic, AWS/Cloudflare, Stripe
```

---

*This document should be reviewed and updated at each major feature release. All CRITICAL and HIGH findings must be resolved before MVP launch. Any new threat surface (new API integrations, new data types, new user roles) requires an addendum to this model.*
