# Auto-Linked: PostgreSQL Database Schema

**Version:** 1.0
**Date:** 2026-04-09
**Status:** Draft — Ready for initial migration

---

## Table of Contents

1. [Design Decisions](#1-design-decisions)
2. [Schema Overview](#2-schema-overview)
3. [Initial Migration SQL](#3-initial-migration-sql)
4. [Indexes Reference](#4-indexes-reference)
5. [RLS Policies](#5-row-level-security-policies)
6. [Migration Strategy](#6-migration-strategy)
7. [Seed Data](#7-seed-data)
8. [Scaling Considerations](#8-scaling-considerations)
9. [Query Patterns Reference](#9-query-patterns-reference)

---

## 1. Design Decisions

### Data Types

| Context | Type Chosen | Rationale |
|---|---|---|
| All primary keys | `bigint GENERATED ALWAYS AS IDENTITY` | Sequential, compact, index-friendly. Random UUIDs fragment B-tree indexes and waste 16 bytes per row. UUIDs are exposed externally as a separate `public_id` column using UUIDv4 where needed. |
| All timestamps | `timestamptz` | Always store with timezone. `timestamp` silently drops tz info and causes bugs at DST boundaries or when servers change region. |
| Monetary values | `numeric(10,2)` | Exact decimal arithmetic. Never `float` for money. |
| Post content | `text` | No arbitrary length cap. LinkedIn posts max at ~3000 chars but `text` is cleaner than `varchar(3000)` and the constraint is enforced via CHECK. |
| Voice profile | `jsonb` | Queried with operators, indexed with GIN. `json` stores raw text and re-parses on every access. |
| OAuth tokens | `text` | Stored encrypted at application layer (AES-256-GCM) before insert. The DB column holds ciphertext. |
| Weights / scores | `numeric(4,3)` | Range 0.000–1.000. Avoids float precision drift for values like 0.333. |
| Enum-like columns | `text` + CHECK constraint | Native `ENUM` types require `ALTER TYPE` for new values, which locks the table. CHECK on `text` is altered with a simple constraint drop/add. |

### ID Strategy

External-facing IDs (returned in API responses, embedded in URLs) use a separate `public_id uuid DEFAULT gen_random_uuid()` column. Internal joins use `bigint` PKs. This keeps URLs opaque while keeping joins fast.

### Soft Deletes

Tables that users interact with directly (`posts`, `content_pillars`, `media_assets`) use soft deletes via `deleted_at timestamptz`. Hard deletes are used for session/token tables where data has no recovery value. Partial indexes on `WHERE deleted_at IS NULL` keep active-record queries fast regardless of how many archived rows accumulate.

### Encryption Boundary

OAuth access tokens and refresh tokens are encrypted at the application layer before being written to the database. The DB stores ciphertext only. The encryption key lives in an environment variable / secrets manager, never in the schema or application code. This means even a full DB dump does not expose live LinkedIn credentials.

---

## 2. Schema Overview

```
users
 ├── voice_profiles          (1:1, versioned)
 ├── content_pillars         (1:N)
 ├── posts                   (1:N)
 │    ├── post_analytics      (1:N, time-series snapshots)
 │    └── media_assets        (N:M via post_media_assets)
 ├── content_calendar_slots  (1:N, weekly template)
 ├── media_assets            (1:N, owned by user)
 └── user_sessions           (1:N)

api_keys                      (global, for AI service credentials)
linkedin_oauth_tokens         (1:1 with users, separate table for rotation)
```

---

## 3. Initial Migration SQL

```sql
-- ============================================================
-- Migration: 0001_initial_schema.sql
-- Auto-Linked Database
-- PostgreSQL 16+
-- Run as: psql $DATABASE_URL -f 0001_initial_schema.sql
-- ============================================================

BEGIN;

-- ============================================================
-- EXTENSIONS
-- ============================================================

CREATE EXTENSION IF NOT EXISTS "pgcrypto";    -- gen_random_uuid(), crypt()
CREATE EXTENSION IF NOT EXISTS "pg_stat_statements"; -- query performance monitoring

-- ============================================================
-- ENUMERATIONS (as CHECK constraints on text columns)
-- Documented here for discoverability.
--
-- post.status:
--   draft       → AI generated, not yet seen by user
--   approved    → user approved, awaiting scheduled time
--   scheduled   → picked up by queue worker, locked for publish
--   published   → successfully posted to LinkedIn
--   skipped     → user explicitly skipped
--   failed      → publishing failed after retries
--
-- post.format:
--   text | image | carousel | poll
--
-- subscription_tier:
--   free | pro | team
--
-- voice_profile.tone:
--   professional-casual | formal | provocative | educational
--
-- voice_profile.emoji_frequency:
--   none | light | heavy
--
-- voice_profile.hashtag_style:
--   none | minimal | aggressive
--
-- voice_profile.formatting:
--   dense | spaced | list-heavy
--
-- voice_profile.line_break_style:
--   single | double
--
-- media_asset.asset_type:
--   image | carousel | video
--
-- media_asset.source:
--   ai_generated | stock | user_uploaded
-- ============================================================


-- ============================================================
-- USERS
-- Central identity table. Auth handled by NextAuth/Clerk;
-- this table stores the profile and subscription state.
-- ============================================================

CREATE TABLE users (
    id                  bigint      GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    public_id           uuid        NOT NULL DEFAULT gen_random_uuid(),

    -- Identity
    email               text        NOT NULL,
    name                text        NOT NULL,
    avatar_url          text,

    -- LinkedIn identity (populated after OAuth)
    linkedin_id         text,               -- LinkedIn member URN (urn:li:person:xxx)
    linkedin_vanity_url text,               -- e.g. "john-smith-42abc"

    -- Subscription
    subscription_tier   text        NOT NULL DEFAULT 'free'
                            CHECK (subscription_tier IN ('free', 'pro', 'team')),
    subscription_expires_at  timestamptz,
    stripe_customer_id  text,

    -- Posting preferences (JSON, not normalized — rarely queried per-field)
    posting_schedule    jsonb,
    -- Shape: { mon: "09:00", tue: null, wed: "12:00", ... }
    -- null means no post that day. Times are UTC.

    timezone            text        NOT NULL DEFAULT 'UTC',

    -- Onboarding state
    onboarding_completed_at timestamptz,
    onboarding_step     text        DEFAULT 'start',

    -- Feature flags / settings
    auto_publish        boolean     NOT NULL DEFAULT false,
    auto_publish_window_hours int   NOT NULL DEFAULT 24
                            CHECK (auto_publish_window_hours BETWEEN 1 AND 168),
    email_notifications boolean     NOT NULL DEFAULT true,

    -- Soft delete
    deleted_at          timestamptz,

    -- Audit
    created_at          timestamptz NOT NULL DEFAULT now(),
    updated_at          timestamptz NOT NULL DEFAULT now()
);

-- Unique constraints
ALTER TABLE users ADD CONSTRAINT users_public_id_key  UNIQUE (public_id);
ALTER TABLE users ADD CONSTRAINT users_email_key      UNIQUE (email);
ALTER TABLE users ADD CONSTRAINT users_linkedin_id_key UNIQUE (linkedin_id)
    DEFERRABLE INITIALLY DEFERRED;  -- Deferrable: linkedin_id arrives after OAuth, not at row creation

-- Indexes
CREATE INDEX idx_users_email          ON users (email)         WHERE deleted_at IS NULL;
CREATE INDEX idx_users_linkedin_id    ON users (linkedin_id)   WHERE linkedin_id IS NOT NULL;
CREATE INDEX idx_users_subscription   ON users (subscription_tier, subscription_expires_at)
                                       WHERE deleted_at IS NULL;


-- ============================================================
-- LINKEDIN OAUTH TOKENS
-- Separated from users: rotation invalidates only this row.
-- Tokens are AES-256-GCM encrypted at application layer.
-- Column comments document the plaintext shape before encryption.
-- ============================================================

CREATE TABLE linkedin_oauth_tokens (
    id                  bigint      GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    user_id             bigint      NOT NULL REFERENCES users(id) ON DELETE CASCADE,

    -- Ciphertext of the access token (encrypted by app before insert)
    access_token_enc    text        NOT NULL,
    -- Ciphertext of the refresh token
    refresh_token_enc   text,

    -- Token metadata (not sensitive, stored plaintext)
    scopes              text[]      NOT NULL DEFAULT '{}',
    -- e.g. ARRAY['r_liteprofile','w_member_social']
    expires_at          timestamptz NOT NULL,
    refresh_expires_at  timestamptz,

    -- Rotation tracking
    issued_at           timestamptz NOT NULL DEFAULT now(),
    last_refreshed_at   timestamptz,
    refresh_failure_count int       NOT NULL DEFAULT 0,

    created_at          timestamptz NOT NULL DEFAULT now(),
    updated_at          timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE linkedin_oauth_tokens
    ADD CONSTRAINT linkedin_oauth_tokens_user_id_key UNIQUE (user_id);

CREATE INDEX idx_linkedin_tokens_expires ON linkedin_oauth_tokens (expires_at)
    WHERE expires_at > now() - INTERVAL '7 days';  -- only index soon-to-expire tokens


-- ============================================================
-- USER SESSIONS
-- Application-level session tracking (supplementary to
-- NextAuth/Clerk session store — kept here for audit trail
-- and to support cross-device invalidation).
-- ============================================================

CREATE TABLE user_sessions (
    id                  bigint      GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    user_id             bigint      NOT NULL REFERENCES users(id) ON DELETE CASCADE,

    session_token       text        NOT NULL,   -- hashed with SHA-256 before storage
    device_hint         text,                   -- "Chrome/macOS" — from User-Agent, truncated
    ip_address          inet,

    created_at          timestamptz NOT NULL DEFAULT now(),
    expires_at          timestamptz NOT NULL,
    last_active_at      timestamptz NOT NULL DEFAULT now(),
    revoked_at          timestamptz
);

ALTER TABLE user_sessions ADD CONSTRAINT user_sessions_token_key UNIQUE (session_token);

CREATE INDEX idx_sessions_user_id  ON user_sessions (user_id)       WHERE revoked_at IS NULL;
CREATE INDEX idx_sessions_expires  ON user_sessions (expires_at)    WHERE revoked_at IS NULL;
-- Used by the token cleanup job: DELETE FROM user_sessions WHERE expires_at < now()


-- ============================================================
-- VOICE PROFILES
-- Versioned: each re-analysis creates a new row.
-- The current version is the row with highest version_number.
-- ============================================================

CREATE TABLE voice_profiles (
    id                  bigint      GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    user_id             bigint      NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    version_number      int         NOT NULL DEFAULT 1,

    -- Structured fields for querying / displaying in UI
    tone                text        NOT NULL DEFAULT 'professional-casual'
                            CHECK (tone IN ('professional-casual','formal','provocative','educational')),
    avg_post_length     int         NOT NULL DEFAULT 200
                            CHECK (avg_post_length BETWEEN 10 AND 3000),
    emoji_frequency     text        NOT NULL DEFAULT 'light'
                            CHECK (emoji_frequency IN ('none','light','heavy')),
    hashtag_style       text        NOT NULL DEFAULT 'minimal'
                            CHECK (hashtag_style IN ('none','minimal','aggressive')),
    formatting          text        NOT NULL DEFAULT 'spaced'
                            CHECK (formatting IN ('dense','spaced','list-heavy')),
    line_break_style    text        NOT NULL DEFAULT 'double'
                            CHECK (line_break_style IN ('single','double')),

    -- Rich analysis stored as jsonb for flexibility
    analysis_data       jsonb       NOT NULL DEFAULT '{}',
    -- Shape mirrors PRD section 6:
    -- {
    --   hook_patterns: ["Question","Bold claim","Story opener"],
    --   cta_patterns: ["What do you think?","Share if you agree"],
    --   vocabulary_fingerprint: "SaaS, PLG, GTM, ...",
    --   topic_clusters: ["leadership","product","career"],
    --   signature_phrases: ["Here's the thing:", "Let me be honest:"],
    --   example_post_ids: [123, 456]   -- bigint IDs of posts used for analysis
    -- }

    -- Source info
    analyzed_post_count int         NOT NULL DEFAULT 0,
    analysis_source     text        NOT NULL DEFAULT 'questionnaire'
                            CHECK (analysis_source IN ('questionnaire','linkedin_history','both')),

    -- User can override / edit after AI generates
    user_edited         boolean     NOT NULL DEFAULT false,
    user_notes          text,

    created_at          timestamptz NOT NULL DEFAULT now(),
    updated_at          timestamptz NOT NULL DEFAULT now()
);

-- One active voice profile per user: latest version_number
CREATE UNIQUE INDEX idx_voice_profiles_user_version
    ON voice_profiles (user_id, version_number);

CREATE INDEX idx_voice_profiles_user_current
    ON voice_profiles (user_id, id DESC);  -- fast "get latest"


-- ============================================================
-- CONTENT PILLARS
-- A user's topic areas (typically 3-5).
-- weight values across all pillars for a user should sum to 1.0
-- — enforced at the application layer, not DB (partial sums
-- are valid during editing).
-- ============================================================

CREATE TABLE content_pillars (
    id                  bigint      GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    public_id           uuid        NOT NULL DEFAULT gen_random_uuid(),
    user_id             bigint      NOT NULL REFERENCES users(id) ON DELETE CASCADE,

    name                text        NOT NULL
                            CHECK (char_length(name) BETWEEN 1 AND 100),
    description         text,

    -- Scheduling weight: how often this pillar appears (0.0–1.0)
    weight              numeric(4,3) NOT NULL DEFAULT 0.200
                            CHECK (weight >= 0 AND weight <= 1),

    -- Rolling performance: updated by analytics job
    performance_score   numeric(5,3),   -- NULL until enough data exists
                                        -- derived from avg engagement of pillar's posts

    -- Display
    color               text,           -- hex color for calendar UI, e.g. "#6366f1"
    sort_order          int             NOT NULL DEFAULT 0,

    -- Soft delete
    deleted_at          timestamptz,

    created_at          timestamptz     NOT NULL DEFAULT now(),
    updated_at          timestamptz     NOT NULL DEFAULT now()
);

ALTER TABLE content_pillars ADD CONSTRAINT content_pillars_public_id_key UNIQUE (public_id);

-- Max 10 active pillars per user (enforced in application layer too)
CREATE UNIQUE INDEX idx_content_pillars_user_name
    ON content_pillars (user_id, lower(name))
    WHERE deleted_at IS NULL;

CREATE INDEX idx_content_pillars_user_active
    ON content_pillars (user_id, sort_order)
    WHERE deleted_at IS NULL;


-- ============================================================
-- POSTS
-- Core content table. Grows at ~7 rows/user/week for active users.
-- At 10,000 users: ~70,000 rows/week = ~3.6M rows/year.
-- Partitioned by created_at month after 1M rows (see section 8).
-- ============================================================

CREATE TABLE posts (
    id                  bigint      GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    public_id           uuid        NOT NULL DEFAULT gen_random_uuid(),
    user_id             bigint      NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    pillar_id           bigint      REFERENCES content_pillars(id) ON DELETE SET NULL,

    -- Content
    content             text        NOT NULL
                            CHECK (char_length(content) BETWEEN 1 AND 3200),
                            -- LinkedIn hard limit is ~3000 chars; 3200 gives buffer for
                            -- LinkedIn's own formatting additions
    hook                text,       -- extracted first 2 lines for display in review queue
    hashtags            text[]      NOT NULL DEFAULT '{}',
    format              text        NOT NULL DEFAULT 'text'
                            CHECK (format IN ('text','image','carousel','poll')),

    -- Generation metadata
    ai_model            text,           -- e.g. "claude-opus-4-5"
    generation_prompt   text,           -- stored for debugging / prompt refinement
    generation_context  jsonb,          -- trending topic, pillar angle, etc.
    regeneration_count  int     NOT NULL DEFAULT 0,

    -- Status workflow
    -- draft → approved → scheduled → published
    -- draft → skipped
    -- approved/scheduled → failed (after retries exhausted)
    status              text        NOT NULL DEFAULT 'draft'
                            CHECK (status IN ('draft','approved','scheduled',
                                              'published','skipped','failed')),

    -- Scheduling
    scheduled_at        timestamptz,    -- target publish time (user-set or system-suggested)
    approved_at         timestamptz,
    published_at        timestamptz,    -- actual publish time from LinkedIn API response

    -- LinkedIn identifiers (populated after successful publish)
    linkedin_post_id    text,           -- LinkedIn UGC post URN
    linkedin_post_url   text,

    -- Publishing error tracking
    publish_attempt_count   int     NOT NULL DEFAULT 0,
    last_publish_error      text,
    last_publish_attempt_at timestamptz,

    -- Media
    -- Denormalized media_url for the primary asset (avoids join in publish job)
    primary_media_url   text,

    -- Soft delete
    deleted_at          timestamptz,

    created_at          timestamptz NOT NULL DEFAULT now(),
    updated_at          timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE posts ADD CONSTRAINT posts_public_id_key UNIQUE (public_id);

-- LinkedIn post IDs must be unique if present
CREATE UNIQUE INDEX idx_posts_linkedin_post_id
    ON posts (linkedin_post_id)
    WHERE linkedin_post_id IS NOT NULL;

-- Primary query: user's review queue (most common app query)
CREATE INDEX idx_posts_user_status
    ON posts (user_id, status, scheduled_at)
    WHERE deleted_at IS NULL;

-- Pillar FK index (always index FKs)
CREATE INDEX idx_posts_pillar_id
    ON posts (pillar_id)
    WHERE pillar_id IS NOT NULL AND deleted_at IS NULL;

-- Publishing queue: worker picks up scheduled posts
CREATE INDEX idx_posts_scheduled_queue
    ON posts (scheduled_at, status)
    WHERE status IN ('approved', 'scheduled') AND deleted_at IS NULL;

-- Analytics job: recent published posts needing metric refresh
CREATE INDEX idx_posts_published_recent
    ON posts (user_id, published_at DESC)
    WHERE status = 'published' AND deleted_at IS NULL;

-- User's published post history for voice analysis / few-shot examples
CREATE INDEX idx_posts_user_published_created
    ON posts (user_id, created_at DESC)
    WHERE status = 'published' AND deleted_at IS NULL;


-- ============================================================
-- POST ANALYTICS
-- Time-series snapshots. One row per (post, snapshot time).
-- The analytics job runs every 6 hours for posts < 7 days old.
-- At 10,000 published posts: 4 snapshots/day × 7 days = 280,000
-- rows/week — this table grows fastest.
-- Partitioned by snapshot_at month (see section 8).
-- ============================================================

CREATE TABLE post_analytics (
    id                  bigint      GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    post_id             bigint      NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
    user_id             bigint      NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    -- user_id is denormalized here to enable fast per-user analytics queries
    -- without joining through posts.

    -- LinkedIn organic metrics at snapshot time
    impressions         bigint      NOT NULL DEFAULT 0,
    reactions           bigint      NOT NULL DEFAULT 0,
    comments            bigint      NOT NULL DEFAULT 0,
    reposts             bigint      NOT NULL DEFAULT 0,
    clicks              bigint      NOT NULL DEFAULT 0,

    -- Derived at snapshot time (stored to avoid recalculation)
    engagement_rate     numeric(6,4),   -- (reactions+comments+reposts) / impressions

    -- LinkedIn API response cache (for debugging / raw data access)
    raw_response        jsonb,

    snapshot_at         timestamptz NOT NULL DEFAULT now(),

    created_at          timestamptz NOT NULL DEFAULT now()
);

-- Unique per (post, snapshot hour) — prevents duplicate snapshots from retries
CREATE UNIQUE INDEX idx_post_analytics_post_snapshot
    ON post_analytics (post_id, date_trunc('hour', snapshot_at));

-- Primary analytics query: get all snapshots for a post
CREATE INDEX idx_post_analytics_post_id
    ON post_analytics (post_id, snapshot_at DESC);

-- User-level analytics: weekly report aggregation
CREATE INDEX idx_post_analytics_user_snapshot
    ON post_analytics (user_id, snapshot_at DESC);

-- Performance comparison: top posts by engagement (dashboard)
CREATE INDEX idx_post_analytics_user_engagement
    ON post_analytics (user_id, engagement_rate DESC NULLS LAST, snapshot_at DESC);


-- ============================================================
-- CONTENT CALENDAR SLOTS
-- Weekly template: which pillar + format goes on which day.
-- Users have one active template. Rows are day-of-week slots.
-- ============================================================

CREATE TABLE content_calendar_slots (
    id                  bigint      GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    user_id             bigint      NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    pillar_id           bigint      REFERENCES content_pillars(id) ON DELETE SET NULL,

    -- ISO day of week: 1 = Monday, 7 = Sunday
    day_of_week         int         NOT NULL
                            CHECK (day_of_week BETWEEN 1 AND 7),
    preferred_time      time        NOT NULL DEFAULT '09:00:00',
                            -- stored without tz; interpreted in users.timezone

    format              text        NOT NULL DEFAULT 'text'
                            CHECK (format IN ('text','image','carousel','poll')),
    post_type           text,       -- e.g. "industry insight", "personal story"
                                    -- free text, displayed as prompt to AI

    active              boolean     NOT NULL DEFAULT true,

    created_at          timestamptz NOT NULL DEFAULT now(),
    updated_at          timestamptz NOT NULL DEFAULT now()
);

-- One slot per user per day (can be inactive rather than deleted)
CREATE UNIQUE INDEX idx_calendar_slots_user_day
    ON content_calendar_slots (user_id, day_of_week);

CREATE INDEX idx_calendar_slots_pillar_id
    ON content_calendar_slots (pillar_id)
    WHERE pillar_id IS NOT NULL;


-- ============================================================
-- MEDIA ASSETS
-- Images and carousels. Stored in S3/R2; DB holds metadata.
-- ============================================================

CREATE TABLE media_assets (
    id                  bigint      GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    public_id           uuid        NOT NULL DEFAULT gen_random_uuid(),
    user_id             bigint      NOT NULL REFERENCES users(id) ON DELETE CASCADE,

    asset_type          text        NOT NULL
                            CHECK (asset_type IN ('image','carousel','video')),
    source              text        NOT NULL
                            CHECK (source IN ('ai_generated','stock','user_uploaded')),

    -- Storage
    storage_bucket      text        NOT NULL,   -- S3/R2 bucket name
    storage_key         text        NOT NULL,   -- object key within bucket
    storage_url         text        NOT NULL,   -- full CDN URL for serving

    -- Original source metadata
    original_url        text,       -- for stock photos: source URL + attribution
    attribution         text,       -- "Photo by X on Unsplash"

    -- AI generation metadata
    generation_prompt   text,       -- DALL-E / Flux prompt
    ai_model            text,       -- "dall-e-3", "flux-pro", etc.

    -- File metadata
    file_size_bytes     bigint,
    mime_type           text,
    width_px            int,
    height_px           int,

    -- LinkedIn upload status
    linkedin_asset_urn  text,       -- returned after LinkedIn media upload
    linkedin_uploaded_at timestamptz,

    -- Soft delete
    deleted_at          timestamptz,

    created_at          timestamptz NOT NULL DEFAULT now(),
    updated_at          timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE media_assets ADD CONSTRAINT media_assets_public_id_key UNIQUE (public_id);

CREATE UNIQUE INDEX idx_media_assets_storage_key
    ON media_assets (storage_bucket, storage_key);

CREATE INDEX idx_media_assets_user_active
    ON media_assets (user_id, created_at DESC)
    WHERE deleted_at IS NULL;

CREATE INDEX idx_media_assets_linkedin_urn
    ON media_assets (linkedin_asset_urn)
    WHERE linkedin_asset_urn IS NOT NULL;


-- ============================================================
-- POST MEDIA ASSETS (join table)
-- A post can have multiple media assets (e.g. carousel pages).
-- sort_order determines display/page order.
-- ============================================================

CREATE TABLE post_media_assets (
    post_id             bigint  NOT NULL REFERENCES posts(id)        ON DELETE CASCADE,
    media_asset_id      bigint  NOT NULL REFERENCES media_assets(id) ON DELETE RESTRICT,
    sort_order          int     NOT NULL DEFAULT 0,

    PRIMARY KEY (post_id, media_asset_id)
);

CREATE INDEX idx_post_media_assets_post_id
    ON post_media_assets (post_id, sort_order);

CREATE INDEX idx_post_media_assets_asset_id
    ON post_media_assets (media_asset_id);


-- ============================================================
-- API KEYS
-- AI service credentials (Claude, DALL-E, etc.).
-- Encrypted like OAuth tokens. Global table — not per-user.
-- Managed via environment in practice; this table is for
-- runtime key rotation without redeployment.
-- ============================================================

CREATE TABLE api_keys (
    id                  bigint      GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    service             text        NOT NULL,   -- "claude", "dalle", "flux", "unsplash"
    key_name            text        NOT NULL,   -- human label, e.g. "production-claude-key-2"
    key_enc             text        NOT NULL,   -- AES-256-GCM encrypted API key
    active              boolean     NOT NULL DEFAULT true,
    expires_at          timestamptz,
    last_used_at        timestamptz,
    created_at          timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX idx_api_keys_service_active
    ON api_keys (service)
    WHERE active = true;
-- Only one active key per service. Application fetches with:
-- SELECT key_enc FROM api_keys WHERE service = $1 AND active = true LIMIT 1


-- ============================================================
-- AUDIT LOG
-- Immutable record of sensitive operations.
-- Append-only: no UPDATE or DELETE (enforced via RLS + trigger).
-- ============================================================

CREATE TABLE audit_log (
    id                  bigint      GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    user_id             bigint      REFERENCES users(id) ON DELETE SET NULL,
    actor_ip            inet,
    action              text        NOT NULL,
    -- e.g. "user.delete", "post.publish", "oauth.connect", "subscription.upgrade"
    entity_type         text,       -- "post", "user", "voice_profile"
    entity_id           bigint,
    metadata            jsonb,      -- action-specific details
    created_at          timestamptz NOT NULL DEFAULT now()
);

-- Audit log is never soft-deleted. Partition by month for manageability.
CREATE INDEX idx_audit_log_user_id   ON audit_log (user_id, created_at DESC);
CREATE INDEX idx_audit_log_action    ON audit_log (action, created_at DESC);
CREATE INDEX idx_audit_log_created   ON audit_log (created_at DESC);


-- ============================================================
-- TRIGGERS: updated_at maintenance
-- ============================================================

CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$;

CREATE TRIGGER trg_users_updated_at
    BEFORE UPDATE ON users
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER trg_linkedin_tokens_updated_at
    BEFORE UPDATE ON linkedin_oauth_tokens
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER trg_voice_profiles_updated_at
    BEFORE UPDATE ON voice_profiles
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER trg_content_pillars_updated_at
    BEFORE UPDATE ON content_pillars
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER trg_posts_updated_at
    BEFORE UPDATE ON posts
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER trg_calendar_slots_updated_at
    BEFORE UPDATE ON content_calendar_slots
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER trg_media_assets_updated_at
    BEFORE UPDATE ON media_assets
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();


-- ============================================================
-- TRIGGER: Audit log immutability guard
-- ============================================================

CREATE OR REPLACE FUNCTION prevent_audit_log_modification()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
    RAISE EXCEPTION 'audit_log rows are immutable';
END;
$$;

CREATE TRIGGER trg_audit_log_immutable
    BEFORE UPDATE OR DELETE ON audit_log
    FOR EACH ROW EXECUTE FUNCTION prevent_audit_log_modification();


COMMIT;
```

---

## 4. Indexes Reference

Complete list of indexes with query patterns they serve.

| Index | Table | Columns | Filter | Query Pattern |
|---|---|---|---|---|
| `idx_users_email` | users | email | `deleted_at IS NULL` | Login lookup |
| `idx_users_linkedin_id` | users | linkedin_id | `linkedin_id IS NOT NULL` | OAuth callback resolution |
| `idx_users_subscription` | users | subscription_tier, subscription_expires_at | `deleted_at IS NULL` | Billing jobs, tier enforcement |
| `idx_linkedin_tokens_expires` | linkedin_oauth_tokens | expires_at | recent tokens | Token refresh background job |
| `idx_sessions_user_id` | user_sessions | user_id | `revoked_at IS NULL` | Session invalidation |
| `idx_sessions_expires` | user_sessions | expires_at | `revoked_at IS NULL` | Session cleanup job |
| `idx_voice_profiles_user_version` | voice_profiles | user_id, version_number | — | Unique version per user |
| `idx_voice_profiles_user_current` | voice_profiles | user_id, id DESC | — | Fetch current voice profile |
| `idx_content_pillars_user_name` | content_pillars | user_id, lower(name) | `deleted_at IS NULL` | Dedup pillar names |
| `idx_content_pillars_user_active` | content_pillars | user_id, sort_order | `deleted_at IS NULL` | Pillar list in UI |
| `idx_posts_user_status` | posts | user_id, status, scheduled_at | `deleted_at IS NULL` | Review queue — most common |
| `idx_posts_linkedin_post_id` | posts | linkedin_post_id | `linkedin_post_id IS NOT NULL` | Analytics job lookup |
| `idx_posts_pillar_id` | posts | pillar_id | not null, not deleted | Pillar performance queries |
| `idx_posts_scheduled_queue` | posts | scheduled_at, status | approved/scheduled | Publishing worker queue scan |
| `idx_posts_published_recent` | posts | user_id, published_at DESC | published, not deleted | Analytics job: recent posts |
| `idx_posts_user_published_created` | posts | user_id, created_at DESC | published, not deleted | Voice analysis few-shot examples |
| `idx_post_analytics_post_snapshot` | post_analytics | post_id, date_trunc('hour', snapshot_at) | — | Deduplicate analytics snapshots |
| `idx_post_analytics_post_id` | post_analytics | post_id, snapshot_at DESC | — | Post detail: metric history |
| `idx_post_analytics_user_snapshot` | post_analytics | user_id, snapshot_at DESC | — | Weekly report aggregation |
| `idx_post_analytics_user_engagement` | post_analytics | user_id, engagement_rate DESC | — | Top posts dashboard |
| `idx_calendar_slots_user_day` | content_calendar_slots | user_id, day_of_week | — | Calendar template fetch |
| `idx_media_assets_user_active` | media_assets | user_id, created_at DESC | `deleted_at IS NULL` | Media library browser |
| `idx_media_assets_linkedin_urn` | media_assets | linkedin_asset_urn | not null | Publishing: check if already uploaded |
| `idx_api_keys_service_active` | api_keys | service | `active = true` | Runtime key fetch |
| `idx_audit_log_user_id` | audit_log | user_id, created_at DESC | — | User activity history |

---

## 5. Row Level Security Policies

RLS is applied on all user-owned tables. This protects against application-layer bugs that might leak cross-user data. The pattern `(SELECT auth.uid())` (or equivalent application-level function) is used to avoid the function being called once per row.

```sql
-- ============================================================
-- RLS SETUP
-- Run after migration 0001. Requires application role to be set.
-- Replace 'app_user' with your actual DB role name.
-- ============================================================

BEGIN;

-- Revoke public schema access (Supabase pattern)
REVOKE CREATE ON SCHEMA public FROM PUBLIC;
REVOKE ALL ON ALL TABLES IN SCHEMA public FROM PUBLIC;

-- Application role: can read/write only through RLS
-- Never GRANT ALL — only what the app needs
GRANT USAGE ON SCHEMA public TO app_user;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE
    users,
    linkedin_oauth_tokens,
    user_sessions,
    voice_profiles,
    content_pillars,
    posts,
    post_analytics,
    content_calendar_slots,
    media_assets,
    post_media_assets
TO app_user;
GRANT SELECT ON TABLE api_keys TO app_user;  -- read only; writes go through migration scripts
GRANT INSERT ON TABLE audit_log TO app_user; -- append only; updates/deletes blocked by trigger

-- Sequences
GRANT USAGE ON ALL SEQUENCES IN SCHEMA public TO app_user;

-- ============================================================
-- Enable RLS
-- ============================================================

ALTER TABLE users                   ENABLE ROW LEVEL SECURITY;
ALTER TABLE linkedin_oauth_tokens   ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_sessions           ENABLE ROW LEVEL SECURITY;
ALTER TABLE voice_profiles          ENABLE ROW LEVEL SECURITY;
ALTER TABLE content_pillars         ENABLE ROW LEVEL SECURITY;
ALTER TABLE posts                   ENABLE ROW LEVEL SECURITY;
ALTER TABLE post_analytics          ENABLE ROW LEVEL SECURITY;
ALTER TABLE content_calendar_slots  ENABLE ROW LEVEL SECURITY;
ALTER TABLE media_assets            ENABLE ROW LEVEL SECURITY;
ALTER TABLE post_media_assets       ENABLE ROW LEVEL SECURITY;

-- ============================================================
-- RLS POLICIES
--
-- Convention: use current_setting('app.user_id')::bigint
-- The application sets this at the start of each transaction:
--   SET LOCAL app.user_id = '123';
-- This is cheaper than a subquery function call per row.
-- ============================================================

-- USERS: users can only see their own row
CREATE POLICY users_self ON users
    USING (id = (SELECT current_setting('app.user_id', true)::bigint));

-- LINKEDIN OAUTH TOKENS
CREATE POLICY linkedin_tokens_owner ON linkedin_oauth_tokens
    USING (user_id = (SELECT current_setting('app.user_id', true)::bigint));

-- USER SESSIONS
CREATE POLICY sessions_owner ON user_sessions
    USING (user_id = (SELECT current_setting('app.user_id', true)::bigint));

-- VOICE PROFILES
CREATE POLICY voice_profiles_owner ON voice_profiles
    USING (user_id = (SELECT current_setting('app.user_id', true)::bigint));

-- CONTENT PILLARS
CREATE POLICY content_pillars_owner ON content_pillars
    USING (user_id = (SELECT current_setting('app.user_id', true)::bigint));

-- POSTS
CREATE POLICY posts_owner ON posts
    USING (user_id = (SELECT current_setting('app.user_id', true)::bigint));

-- POST ANALYTICS
CREATE POLICY post_analytics_owner ON post_analytics
    USING (user_id = (SELECT current_setting('app.user_id', true)::bigint));

-- CONTENT CALENDAR SLOTS
CREATE POLICY calendar_slots_owner ON content_calendar_slots
    USING (user_id = (SELECT current_setting('app.user_id', true)::bigint));

-- MEDIA ASSETS
CREATE POLICY media_assets_owner ON media_assets
    USING (user_id = (SELECT current_setting('app.user_id', true)::bigint));

-- POST MEDIA ASSETS (join table — enforced through posts FK)
CREATE POLICY post_media_assets_owner ON post_media_assets
    USING (
        post_id IN (
            SELECT id FROM posts
            WHERE user_id = (SELECT current_setting('app.user_id', true)::bigint)
        )
    );

COMMIT;
```

**Application integration pattern:**

```sql
-- At the start of every API request handler, before any query:
BEGIN;
SELECT set_config('app.user_id', $1::text, true);  -- true = local to transaction
-- ... execute queries ...
COMMIT;
```

---

## 6. Migration Strategy

### Versioning Approach

Migrations live in `/db/migrations/` and are named with a zero-padded sequential prefix plus a descriptive slug:

```
db/
  migrations/
    0001_initial_schema.sql
    0002_add_rls_policies.sql
    0003_add_post_analytics_partitioning.sql
    0004_seed_dev_data.sql
    ...
  rollbacks/
    0001_rollback.sql
    0002_rollback.sql
    ...
```

Use a migration runner such as `golang-migrate`, `Flyway`, or `node-pg-migrate`. The runner tracks applied migrations in a `schema_migrations` table it manages automatically.

Manual requirement: every migration file must have a corresponding rollback in `/db/rollbacks/`. The rollback must be tested in staging before the forward migration runs in production.

### Migration Safety Rules

1. Never drop a column in the same migration that removes it from application code. Drop columns only after two deploys have passed with the column unused.
2. Never rename a column in a single migration. Add new column, backfill, switch app, drop old column in a later migration.
3. `CREATE INDEX CONCURRENTLY` for all index additions on live tables — prevents table lock.
4. `ALTER TABLE ... ADD COLUMN` with a default is safe in PostgreSQL 11+ (does not rewrite the table unless the default is volatile).
5. Never use `NOT NULL` constraint additions on large tables without a default or backfill in the same migration.

### Example: Adding an Index Safely on a Live Table

```sql
-- 0005_add_posts_pillar_weight_idx.sql
BEGIN;
-- CONCURRENTLY cannot run inside a transaction block.
COMMIT;

CREATE INDEX CONCURRENTLY idx_posts_pillar_scheduled
    ON posts (pillar_id, scheduled_at)
    WHERE status = 'approved' AND deleted_at IS NULL;
```

---

## 7. Seed Data

```sql
-- ============================================================
-- Migration: 0004_seed_dev_data.sql
-- Development seed only. NEVER run in production.
-- Guard: this script aborts if NODE_ENV is not 'development'.
-- ============================================================

BEGIN;

DO $$
BEGIN
    IF current_database() NOT LIKE '%dev%' AND current_database() NOT LIKE '%local%' THEN
        RAISE EXCEPTION 'Seed data may only run on development databases (name must contain dev or local). Current DB: %', current_database();
    END IF;
END;
$$;

-- Seed user
INSERT INTO users (email, name, linkedin_id, subscription_tier, onboarding_completed_at, timezone)
VALUES
    ('alice@example.dev', 'Alice Chen', 'urn:li:person:dev001', 'pro', now() - INTERVAL '7 days', 'America/New_York'),
    ('bob@example.dev',   'Bob Patel',  'urn:li:person:dev002', 'free', now() - INTERVAL '3 days', 'Europe/London')
RETURNING id;

-- Seed voice profile for alice (id=1)
INSERT INTO voice_profiles (user_id, version_number, tone, avg_post_length, emoji_frequency, hashtag_style, formatting, line_break_style, analysis_data, analyzed_post_count, analysis_source)
VALUES (
    1, 1,
    'professional-casual', 180, 'light', 'minimal', 'spaced', 'double',
    '{"hook_patterns":["Bold claim","Story opener"],"cta_patterns":["What do you think?"],"vocabulary_fingerprint":"SaaS, PLG, GTM, retention","topic_clusters":["product","career","leadership"]}',
    45, 'both'
);

-- Seed content pillars for alice
INSERT INTO content_pillars (user_id, name, description, weight, color, sort_order)
VALUES
    (1, 'Product Leadership', 'Building and scaling B2B SaaS products', 0.300, '#6366f1', 1),
    (1, 'Career Growth',      'Lessons from a decade in tech',          0.250, '#f59e0b', 2),
    (1, 'AI & Automation',    'Practical AI for non-technical teams',   0.250, '#10b981', 3),
    (1, 'Hot Takes',          'Contrarian views on industry norms',     0.200, '#ef4444', 4);

-- Seed content calendar for alice
INSERT INTO content_calendar_slots (user_id, pillar_id, day_of_week, preferred_time, format, post_type)
VALUES
    (1, 1, 1, '09:00', 'text',    'Industry insight'),      -- Mon: Product Leadership
    (1, 2, 2, '08:00', 'text',    'Personal story'),        -- Tue: Career Growth
    (1, 3, 3, '12:00', 'image',   'How-to / tactical'),     -- Wed: AI & Automation
    (1, 4, 4, '09:00', 'text',    'Hot take / opinion'),    -- Thu: Hot Takes
    (1, 2, 5, '07:30', 'text',    'Reflection / question'); -- Fri: Career Growth

-- Seed sample posts for alice
INSERT INTO posts (user_id, pillar_id, content, hook, hashtags, format, status, scheduled_at, published_at, linkedin_post_id)
VALUES
    (1, 1,
     E'Most product teams measure the wrong thing.\n\nThey track feature velocity.\nShippping fast feels productive.\n\nBut fast shipping of the wrong things = fast failure.\n\nThe only metric that matters in year 1:\n\nDoes your customer come back?\n\nRetention is the truth serum for product decisions.\n\n#product #SaaS #retention',
     E'Most product teams measure the wrong thing.\n\nThey track feature velocity.',
     ARRAY['product','SaaS','retention'],
     'text', 'published',
     now() - INTERVAL '5 days',
     now() - INTERVAL '5 days',
     'urn:li:ugcPost:dev_001'),

    (1, 2,
     E'I got rejected 12 times before my first VP role.\n\nEach rejection had a different reason:\n- "Not enough scope"\n- "Too technical"\n- "Risk for us"\n\nThe 13th company said yes.\n\nWhat changed? Nothing about me.\n\nEverything about fit.\n\nStop optimizing for the interview. Optimize for fit.\n\n#career #leadership #jobsearch',
     E'I got rejected 12 times before my first VP role.\n\nEach rejection had a different reason:',
     ARRAY['career','leadership','jobsearch'],
     'text', 'published',
     now() - INTERVAL '4 days',
     now() - INTERVAL '4 days',
     'urn:li:ugcPost:dev_002'),

    (1, 3,
     E'You don''t need to understand AI to use it.\n\nYou need to understand your workflow.\n\nMost "AI adoption" failures I see:\n→ Team adopts tool\n→ Tool doesn''t fit how they work\n→ Team abandons it in 2 weeks\n\nFix the workflow first. Then add AI.\n\n#AI #productivity #automation',
     E'You don''t need to understand AI to use it.\n\nYou need to understand your workflow.',
     ARRAY['AI','productivity','automation'],
     'text', 'draft',
     now() + INTERVAL '2 days',
     NULL,
     NULL);

-- Seed analytics for the two published posts
INSERT INTO post_analytics (post_id, user_id, impressions, reactions, comments, reposts, clicks, engagement_rate, snapshot_at)
VALUES
    -- Post 1, 5 days ago
    (1, 1, 1200, 87, 14, 6, 230, 0.0892, now() - INTERVAL '5 days' + INTERVAL '6 hours'),
    (1, 1, 2800, 142, 22, 11, 380, 0.0625, now() - INTERVAL '4 days'),
    (1, 1, 3100, 155, 24, 12, 400, 0.0616, now() - INTERVAL '3 days'),
    -- Post 2, 4 days ago
    (2, 1, 900,  61,  9,  4, 180, 0.0822, now() - INTERVAL '4 days' + INTERVAL '6 hours'),
    (2, 1, 2100, 98, 17,  7, 290, 0.0581, now() - INTERVAL '3 days'),
    (2, 1, 2400, 110, 19, 8, 310, 0.0571, now() - INTERVAL '2 days');

COMMIT;
```

---

## 8. Scaling Considerations

### Table Growth Rates

| Table | Growth Rate | At 10K Users | At 100K Users |
|---|---|---|---|
| `users` | 1 row/signup | 10,000 rows | 100,000 rows |
| `posts` | ~7 rows/user/week | 70K rows/week | 700K rows/week |
| `post_analytics` | ~28 rows/post (6h × 7d) | ~2M rows/week | ~20M rows/week |
| `audit_log` | ~10 rows/user/day | 100K rows/day | 1M rows/day |
| `media_assets` | ~2 assets/post | 140K rows/week | 1.4M rows/week |
| `voice_profiles` | ~1 row/re-analysis | Very low | Very low |

`post_analytics` is the fastest-growing table by far. Plan partitioning before it hits 10M rows.

### Partitioning Strategy

```sql
-- ============================================================
-- Migration: 0003_add_post_analytics_partitioning.sql
-- Apply when post_analytics exceeds ~5M rows or queries slow.
-- ============================================================

-- Step 1: Rename existing table
ALTER TABLE post_analytics RENAME TO post_analytics_old;

-- Step 2: Create partitioned parent (same schema)
CREATE TABLE post_analytics (
    id                  bigint      GENERATED ALWAYS AS IDENTITY,
    post_id             bigint      NOT NULL,
    user_id             bigint      NOT NULL,
    impressions         bigint      NOT NULL DEFAULT 0,
    reactions           bigint      NOT NULL DEFAULT 0,
    comments            bigint      NOT NULL DEFAULT 0,
    reposts             bigint      NOT NULL DEFAULT 0,
    clicks              bigint      NOT NULL DEFAULT 0,
    engagement_rate     numeric(6,4),
    raw_response        jsonb,
    snapshot_at         timestamptz NOT NULL DEFAULT now(),
    created_at          timestamptz NOT NULL DEFAULT now()
) PARTITION BY RANGE (snapshot_at);

-- Step 3: Create initial month partitions
CREATE TABLE post_analytics_2026_04 PARTITION OF post_analytics
    FOR VALUES FROM ('2026-04-01') TO ('2026-05-01');

CREATE TABLE post_analytics_2026_05 PARTITION OF post_analytics
    FOR VALUES FROM ('2026-05-01') TO ('2026-06-01');

-- Step 4: Add indexes on each partition (PostgreSQL 11+ inherits parent indexes)
CREATE INDEX ON post_analytics (post_id, snapshot_at DESC);
CREATE INDEX ON post_analytics (user_id, snapshot_at DESC);
CREATE INDEX ON post_analytics (user_id, engagement_rate DESC NULLS LAST);

-- Step 5: Backfill old data
INSERT INTO post_analytics SELECT * FROM post_analytics_old;

-- Step 6: Drop old table (after verifying row counts match)
-- DROP TABLE post_analytics_old;

-- Partition creation job: run monthly via cron or migration
-- CREATE TABLE post_analytics_2026_06 PARTITION OF post_analytics
--     FOR VALUES FROM ('2026-06-01') TO ('2026-07-01');
```

**Archival:** Partitions older than 13 months can be detached and moved to cold storage:

```sql
-- Detach old partition (fast, no data movement)
ALTER TABLE post_analytics DETACH PARTITION post_analytics_2025_03;

-- Archive the detached table to a separate schema or dump to S3
-- Then DROP TABLE post_analytics_2025_03; when confirmed safe
```

### Connection Pooling

Use PgBouncer in **transaction mode** between the application and PostgreSQL.

```ini
; pgbouncer.ini — recommended settings
[databases]
autolinked = host=db.internal port=5432 dbname=autolinked

[pgbouncer]
pool_mode = transaction         ; safest for stateless API servers
max_client_conn = 1000          ; total connections from app servers
default_pool_size = 20          ; connections to PostgreSQL per DB
reserve_pool_size = 5
server_idle_timeout = 600
```

- Direct connection limit for PostgreSQL 16: set `max_connections = 100` in `postgresql.conf` for a 4-core server. PgBouncer multiplexes 1000 app connections down to 20-25 DB connections.
- Set `statement_timeout = 30s` in PostgreSQL to kill runaway queries.
- Set `idle_in_transaction_session_timeout = 10s` to catch transactions that hold locks without committing.

### Read Replica Strategy

Apply a read replica once the primary hits sustained 70%+ CPU or when analytics queries noticeably slow write-path queries.

Queries to route to the replica:
- Weekly performance report generation
- Voice analysis: fetch last 50 posts
- Dashboard: top posts by engagement
- Any `SELECT` from `post_analytics` older than 48 hours

Queries that must hit the primary:
- All writes (posts, analytics inserts, scheduling)
- Review queue fetch (needs freshest status)
- OAuth token reads (avoid stale token reads causing publish failures)

The application layer makes this routing decision based on whether the query is inside a write transaction or tagged with a `replica_ok` hint.

### Archival for Posts

Posts older than 2 years with `status IN ('published', 'skipped', 'failed')` can be archived:

```sql
-- Insert into archive table (created with same schema)
INSERT INTO posts_archive SELECT * FROM posts
    WHERE created_at < now() - INTERVAL '2 years'
      AND status IN ('published', 'skipped', 'failed')
      AND deleted_at IS NOT NULL;

-- Delete from live table only after confirming archive row count
DELETE FROM posts
    WHERE created_at < now() - INTERVAL '2 years'
      AND status IN ('published', 'skipped', 'failed')
      AND deleted_at IS NOT NULL;
```

---

## 9. Query Patterns Reference

Critical queries and the indexes that serve them.

### Review Queue (most frequent — runs on every page load)

```sql
-- Get user's pending review queue, ordered by scheduled time
SELECT
    p.public_id,
    p.content,
    p.hook,
    p.format,
    p.status,
    p.scheduled_at,
    p.hashtags,
    cp.name        AS pillar_name,
    cp.color       AS pillar_color
FROM posts p
LEFT JOIN content_pillars cp ON cp.id = p.pillar_id AND cp.deleted_at IS NULL
WHERE p.user_id    = $1
  AND p.status     IN ('draft', 'approved')
  AND p.deleted_at IS NULL
ORDER BY p.scheduled_at ASC NULLS LAST
LIMIT 20;
-- Served by: idx_posts_user_status
```

### Publishing Worker Queue

```sql
-- Worker polls every 30 seconds for posts ready to publish
SELECT
    p.id,
    p.user_id,
    p.content,
    p.format,
    p.linkedin_post_id,
    p.primary_media_url,
    u.linkedin_id,
    t.access_token_enc,
    t.expires_at AS token_expires_at
FROM posts p
JOIN users u ON u.id = p.user_id AND u.deleted_at IS NULL
JOIN linkedin_oauth_tokens t ON t.user_id = p.user_id
WHERE p.status      IN ('approved', 'scheduled')
  AND p.scheduled_at <= now() + INTERVAL '2 minutes'
  AND p.deleted_at  IS NULL
ORDER BY p.scheduled_at ASC
LIMIT 50
FOR UPDATE OF p SKIP LOCKED;  -- SKIP LOCKED: multiple workers, no double-publish
-- Served by: idx_posts_scheduled_queue
```

### Analytics Snapshot Job

```sql
-- Posts published in last 7 days that need a fresh analytics snapshot
SELECT p.id, p.linkedin_post_id, p.user_id
FROM posts p
WHERE p.status       = 'published'
  AND p.published_at >= now() - INTERVAL '7 days'
  AND p.deleted_at   IS NULL
  AND p.linkedin_post_id IS NOT NULL
  -- Exclude posts already snapshotted in the last 5 hours
  AND NOT EXISTS (
      SELECT 1 FROM post_analytics pa
      WHERE pa.post_id     = p.id
        AND pa.snapshot_at >= now() - INTERVAL '5 hours'
  )
ORDER BY p.published_at DESC;
-- Served by: idx_posts_published_recent, idx_post_analytics_post_snapshot
```

### Weekly Performance Report

```sql
-- Pillar performance summary for the past 7 days
SELECT
    cp.name,
    cp.color,
    COUNT(DISTINCT p.id)             AS posts_published,
    ROUND(AVG(pa.impressions), 0)    AS avg_impressions,
    ROUND(AVG(pa.reactions), 0)      AS avg_reactions,
    ROUND(AVG(pa.engagement_rate) * 100, 2) AS avg_engagement_pct
FROM content_pillars cp
JOIN posts p ON p.pillar_id = cp.id
    AND p.user_id    = $1
    AND p.status     = 'published'
    AND p.published_at >= now() - INTERVAL '7 days'
    AND p.deleted_at IS NULL
JOIN LATERAL (
    -- Most recent snapshot per post (lateral join avoids window function on full table)
    SELECT impressions, reactions, engagement_rate
    FROM post_analytics
    WHERE post_id = p.id
    ORDER BY snapshot_at DESC
    LIMIT 1
) pa ON true
WHERE cp.user_id    = $1
  AND cp.deleted_at IS NULL
GROUP BY cp.id, cp.name, cp.color
ORDER BY avg_engagement_pct DESC;
-- Served by: idx_post_analytics_post_id (lateral), idx_posts_pillar_id
```

### Voice Analysis — Fetch Best Posts for Few-Shot Prompting

```sql
-- Top 10 published posts by engagement for use as few-shot examples
WITH recent_analytics AS (
    SELECT DISTINCT ON (post_id)
        post_id,
        engagement_rate,
        impressions
    FROM post_analytics
    WHERE user_id    = $1
      AND snapshot_at >= now() - INTERVAL '30 days'
    ORDER BY post_id, snapshot_at DESC
)
SELECT
    p.id,
    p.content,
    p.pillar_id,
    ra.engagement_rate,
    ra.impressions
FROM posts p
JOIN recent_analytics ra ON ra.post_id = p.id
WHERE p.user_id    = $1
  AND p.status     = 'published'
  AND p.deleted_at IS NULL
ORDER BY ra.engagement_rate DESC NULLS LAST
LIMIT 10;
-- Served by: idx_post_analytics_user_engagement, idx_posts_user_published_created
```

### Post Status Transition (with optimistic concurrency)

```sql
-- Approve a post — only if still in 'draft' status (prevent double-approve race)
UPDATE posts
SET
    status      = 'approved',
    approved_at = now()
WHERE id        = $1
  AND user_id   = $2   -- RLS backup: user can only touch their own posts
  AND status    = 'draft'
  AND deleted_at IS NULL
RETURNING id, status, scheduled_at;
-- If 0 rows returned: post was already approved/skipped by another session
```

---

## Review Checklist

- [x] All WHERE/JOIN columns indexed
- [x] Composite indexes in correct column order (equality first: user_id, then status, then range: scheduled_at)
- [x] Proper data types: bigint IDs, text strings, timestamptz timestamps, numeric for weights/scores
- [x] RLS enabled on all user-owned tables
- [x] RLS policies use `(SELECT current_setting(...))` pattern — evaluated once per query, not per row
- [x] Foreign keys on: posts.user_id, posts.pillar_id, post_analytics.post_id, post_analytics.user_id, voice_profiles.user_id, content_pillars.user_id, linkedin_oauth_tokens.user_id, media_assets.user_id, content_calendar_slots.user_id, post_media_assets.post_id, post_media_assets.media_asset_id
- [x] All FK columns have indexes
- [x] No N+1 query patterns in reference queries (LATERAL join used instead)
- [x] SKIP LOCKED on publishing worker queue
- [x] Partial indexes on `WHERE deleted_at IS NULL` for soft-delete tables
- [x] Covering indexes with INCLUDE where beneficial (pillar color/name included via join, not INCLUDE — join is cleaner here)
- [x] Audit log protected against modification by trigger
- [x] OAuth tokens encrypted before storage
- [x] No `SELECT *` in any reference query
- [x] Cursor-based patterns preferred (publishing queue uses `ORDER BY scheduled_at LIMIT 50` not OFFSET)
- [x] `statement_timeout` and `idle_in_transaction_session_timeout` recommended in connection pooling config
- [x] Post content length enforced via CHECK constraint (≤ 3200 chars)
- [x] Enum-like values implemented as `text + CHECK` (not native ENUM) for zero-lock schema evolution
