-- Initial migration: creates all tables for Auto-Linked
-- Generated from Drizzle schema definitions

CREATE TABLE IF NOT EXISTS "users" (
  "id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
  "public_id" uuid NOT NULL DEFAULT gen_random_uuid() UNIQUE,
  "email" text NOT NULL UNIQUE,
  "name" text NOT NULL,
  "avatar_url" text,
  "linkedin_id" text UNIQUE,
  "linkedin_vanity_url" text,
  "subscription_tier" text NOT NULL DEFAULT 'free',
  "subscription_expires_at" timestamp with time zone,
  "stripe_customer_id" text,
  "posting_schedule" jsonb,
  "timezone" text NOT NULL DEFAULT 'UTC',
  "onboarding_completed_at" timestamp with time zone,
  "onboarding_step" text DEFAULT 'start',
  "auto_publish" boolean NOT NULL DEFAULT false,
  "auto_publish_window_hours" integer NOT NULL DEFAULT 24,
  "email_notifications" boolean NOT NULL DEFAULT true,
  "deleted_at" timestamp with time zone,
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  "updated_at" timestamp with time zone NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS "idx_users_email" ON "users" ("email") WHERE "deleted_at" IS NULL;
CREATE INDEX IF NOT EXISTS "idx_users_linkedin_id" ON "users" ("linkedin_id") WHERE "linkedin_id" IS NOT NULL;
CREATE INDEX IF NOT EXISTS "idx_users_subscription" ON "users" ("subscription_tier", "subscription_expires_at") WHERE "deleted_at" IS NULL;

CREATE TABLE IF NOT EXISTS "linkedin_oauth_tokens" (
  "id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
  "user_id" bigint NOT NULL REFERENCES "users"("id") ON DELETE CASCADE UNIQUE,
  "access_token_enc" text NOT NULL,
  "refresh_token_enc" text,
  "scopes" text[] NOT NULL DEFAULT '{}'::text[],
  "expires_at" timestamp with time zone NOT NULL,
  "refresh_expires_at" timestamp with time zone,
  "issued_at" timestamp with time zone NOT NULL DEFAULT now(),
  "last_refreshed_at" timestamp with time zone,
  "refresh_failure_count" integer NOT NULL DEFAULT 0,
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  "updated_at" timestamp with time zone NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS "idx_linkedin_tokens_expires" ON "linkedin_oauth_tokens" ("expires_at") WHERE "expires_at" IS NOT NULL;

CREATE TABLE IF NOT EXISTS "voice_profiles" (
  "id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
  "user_id" bigint NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "version_number" integer NOT NULL DEFAULT 1,
  "tone" text NOT NULL DEFAULT 'professional-casual',
  "avg_post_length" integer NOT NULL DEFAULT 200,
  "emoji_frequency" text NOT NULL DEFAULT 'light',
  "hashtag_style" text NOT NULL DEFAULT 'minimal',
  "formatting" text NOT NULL DEFAULT 'spaced',
  "line_break_style" text NOT NULL DEFAULT 'double',
  "analysis_data" jsonb NOT NULL DEFAULT '{}',
  "analyzed_post_count" integer NOT NULL DEFAULT 0,
  "analysis_source" text NOT NULL DEFAULT 'questionnaire',
  "user_edited" boolean NOT NULL DEFAULT false,
  "user_notes" text,
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  "updated_at" timestamp with time zone NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS "idx_voice_profiles_user_version" ON "voice_profiles" ("user_id", "version_number");
CREATE INDEX IF NOT EXISTS "idx_voice_profiles_user_current" ON "voice_profiles" ("user_id", "id");

CREATE TABLE IF NOT EXISTS "content_pillars" (
  "id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
  "public_id" uuid NOT NULL DEFAULT gen_random_uuid() UNIQUE,
  "user_id" bigint NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "name" text NOT NULL,
  "description" text,
  "weight" numeric(4, 3) NOT NULL DEFAULT '0.200',
  "performance_score" numeric(5, 3),
  "color" text,
  "sort_order" integer NOT NULL DEFAULT 0,
  "deleted_at" timestamp with time zone,
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  "updated_at" timestamp with time zone NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS "idx_content_pillars_user_name" ON "content_pillars" ("user_id", "name") WHERE "deleted_at" IS NULL;
CREATE INDEX IF NOT EXISTS "idx_content_pillars_user_active" ON "content_pillars" ("user_id", "sort_order") WHERE "deleted_at" IS NULL;

CREATE TABLE IF NOT EXISTS "posts" (
  "id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
  "public_id" uuid NOT NULL DEFAULT gen_random_uuid() UNIQUE,
  "user_id" bigint NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "pillar_id" bigint REFERENCES "content_pillars"("id") ON DELETE SET NULL,
  "content" text NOT NULL,
  "hook" text,
  "hashtags" text[] NOT NULL DEFAULT '{}'::text[],
  "format" text NOT NULL DEFAULT 'text',
  "ai_model" text,
  "generation_prompt" text,
  "generation_context" jsonb,
  "regeneration_count" integer NOT NULL DEFAULT 0,
  "status" text NOT NULL DEFAULT 'draft',
  "scheduled_at" timestamp with time zone,
  "approved_at" timestamp with time zone,
  "published_at" timestamp with time zone,
  "linkedin_post_id" text,
  "linkedin_post_url" text,
  "publish_attempt_count" integer NOT NULL DEFAULT 0,
  "last_publish_error" text,
  "last_publish_attempt_at" timestamp with time zone,
  "primary_media_url" text,
  "deleted_at" timestamp with time zone,
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  "updated_at" timestamp with time zone NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS "idx_posts_linkedin_post_id" ON "posts" ("linkedin_post_id") WHERE "linkedin_post_id" IS NOT NULL;
CREATE INDEX IF NOT EXISTS "idx_posts_user_status" ON "posts" ("user_id", "status", "scheduled_at") WHERE "deleted_at" IS NULL;
CREATE INDEX IF NOT EXISTS "idx_posts_pillar_id" ON "posts" ("pillar_id") WHERE "pillar_id" IS NOT NULL AND "deleted_at" IS NULL;
CREATE INDEX IF NOT EXISTS "idx_posts_scheduled_queue" ON "posts" ("scheduled_at", "status") WHERE "status" IN ('approved', 'scheduled') AND "deleted_at" IS NULL;
CREATE INDEX IF NOT EXISTS "idx_posts_published_recent" ON "posts" ("user_id", "published_at") WHERE "status" = 'published' AND "deleted_at" IS NULL;

CREATE TABLE IF NOT EXISTS "post_analytics" (
  "id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
  "post_id" bigint NOT NULL REFERENCES "posts"("id") ON DELETE CASCADE,
  "user_id" bigint NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "impressions" bigint NOT NULL DEFAULT 0,
  "reactions" bigint NOT NULL DEFAULT 0,
  "comments" bigint NOT NULL DEFAULT 0,
  "reposts" bigint NOT NULL DEFAULT 0,
  "clicks" bigint NOT NULL DEFAULT 0,
  "engagement_rate" numeric(6, 4),
  "raw_response" jsonb,
  "snapshot_at" timestamp with time zone NOT NULL DEFAULT now(),
  "created_at" timestamp with time zone NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS "idx_post_analytics_post_snapshot" ON "post_analytics" ("post_id", "snapshot_at");
CREATE INDEX IF NOT EXISTS "idx_post_analytics_post_id" ON "post_analytics" ("post_id", "snapshot_at");
CREATE INDEX IF NOT EXISTS "idx_post_analytics_user_snapshot" ON "post_analytics" ("user_id", "snapshot_at");
CREATE INDEX IF NOT EXISTS "idx_post_analytics_user_engagement" ON "post_analytics" ("user_id", "engagement_rate", "snapshot_at");
