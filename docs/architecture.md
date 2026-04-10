# Auto-Linked: System Architecture

**Version:** 1.0
**Date:** 2026-04-09
**Status:** Draft

---

## Table of Contents

1. [High-Level Architecture](#1-high-level-architecture)
2. [Module Map](#2-module-map)
3. [Tech Stack](#3-tech-stack)
4. [Monorepo Structure](#4-monorepo-structure)
5. [API Design](#5-api-design)
6. [Job Queues](#6-job-queues)
7. [Data Flows](#7-data-flows)
8. [Scaling Plan](#8-scaling-plan)
9. [Architecture Decision Records](#9-architecture-decision-records)

---

## 1. High-Level Architecture

Auto-Linked is a **modular monolith** built on Node.js. The frontend is a Next.js 15 application deployed on Vercel. The backend is an Express + tRPC server deployed on Railway. Background work is handled by BullMQ workers running as a separate Railway service sharing the same codebase.

```
                            ┌─────────────────────────┐
                            │    Vercel (Frontend)     │
                            │    Next.js 15 App        │
                            │    App Router + RSC      │
                            └────────────┬────────────┘
                                         │ tRPC (HTTPS)
                                         ▼
                            ┌─────────────────────────┐
                            │   Railway (Backend)      │
                            │   Express + tRPC Server  │
                            │   Modular Monolith       │
                            └──┬──────┬──────┬────────┘
                               │      │      │
                  ┌────────────┘      │      └────────────┐
                  ▼                   ▼                    ▼
        ┌──────────────┐   ┌──────────────┐    ┌──────────────┐
        │  PostgreSQL   │   │    Redis     │    │ Cloudflare   │
        │  (Neon)       │   │  (Upstash)   │    │ R2 Storage   │
        └──────────────┘   └──────┬───────┘    └──────────────┘
                                  │
                                  ▼
                          ┌──────────────┐
                          │  BullMQ      │
                          │  Workers     │
                          │  (Railway)   │
                          └──┬───┬───┬──┘
                             │   │   │
               ┌─────────────┘   │   └─────────────┐
               ▼                 ▼                  ▼
      ┌──────────────┐ ┌──────────────┐   ┌──────────────┐
      │ LinkedIn API  │ │  Claude API  │   │  Stripe API  │
      └──────────────┘ └──────────────┘   └──────────────┘
```

**Why modular monolith?** At MVP stage, the overhead of microservices (deployment orchestration, inter-service auth, distributed tracing) is not justified. Modules communicate via typed TypeScript interfaces within a single process. If a module needs to scale independently later (e.g., the AI engine at 100K users), it can be extracted into its own service because module boundaries are already clean.

---

## 2. Module Map

Each module owns its own database tables, exports typed interfaces, and has a clear domain boundary. No module directly queries another module's tables.

| Module | Responsibility | Owns Tables | Key Exports |
|--------|---------------|-------------|-------------|
| **auth** | Clerk webhook handling, session validation, user CRUD | `users`, `user_sessions` | `getCurrentUser()`, `requireAuth()`, `clerkWebhookHandler` |
| **voice** | Voice analysis engine, profile management, drift detection | `voice_profiles` | `analyzeVoice()`, `getVoiceProfile()`, `detectDrift()` |
| **content** | Pillar management, calendar, post generation, trending topics | `content_pillars`, `content_calendar_slots`, `trending_topics` | `generatePost()`, `getCalendar()`, `selectNextTopic()` |
| **review** | Review queue, approve/edit/regenerate/skip workflows | None (uses `posts` status field) | `getReviewQueue()`, `approvePost()`, `regeneratePost()` |
| **publishing** | LinkedIn API integration, scheduling, retry logic, media upload | `linkedin_oauth_tokens` | `publishPost()`, `uploadMedia()`, `refreshTokens()` |
| **analytics** | Metrics fetching, aggregation, reports, strategy adaptation | `post_analytics` | `fetchMetrics()`, `getWeeklyReport()`, `getPillarPerformance()` |
| **billing** | Stripe integration, subscription management, usage tracking | None (Stripe is source of truth; `users.subscription_tier` is synced) | `createCheckout()`, `handleWebhook()`, `checkLimit()` |
| **notification** | Email via Resend, in-app notifications, digest scheduling | `notifications` | `sendReviewReminder()`, `sendWeeklyReport()` |

### Module Communication Rules

1. Modules import other modules' **exported interfaces only** -- never internal implementations.
2. Cross-module data access goes through exported functions, never direct SQL joins across module boundaries.
3. Asynchronous cross-module communication uses BullMQ jobs. Example: when `content` finishes generating a post, it enqueues a `send-notification` job rather than calling `notification` directly.
4. Shared types live in `packages/shared` and are imported by both frontend and backend.

---

## 3. Tech Stack

### Frontend

| Technology | Version | Purpose |
|-----------|---------|---------|
| **Next.js** | 15.x | App Router, RSC, Turbopack dev server |
| **React** | 19.x | UI framework |
| **Tailwind CSS** | 4.x | Utility-first styling |
| **shadcn/ui** | Latest | Radix-based component library |
| **TanStack Query** | v5 | Server state management, optimistic updates |
| **Zustand** | 5.x | Client UI state (sidebar, theme, calendar view) |
| **React Hook Form** | 7.x | Form state management |
| **Zod** | 3.23+ | Schema validation (shared with backend) |
| **Tiptap** | Latest | Rich text editor for post editing |
| **Recharts** | Latest | Analytics charts |
| **date-fns** | Latest | Date manipulation |
| **@dnd-kit** | Latest | Drag-and-drop for calendar/queue reordering |
| **next-themes** | 0.4.x | Dark mode support |
| **Lucide React** | Latest | Icon library |

### Backend

| Technology | Version | Purpose |
|-----------|---------|---------|
| **Express** | 4.21+ | HTTP server |
| **tRPC** | 11.x | Type-safe API layer (replaces REST/GraphQL) |
| **Drizzle ORM** | 0.36+ | Database access (replaces Prisma) |
| **Drizzle Kit** | 0.28+ | Migrations and schema generation |
| **BullMQ** | 5.25+ | Job queue for background work |
| **ioredis** | 5.4+ | Redis client for BullMQ and caching |
| **pg** | 8.13+ | PostgreSQL driver |
| **jose** | 5.9+ | JWT verification (Clerk token validation) |
| **Zod** | 3.23+ | Input validation on tRPC procedures |
| **Vitest** | 2.1+ | Unit and integration testing |

### Infrastructure and Third-Party Services

| Service | Purpose |
|---------|---------|
| **Vercel** | Frontend hosting (Next.js optimized) |
| **Railway** | Backend hosting (server + workers) |
| **Neon** | Serverless PostgreSQL |
| **Upstash** | Serverless Redis for BullMQ |
| **Clerk** | Authentication (email, Google, LinkedIn OAuth) |
| **Stripe** | Billing and subscription management |
| **Cloudflare R2** | Object storage for media (images, carousels) |
| **Resend** | Transactional email (review reminders, weekly reports) |
| **Anthropic Claude API** | Voice analysis and content generation |

### Build Tooling

| Tool | Purpose |
|------|---------|
| **pnpm** | 9.x — Package manager with workspace support |
| **Turborepo** | 2.x — Monorepo build orchestration |
| **tsup** | Shared package bundling |
| **Biome** | Linting and formatting (replaces ESLint + Prettier) |
| **TypeScript** | 5.6+ — Strict mode everywhere |

---

## 4. Monorepo Structure

```
auto-linked/
├── apps/
│   ├── web/                          # Next.js 15 frontend
│   │   ├── src/
│   │   │   ├── app/                  # App Router pages
│   │   │   │   ├── (marketing)/      # Landing, pricing — public
│   │   │   │   ├── (auth)/           # Login, signup — auth layout
│   │   │   │   └── (app)/            # Dashboard, queue, calendar — authenticated
│   │   │   ├── components/           # React components
│   │   │   ├── hooks/                # Custom React hooks
│   │   │   ├── lib/                  # Client utilities, tRPC client
│   │   │   ├── stores/               # Zustand stores
│   │   │   └── styles/               # Global styles, Tailwind config
│   │   ├── public/                   # Static assets
│   │   ├── next.config.ts
│   │   ├── tailwind.config.ts
│   │   └── package.json
│   │
│   └── server/                       # Express + tRPC backend
│       ├── src/
│       │   ├── modules/              # Domain modules
│       │   │   ├── auth/
│       │   │   ├── voice/
│       │   │   ├── content/
│       │   │   ├── review/
│       │   │   ├── publishing/
│       │   │   ├── analytics/
│       │   │   ├── billing/
│       │   │   └── notification/
│       │   ├── db/                   # Drizzle schema + migrations
│       │   │   ├── schema/
│       │   │   ├── migrations/
│       │   │   └── client.ts
│       │   ├── queue/                # BullMQ queue definitions + workers
│       │   │   ├── queues.ts
│       │   │   └── workers/
│       │   ├── trpc/                 # tRPC router setup
│       │   │   ├── router.ts         # Root router (merges all module routers)
│       │   │   ├── context.ts        # Request context (user, db, redis)
│       │   │   └── middleware.ts      # Auth middleware, rate limiting
│       │   ├── lib/                  # Shared server utilities
│       │   └── server.ts             # Express app entry point
│       ├── drizzle.config.ts
│       └── package.json
│
├── packages/
│   └── shared/                       # Shared types, validators, constants
│       ├── src/
│       │   ├── types/                # TypeScript type definitions
│       │   ├── validators/           # Zod schemas (used by both client + server)
│       │   └── constants/            # Shared constants (enums, limits)
│       ├── tsup.config.ts
│       └── package.json
│
├── pnpm-workspace.yaml
├── turbo.json
├── package.json
└── docs/
    ├── PRD.md
    ├── architecture.md               # (this document)
    ├── database-schema.md
    ├── voice-engine-design.md
    ├── content-pipeline-design.md
    ├── frontend-architecture.md
    ├── security-threat-model.md
    ├── testing-strategy.md
    └── linkedin-api-research.md
```

### Package Dependency Graph

```
@auto-linked/web  ──depends on──▶  @auto-linked/shared
@auto-linked/server ──depends on──▶  @auto-linked/shared
```

Both `apps/web` and `apps/server` consume `packages/shared` via the `workspace:*` protocol. Turborepo ensures `shared` is built before either app.

---

## 5. API Design

### Why tRPC (Not REST or GraphQL)

tRPC provides end-to-end type safety between the Next.js frontend and the Express backend without code generation, schema duplication, or runtime overhead. The client imports the server's router type directly, so every procedure call is type-checked at compile time. This eliminates an entire class of bugs (wrong field names, missing params, incorrect response shapes) that plague REST and GraphQL APIs.

### tRPC Routers

The root router merges module-specific routers. Each module router contains only the procedures relevant to that module's domain.

```typescript
// src/trpc/router.ts
export const appRouter = router({
  auth:          authRouter,
  onboarding:    onboardingRouter,
  voice:         voiceRouter,
  pillars:       pillarsRouter,
  calendar:      calendarRouter,
  posts:         postsRouter,
  review:        reviewRouter,
  publishing:    publishingRouter,
  analytics:     analyticsRouter,
  billing:       billingRouter,
  notifications: notificationsRouter,
});
```

### Router Procedure Inventory

#### auth

| Procedure | Type | Description |
|-----------|------|-------------|
| `auth.getSession` | query | Return current user from Clerk session |
| `auth.deleteAccount` | mutation | Soft-delete user and revoke tokens |

#### onboarding

| Procedure | Type | Description |
|-----------|------|-------------|
| `onboarding.getStep` | query | Return current onboarding step |
| `onboarding.submitQuestionnaire` | mutation | Save questionnaire answers |
| `onboarding.connectLinkedIn` | mutation | Initiate LinkedIn OAuth |
| `onboarding.completeStep` | mutation | Advance to next step |

#### voice

| Procedure | Type | Description |
|-----------|------|-------------|
| `voice.getProfile` | query | Return voice profile for current user |
| `voice.triggerAnalysis` | mutation | Enqueue voice analysis job |
| `voice.updateProfile` | mutation | User edits voice profile |
| `voice.getVersionHistory` | query | List past profile versions |

#### pillars

| Procedure | Type | Description |
|-----------|------|-------------|
| `pillars.list` | query | Return user's content pillars |
| `pillars.create` | mutation | Create new pillar |
| `pillars.update` | mutation | Edit pillar name/description/weight |
| `pillars.delete` | mutation | Soft-delete a pillar |
| `pillars.rebalance` | mutation | Auto-rebalance weights to sum 1.0 |

#### calendar

| Procedure | Type | Description |
|-----------|------|-------------|
| `calendar.getWeek` | query | Return calendar slots for a given week |
| `calendar.getMonth` | query | Return calendar slots for a given month |
| `calendar.updateSlot` | mutation | Edit a calendar slot (pillar, format, time) |
| `calendar.generateWeek` | mutation | Auto-generate next week's calendar |

#### posts

| Procedure | Type | Description |
|-----------|------|-------------|
| `posts.getById` | query | Return a single post with analytics |
| `posts.list` | query | Paginated post list with filters (status, pillar, date range) |
| `posts.update` | mutation | Edit post content |
| `posts.delete` | mutation | Soft-delete a post |

#### review

| Procedure | Type | Description |
|-----------|------|-------------|
| `review.getQueue` | query | Return posts pending review (status=draft) |
| `review.approve` | mutation | Set status to approved, lock schedule |
| `review.skip` | mutation | Set status to skipped |
| `review.regenerate` | mutation | Re-generate post with optional feedback (max 3) |
| `review.bulkApprove` | mutation | Approve multiple posts at once |

#### publishing

| Procedure | Type | Description |
|-----------|------|-------------|
| `publishing.getStatus` | query | LinkedIn connection status + token health |
| `publishing.disconnect` | mutation | Revoke LinkedIn connection |
| `publishing.retryFailed` | mutation | Re-enqueue a failed post |

#### analytics

| Procedure | Type | Description |
|-----------|------|-------------|
| `analytics.overview` | query | Dashboard summary (impressions, reactions, posts this week) |
| `analytics.postMetrics` | query | Metrics for a single post over time |
| `analytics.pillarComparison` | query | Performance breakdown by pillar |
| `analytics.weeklyReport` | query | Full weekly report data |
| `analytics.engagementTrend` | query | Time-series engagement data |

#### billing

| Procedure | Type | Description |
|-----------|------|-------------|
| `billing.getSubscription` | query | Current plan, usage, next billing date |
| `billing.createCheckout` | mutation | Generate Stripe checkout URL |
| `billing.createPortal` | mutation | Generate Stripe customer portal URL |

#### notifications

| Procedure | Type | Description |
|-----------|------|-------------|
| `notifications.list` | query | Paginated in-app notifications |
| `notifications.markRead` | mutation | Mark notifications as read |
| `notifications.updatePreferences` | mutation | Toggle email notifications |

### Middleware Stack

```
Request
  → CORS check
  → Clerk JWT verification (via jose)
  → tRPC context creation (inject user, db, redis)
  → Rate limiting (per user, per procedure)
  → Procedure handler
  → Response
```

---

## 6. Job Queues

Seven BullMQ queues handle all background work. Each queue has its own worker with independent concurrency settings.

| Queue | Trigger | Concurrency | Rate Limit | Description |
|-------|---------|-------------|------------|-------------|
| **publish-post** | Cron at scheduled time | 3 | 1 per user per 5min | Publish approved post to LinkedIn |
| **generate-content** | Calendar schedule or manual | 2 | 5 per user per hour | Generate post via Claude API |
| **analyze-voice** | Onboarding or manual trigger | 1 | 1 per user per day | Run voice analysis pipeline |
| **fetch-analytics** | Cron every 6 hours | 5 | 10 per user per hour | Fetch LinkedIn post metrics |
| **refresh-tokens** | Cron daily | 2 | None | Refresh LinkedIn OAuth tokens before expiry |
| **send-notification** | Event-driven | 5 | 20 per minute global | Send email via Resend or create in-app notification |
| **generate-report** | Cron weekly (Monday 8am user tz) | 3 | None | Compile weekly performance report |

### Queue Configuration

```typescript
// src/queue/queues.ts
import { Queue } from 'bullmq';
import { redisConnection } from '../lib/redis';

export const publishPostQueue = new Queue('publish-post', {
  connection: redisConnection,
  defaultJobOptions: {
    attempts: 3,
    backoff: { type: 'exponential', delay: 60_000 },
    removeOnComplete: { count: 1000 },
    removeOnFail: { count: 5000 },
  },
});
```

### Worker Lifecycle

Workers run in the same Railway service as the API server but in a separate process. This means a worker crash does not take down the API, and vice versa. BullMQ's built-in retry with exponential backoff handles transient failures. After all retries are exhausted, the job is moved to the failed set and a `send-notification` job is enqueued to alert the user.

### Job Priority

Jobs that directly affect user experience have higher priority:

1. `publish-post` (highest) -- missed publish windows are visible to the user
2. `generate-content` -- users are waiting for review queue to fill
3. `send-notification` -- time-sensitive alerts
4. `analyze-voice` -- onboarding blocker
5. `fetch-analytics` -- background, can be delayed
6. `refresh-tokens` -- background maintenance
7. `generate-report` -- weekly batch, low urgency

---

## 7. Data Flows

### 7.1 Onboarding to Voice Analysis

```
User signs up (Clerk)
  → Clerk webhook fires
  → auth module creates user row
  → User completes questionnaire
  → onboarding.submitQuestionnaire saves answers
  → User connects LinkedIn (OAuth)
  → publishing module stores encrypted tokens
  → Onboarding triggers voice analysis
  → voice module enqueues analyze-voice job
  → Worker fetches last 50-100 LinkedIn posts
  → Worker runs statistical analysis + Claude LLM analysis
  → Worker merges results into voice profile
  → Profile saved with version=1, confidence scores
  → User reviews/tweaks profile in UI
  → Onboarding complete
```

### 7.2 Content Generation to Review to Publish

```
Calendar schedule triggers generate-content job
  → Worker selects pillar + format + angle
      (weighted rotation, least-recently-used hook type)
  → Worker gathers context:
      - voice profile
      - trending topics
      - past top-performing posts
      - negative examples (skipped/low-engagement)
  → Worker calls Claude API with structured prompt
  → Worker applies constraints (length, formatting, voice profile)
  → Worker runs quality check (score >= 60)
  → Post inserted into DB with status=draft
  → send-notification job enqueued (review reminder)
  → User opens review queue
  → User approves / edits / regenerates / skips
  → Approved post scheduled at optimal time
  → publish-post job fires at scheduled time
  → Worker publishes via LinkedIn API
  → linkedin_post_id stored
  → Post status updated to published
```

### 7.3 Analytics to Strategy Adaptation

```
Cron triggers fetch-analytics jobs every 6 hours
  → Worker fetches metrics for posts < 7 days old
  → Snapshots stored in post_analytics table
  → Weekly: generate-report job runs
  → Worker aggregates per-post, per-pillar metrics
  → Worker identifies top/bottom performers
  → Worker generates insights:
      - Which pillars are working
      - Which hook types get best engagement
      - Optimal posting times
      - Trending content patterns
  → Report stored and emailed via send-notification
  → Strategy data fed back into content generation:
      - Pillar weights updated
      - Hook type selection biased toward top performers
      - Posting time windows refined
```

---

## 8. Scaling Plan

### Tier 1: 1K Users ($210/month infrastructure)

| Service | Cost/mo | Notes |
|---------|---------|-------|
| Vercel | $20 (Pro) | Frontend |
| Railway | $20 | Server + workers (1 container each) |
| Neon | $25 (Launch) | PostgreSQL with autoscaling |
| Upstash | $10 (Pro) | Redis |
| Cloudflare R2 | $5 | 10GB storage, free egress |
| Clerk | $25 (Pro) | Auth |
| Resend | $20 | 50K emails/mo |
| Claude API | ~$80 | ~4K posts/mo + voice analyses |
| Stripe | $5 (estimated) | Platform fee on transactions |
| **Total** | **~$210/mo** | |

At this tier, the modular monolith runs comfortably on a single Railway container (2 vCPU, 2GB RAM). PostgreSQL handles all queries without read replicas. Redis runs a single instance. No caching layer is needed beyond BullMQ.

### Tier 2: 10K Users ($2,150/month infrastructure)

| Service | Cost/mo | Notes |
|---------|---------|-------|
| Vercel | $20 | Scales automatically |
| Railway | $150 | 2 server replicas + 3 worker replicas |
| Neon | $150 (Scale) | Read replicas for analytics queries |
| Upstash | $50 (Business) | Higher throughput |
| Cloudflare R2 | $30 | 100GB storage |
| Clerk | $100 | Volume pricing |
| Resend | $80 | 500K emails/mo |
| Claude API | ~$800 | ~40K posts/mo |
| Stripe | $50 | |
| CDN / misc | $20 | |
| **Total** | **~$2,150/mo** | |

Changes at this tier:
- **Horizontal scaling**: Multiple server replicas behind Railway's load balancer. Workers scale independently.
- **Read replicas**: Analytics queries routed to Neon read replicas to avoid contention with writes.
- **Redis caching**: Add a cache layer for voice profiles and calendar data (hot paths). TTL-based invalidation.
- **Queue partitioning**: Worker concurrency increased per queue. Dedicated worker containers for `publish-post` (latency-critical).

### Tier 3: 100K Users (Architectural Extraction)

At 100K users, the monolith's AI engine becomes the bottleneck. The following architectural changes are required:

1. **Extract AI engine as a separate service**: The `voice` and `content` modules (Claude API calls) move to their own Railway service with independent scaling. Communication switches from in-process function calls to an internal HTTP API or message queue.
2. **Partition analytics**: The `post_analytics` table is the largest and fastest-growing. Partition by `snapshot_at` (monthly partitions). Older partitions archived to cold storage. Recent data stays hot.
3. **Dedicated Redis clusters**: Separate Redis instances for BullMQ queues vs. application caching to avoid queue throughput affecting cache hit rates.
4. **CDN for media**: Cloudflare R2 already has built-in CDN, but at this scale, add cache rules for carousel PDFs and generated images.
5. **Connection pooling**: Add PgBouncer between the application and PostgreSQL to handle connection exhaustion across replicas.
6. **Cost estimate**: $15K-20K/month infrastructure (still well within margin at $29/user * 100K users = $2.9M ARR).

---

## 9. Architecture Decision Records

### ADR-001: Modular Monolith Over Microservices

**Status:** Accepted

**Context:** We need an architecture for an MVP being built by a small team in 8-10 weeks. The system has 8 domain modules with clear boundaries.

**Decision:** Start as a modular monolith with clean module interfaces. Each module owns its tables and exports typed functions. No shared mutable state between modules.

**Rationale:**
- A small team (1-3 engineers) cannot afford the operational overhead of microservices: separate deployments, inter-service auth, distributed tracing, network partitions, eventual consistency.
- Module boundaries are enforced by code convention (and enforced via linting rules that prevent cross-module imports).
- Any module can be extracted into a microservice later by replacing direct function calls with HTTP/queue calls. The interface contract (TypeScript types) does not change.

**Trade-offs:**
- All modules share a single deploy. A bug in `billing` can crash `publishing`.
- Mitigation: BullMQ workers run in a separate process, isolating background work from the API server.

---

### ADR-002: tRPC Over REST

**Status:** Accepted

**Context:** We need an API layer between the Next.js frontend and the Express backend. Options: REST, GraphQL, tRPC.

**Decision:** Use tRPC v11 for all client-server communication.

**Rationale:**
- **End-to-end type safety**: The frontend imports the server's `AppRouter` type directly. No codegen, no OpenAPI spec, no manual type maintenance.
- **No over-fetching**: Unlike REST, tRPC procedures return exactly what the client needs. Unlike GraphQL, there is no schema definition language or resolver overhead.
- **Smaller surface**: Auto-Linked is a single-client application (our own frontend). tRPC is designed for this exact scenario. GraphQL's multi-client flexibility is unnecessary overhead.
- **TanStack Query integration**: `@trpc/react-query` provides built-in hooks with caching, optimistic updates, and background refetching -- exactly what the review queue and dashboard need.

**Trade-offs:**
- tRPC is TypeScript-only. If we add a mobile app in a different language, we would need to either keep tRPC and consume it via HTTP (losing type safety on mobile) or add a REST/GraphQL layer alongside it.
- Mitigation: tRPC procedures are callable via HTTP at `/trpc/{procedure}`. A future mobile app can use this as a REST-like endpoint.

---

### ADR-003: Drizzle ORM Over Prisma

**Status:** Accepted

**Context:** We need a TypeScript ORM for PostgreSQL. Options: Prisma, Drizzle, Knex, raw SQL.

**Decision:** Use Drizzle ORM with Drizzle Kit for migrations.

**Rationale:**
- **SQL-first**: Drizzle generates SQL that is readable and predictable. Prisma generates SQL behind an abstraction that sometimes produces suboptimal queries (e.g., N+1 on relations, unnecessary subqueries).
- **No engine binary**: Prisma requires a Rust-based query engine binary (~15MB) that adds cold-start latency and complicates Docker builds. Drizzle runs as pure TypeScript.
- **Type inference from schema**: Drizzle's `InferSelectModel<typeof users>` derives types directly from the schema definition, keeping types and schema in sync without codegen.
- **Relational queries**: Drizzle's `query` API handles nested joins cleanly without the N+1 problems of Prisma's `include`.
- **Migration control**: Drizzle Kit generates migration SQL files that can be reviewed and committed. No opaque migration engine.

**Trade-offs:**
- Drizzle has a smaller ecosystem and community compared to Prisma. Fewer blog posts, tutorials, and Stack Overflow answers.
- Drizzle's API is lower-level, requiring more SQL knowledge from developers.
- Mitigation: The team is comfortable with SQL. The database schema document provides all query patterns.

---

### ADR-004: BullMQ Over SQS/Cloud Queues

**Status:** Accepted

**Context:** We need a job queue for background tasks: publishing posts, generating content, fetching analytics. Options: BullMQ (Redis-backed), AWS SQS, Google Cloud Tasks, custom cron.

**Decision:** Use BullMQ with Redis (Upstash) for all background job processing.

**Rationale:**
- **Scheduling**: BullMQ supports delayed jobs, cron-based repeatable jobs, and priority queues out of the box. This covers all our scheduling needs: publish at specific times, fetch analytics every 6h, generate reports weekly.
- **Retry with backoff**: Built-in exponential backoff with configurable attempt counts. Critical for LinkedIn API calls that may fail transiently.
- **Observability**: BullMQ has a built-in dashboard (Bull Board) for inspecting queue state, failed jobs, and worker health.
- **Cost**: Upstash Redis is $10-50/month. SQS would add AWS vendor lock-in and complicate the Railway deployment.
- **Developer experience**: BullMQ is well-documented Node.js-native. Workers are plain async functions.

**Trade-offs:**
- Redis is single-threaded and memory-bound. At extreme scale (100K+ users), queue throughput may require Redis Cluster.
- BullMQ jobs are not durable across Redis restarts unless persistence is enabled (Upstash provides persistence by default).
- Mitigation: Upstash's managed Redis includes persistence and replication. At 100K users, migration to Redis Cluster or a dedicated queue service is straightforward.

---

### ADR-005: Clerk Over NextAuth

**Status:** Accepted

**Context:** We need authentication supporting email/password, Google OAuth, and LinkedIn OAuth. Options: NextAuth.js (Auth.js), Clerk, Supabase Auth, custom.

**Decision:** Use Clerk for all authentication.

**Rationale:**
- **Pre-built UI**: Clerk provides embeddable sign-in/sign-up components, reducing onboarding flow development time.
- **LinkedIn OAuth**: Clerk supports LinkedIn as a social provider out of the box. NextAuth requires custom provider configuration and LinkedIn API scopes are tricky.
- **Webhook events**: Clerk fires webhooks on user creation, update, deletion -- integrating cleanly with our server-side user sync.
- **Session management**: JWT-based sessions verified via `jose` on the backend. No server-side session store needed.

**Trade-offs:**
- Vendor lock-in: Clerk is a third-party dependency. If pricing changes or the service is discontinued, migration is nontrivial.
- Mitigation: User data is synced to our own `users` table. Clerk is only responsible for authentication, not authorization. Switching auth providers would require UI changes and a token migration, but business logic is unaffected.

---

### ADR-006: Cloudflare R2 Over AWS S3

**Status:** Accepted

**Context:** We need object storage for AI-generated images and carousel PDFs. Options: AWS S3, Cloudflare R2, Supabase Storage.

**Decision:** Use Cloudflare R2.

**Rationale:**
- **Zero egress fees**: R2 has no data transfer charges. For a media-heavy app where images are frequently viewed by users, this prevents runaway costs.
- **S3-compatible API**: Existing S3 client libraries (`@aws-sdk/client-s3`) work with R2. No code changes needed.
- **Built-in CDN**: R2 objects are served via Cloudflare's edge network automatically.

**Trade-offs:**
- Smaller feature set than S3 (no lifecycle policies, limited event notifications).
- Mitigation: Our media workflow is simple (upload, serve, delete). We do not need advanced S3 features.
