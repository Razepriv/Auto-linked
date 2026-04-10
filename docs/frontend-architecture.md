# Auto-Linked: Frontend Architecture

**Version:** 1.0
**Date:** 2026-04-09
**Status:** Draft

---

## Table of Contents

1. [Tech Stack](#1-tech-stack)
2. [Route Structure](#2-route-structure)
3. [Pages](#3-pages)
4. [Component Architecture](#4-component-architecture)
5. [State Management](#5-state-management)
6. [Optimistic Updates](#6-optimistic-updates)
7. [Design System](#7-design-system)
8. [LinkedIn Post Preview Component](#8-linkedin-post-preview-component)
9. [Key UX Flows](#9-key-ux-flows)
10. [Implementation Phases](#10-implementation-phases)

---

## 1. Tech Stack

| Technology | Version | Purpose | Why This Choice |
|-----------|---------|---------|----------------|
| **Next.js** | 15.x | Framework (App Router) | RSC, Turbopack, layouts, middleware |
| **React** | 19.x | UI rendering | Latest with Server Components |
| **Tailwind CSS** | 4.x | Styling | Utility-first, zero runtime cost |
| **shadcn/ui** | Latest | Component library | Radix primitives, fully customizable, copy-paste ownership |
| **TanStack Query** | v5 | Server state (cache, sync, optimistic) | Best-in-class cache invalidation, mutations, stale-while-revalidate |
| **Zustand** | 5.x | Client UI state | Tiny, no boilerplate, middleware support |
| **React Hook Form** | 7.x | Form management | Uncontrolled by default (performance), works with Zod |
| **Zod** | 3.23+ | Schema validation | Shared with backend via `@auto-linked/shared` |
| **Tiptap** | Latest | Rich text post editor | Headless, extensible, outputs plain text for LinkedIn |
| **Recharts** | Latest | Analytics charts | React-native, responsive, composable |
| **date-fns** | Latest | Date utilities | Tree-shakable, immutable |
| **@dnd-kit** | Latest | Drag-and-drop | Calendar reordering, queue rearrangement |
| **next-themes** | 0.4.x | Dark mode | SSR-safe theme switching |
| **Lucide React** | Latest | Icons | Consistent, tree-shakable icon set |
| **clsx + tailwind-merge** | Latest | Class utilities | Conditional classes without conflicts |

### tRPC Client Setup

The frontend connects to the backend via tRPC using `@trpc/react-query`, which wraps TanStack Query with type-safe hooks:

```typescript
// src/lib/trpc.ts
import { createTRPCReact } from '@trpc/react-query';
import type { AppRouter } from '@auto-linked/server/trpc/router';

export const trpc = createTRPCReact<AppRouter>();
```

Every `trpc.{router}.{procedure}.useQuery()` and `trpc.{router}.{procedure}.useMutation()` call is fully type-safe against the server's router definition.

---

## 2. Route Structure

The app uses Next.js 15 App Router with three route groups, each with its own layout:

```
src/app/
├── (marketing)/                    # Public pages — no auth required
│   ├── layout.tsx                  # Marketing layout (header + footer)
│   ├── page.tsx                    # Landing page (/)
│   └── pricing/
│       └── page.tsx                # Pricing page (/pricing)
│
├── (auth)/                         # Auth pages — redirect if already logged in
│   ├── layout.tsx                  # Auth layout (centered card)
│   ├── login/
│   │   └── page.tsx                # Login (/login)
│   └── signup/
│       └── page.tsx                # Signup (/signup)
│
├── (app)/                          # Authenticated app — requires login
│   ├── layout.tsx                  # App layout (sidebar + header + main)
│   ├── dashboard/
│   │   └── page.tsx                # Dashboard (/dashboard)
│   ├── onboarding/
│   │   └── [step]/
│   │       └── page.tsx            # Onboarding wizard (/onboarding/[step])
│   ├── queue/
│   │   ├── page.tsx                # Review queue (/queue)
│   │   └── [postId]/
│   │       └── page.tsx            # Single post review (/queue/[postId])
│   ├── calendar/
│   │   └── page.tsx                # Content calendar (/calendar)
│   ├── editor/
│   │   └── [postId]/
│   │       └── page.tsx            # Post editor (/editor/[postId])
│   ├── analytics/
│   │   ├── page.tsx                # Analytics overview (/analytics)
│   │   └── [postId]/
│   │       └── page.tsx            # Single post analytics (/analytics/[postId])
│   └── settings/
│       ├── layout.tsx              # Settings layout (tabs)
│       ├── profile/
│       │   └── page.tsx            # Profile settings (/settings/profile)
│       ├── pillars/
│       │   └── page.tsx            # Content pillars (/settings/pillars)
│       ├── schedule/
│       │   └── page.tsx            # Posting schedule (/settings/schedule)
│       ├── linkedin/
│       │   └── page.tsx            # LinkedIn connection (/settings/linkedin)
│       └── billing/
│           └── page.tsx            # Billing & subscription (/settings/billing)
│
├── api/                            # API routes (webhooks, OAuth callbacks)
│   ├── webhooks/
│   │   ├── clerk/route.ts          # Clerk user sync webhook
│   │   └── stripe/route.ts         # Stripe billing webhook
│   └── auth/
│       └── linkedin/callback/route.ts  # LinkedIn OAuth callback
│
├── layout.tsx                      # Root layout (providers, fonts, theme)
└── not-found.tsx                   # 404 page
```

### Route Group Layouts

#### (marketing) Layout
- Top navigation bar with logo, "Features," "Pricing," "Login," "Get Started" CTA.
- Footer with links, social icons, legal.
- No sidebar. Full-width content area.

#### (auth) Layout
- Centered card on a branded background.
- Logo at top. Social login buttons. Email/password form.
- Link to switch between login/signup.

#### (app) Layout
- Collapsible sidebar with navigation links.
- Top header with user avatar, notifications bell, search.
- Mobile: bottom navigation bar replaces sidebar.
- Main content area with breadcrumbs.

---

## 3. Pages

### Landing Page (`/`)

**Purpose**: Convert visitors to signups.

**Sections**:
1. Hero: Headline, subline, "Get Started Free" CTA, animated post preview.
2. Problem statement: 3-column grid of pain points.
3. How it works: 4-step visual flow (Connect, Learn, Generate, Publish).
4. Features grid: Voice analysis, content pillars, review queue, analytics.
5. Social proof: Testimonial cards, logos, engagement metrics.
6. Pricing: 3-tier pricing cards (Free, Pro, Team).
7. FAQ: Accordion component.
8. Final CTA: "Start your 14-day free trial."

### Dashboard (`/dashboard`)

**Purpose**: At-a-glance status of the user's content pipeline.

**Components**:
- Welcome banner with onboarding progress (if incomplete).
- Quick stats cards: posts this week, avg engagement, queue size, streak days.
- Upcoming posts timeline (next 3 scheduled posts).
- Performance sparkline (engagement trend, last 30 days).
- Quick actions: "Review Queue (N pending)," "Generate More Posts," "View Calendar."

### Review Queue (`/queue`)

**Purpose**: Primary daily interaction. Review and approve generated posts.

**Components**:
- Filter bar: status (draft/approved/all), pillar, format, date range.
- Post list (left panel on desktop, full-width on mobile).
- Post preview (right panel on desktop, drawer on mobile): LinkedIn-accurate preview.
- Action buttons: Approve, Edit, Regenerate, Skip.
- Bulk action bar: Select all, bulk approve, bulk skip.
- Keyboard shortcut hints.

### Post Editor (`/editor/[postId]`)

**Purpose**: Detailed editing of a single post.

**Components**:
- Split view: Tiptap editor (left) + LinkedIn preview (right).
- Character/word counter.
- Hashtag suggestions.
- Media attachment panel (upload, AI generate, stock search).
- Voice match indicator (how well the edit matches the voice profile).
- Save draft / Approve & Schedule buttons.

### Content Calendar (`/calendar`)

**Purpose**: Visual overview of the posting schedule.

**Components**:
- Month/week toggle view.
- Calendar grid with post cards on each day.
- Drag-and-drop to reschedule posts (via @dnd-kit).
- Click to expand post preview.
- Color-coded by pillar.
- Empty slot indicator with "Generate Post" button.
- Today marker, past/future visual distinction.

### Analytics Overview (`/analytics`)

**Purpose**: Understand what is working.

**Components**:
- Overview cards: total impressions (30d), total reactions, avg engagement rate, best day.
- Engagement trend chart (Recharts line chart, 30/60/90 day toggles).
- Pillar comparison bar chart.
- Top 5 posts table (sortable by impressions, reactions, comments).
- Hook type performance comparison.
- Posting time heatmap.

### Single Post Analytics (`/analytics/[postId]`)

**Purpose**: Deep dive into a single post's performance.

**Components**:
- Post preview (LinkedIn-style).
- Metrics timeline (impressions, reactions, comments at 24h, 48h, 7d snapshots).
- Comparison to user's average.
- Strategy note (why this post was generated).
- "Generate similar" button.

### Settings Pages

**Profile** (`/settings/profile`): Edit name, email, avatar, timezone, notification preferences.

**Pillars** (`/settings/pillars`): Manage content pillars. Add/edit/delete pillars. Adjust weights with sliders (sum enforced to 1.0). View pillar performance scores.

**Schedule** (`/settings/schedule`): Configure weekly posting template. Set time per day. Enable/disable days. Format selection per slot.

**LinkedIn** (`/settings/linkedin`): Connection status. Token health indicator. Disconnect/reconnect. Fallback mode (copy-to-clipboard) toggle.

**Billing** (`/settings/billing`): Current plan. Usage meter. Upgrade/downgrade buttons. Billing history. Stripe customer portal link.

### Onboarding Wizard (`/onboarding/[step]`)

**Purpose**: Guided setup experience. 5 steps.

**Steps**:
1. **Welcome** — Name, role, industry. Single form.
2. **Questionnaire** — Voice and preference questions (6-8 questions). Multi-page form.
3. **LinkedIn Connect** — OAuth flow. "Connect LinkedIn" button + fallback "Paste your posts" option.
4. **Voice Review** — Displays generated voice profile. User can tweak. Loading state while analysis runs.
5. **Pillars Setup** — Define 3-5 content pillars. System suggests based on questionnaire answers. Drag-and-drop weight sliders.

Each step persists progress server-side. Users can leave and resume.

---

## 4. Component Architecture

### Directory Structure

```
src/components/
├── layout/
│   ├── AppShell.tsx              # Sidebar + Header + Main wrapper
│   ├── Sidebar.tsx               # Navigation sidebar (collapsible)
│   ├── Header.tsx                # Top bar (notifications, user menu)
│   ├── MobileNav.tsx             # Bottom navigation for mobile
│   └── SettingsTabs.tsx          # Tab navigation for settings pages
│
├── post/
│   ├── PostCard.tsx              # Compact post card (for lists/calendar)
│   ├── PostPreview.tsx           # LinkedIn-accurate post preview (see Section 8)
│   ├── PostEditor.tsx            # Tiptap-based rich text editor
│   ├── PostActions.tsx           # Approve/Edit/Regenerate/Skip buttons
│   ├── PostStatusBadge.tsx       # Color-coded status pill
│   └── PostMediaAttachment.tsx   # Image/carousel preview + upload controls
│
├── queue/
│   ├── QueueList.tsx             # Scrollable list of posts in review queue
│   ├── QueueFilters.tsx          # Status, pillar, format, date filters
│   ├── BulkActions.tsx           # Select all, bulk approve/skip bar
│   └── RegenerateDialog.tsx      # Modal for regeneration with feedback
│
├── calendar/
│   ├── CalendarView.tsx          # Month/week grid container
│   ├── CalendarDay.tsx           # Single day cell with post cards
│   ├── CalendarPost.tsx          # Draggable post card for calendar
│   └── CalendarEmptySlot.tsx     # Empty day slot with "Generate" button
│
├── analytics/
│   ├── OverviewCards.tsx          # Grid of stat cards
│   ├── EngagementChart.tsx        # Recharts line chart (time series)
│   ├── PillarComparison.tsx       # Bar chart comparing pillar performance
│   ├── TopPostsTable.tsx          # Sortable table of best posts
│   ├── HookTypePerformance.tsx    # Hook type performance comparison
│   └── PostingHeatmap.tsx         # Time-of-day engagement heatmap
│
├── onboarding/
│   ├── StepWizard.tsx             # Step indicator + navigation
│   ├── WelcomeStep.tsx            # Step 1: Name, role, industry
│   ├── QuestionnaireStep.tsx      # Step 2: Voice preferences
│   ├── LinkedInConnectStep.tsx    # Step 3: OAuth flow
│   ├── VoiceReviewStep.tsx        # Step 4: Review voice profile
│   └── PillarsSetupStep.tsx       # Step 5: Define content pillars
│
├── voice/
│   ├── VoiceProfileCard.tsx       # Displays voice profile summary
│   ├── VoiceProfileEditor.tsx     # Editable voice profile form
│   └── VoiceConfidenceBar.tsx     # Visual confidence indicator
│
├── billing/
│   ├── PricingCard.tsx            # Single pricing tier card
│   ├── UsageMeter.tsx             # Usage bar (posts used / limit)
│   └── PlanBadge.tsx              # "Free" / "Pro" / "Team" badge
│
└── shared/
    ├── EmptyState.tsx             # Illustration + message for empty lists
    ├── PageHeader.tsx             # Page title + description + action buttons
    ├── ConfirmDialog.tsx          # Generic confirmation modal
    ├── LoadingSpinner.tsx         # Loading indicator
    ├── ErrorBoundary.tsx          # Error boundary with retry
    ├── Skeleton.tsx               # Loading skeleton shapes
    └── KeyboardShortcuts.tsx      # Global keyboard shortcut handler
```

### Component Patterns

**Composition over configuration**: Components accept children and slots rather than huge prop objects. Example: `PageHeader` has `title`, `description`, and a `children` slot for action buttons.

**Server Components by default**: All components are Server Components unless they need interactivity. Interactive components are marked with `"use client"` and kept small.

**Data fetching at the page level**: Pages fetch data via tRPC and pass it to components as props. Components do not fetch data themselves (except for pagination and infinite scroll within `QueueList`).

---

## 5. State Management

### Server State: TanStack Query via tRPC

All data from the backend is managed by TanStack Query through the tRPC integration. This provides:
- **Caching**: Responses are cached by query key. Stale data is shown immediately while fresh data loads in the background.
- **Background refetching**: Data is refreshed on window focus, on reconnect, and at configurable intervals.
- **Optimistic updates**: Mutations optimistically update the cache before the server responds (Section 6).
- **Invalidation**: After a mutation, related queries are invalidated to trigger a refetch.

#### Query Key Conventions

```typescript
// Query keys follow the pattern: [module, entity, params]
// Examples:
trpc.review.getQueue.useQuery({ status: 'draft' });
// Key: ['review', 'getQueue', { status: 'draft' }]

trpc.analytics.overview.useQuery({ period: '30d' });
// Key: ['analytics', 'overview', { period: '30d' }]

trpc.posts.getById.useQuery({ id: postId });
// Key: ['posts', 'getById', { id: postId }]
```

#### Invalidation After Mutations

```typescript
// After approving a post, invalidate the review queue and the post detail
const approveMutation = trpc.review.approve.useMutation({
  onSuccess: () => {
    queryClient.invalidateQueries({ queryKey: ['review', 'getQueue'] });
    queryClient.invalidateQueries({ queryKey: ['posts'] });
  },
});
```

### Client UI State: Zustand

Client-only UI state that does not need to be synced with the server lives in Zustand stores.

```typescript
// src/stores/ui-store.ts
interface UIState {
  sidebarCollapsed: boolean;
  toggleSidebar: () => void;

  calendarView: 'month' | 'week';
  setCalendarView: (view: 'month' | 'week') => void;

  selectedPostIds: Set<string>;
  togglePostSelection: (id: string) => void;
  clearSelection: () => void;
  selectAll: (ids: string[]) => void;
}

export const useUIStore = create<UIState>((set) => ({
  sidebarCollapsed: false,
  toggleSidebar: () => set((s) => ({ sidebarCollapsed: !s.sidebarCollapsed })),

  calendarView: 'month',
  setCalendarView: (view) => set({ calendarView: view }),

  selectedPostIds: new Set(),
  togglePostSelection: (id) => set((s) => {
    const next = new Set(s.selectedPostIds);
    next.has(id) ? next.delete(id) : next.add(id);
    return { selectedPostIds: next };
  }),
  clearSelection: () => set({ selectedPostIds: new Set() }),
  selectAll: (ids) => set({ selectedPostIds: new Set(ids) }),
}));
```

### Form State: React Hook Form + Zod

All forms use React Hook Form with Zod resolvers. Schemas are imported from `@auto-linked/shared`:

```typescript
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { pillarCreateSchema } from '@auto-linked/shared/validators';

const form = useForm({
  resolver: zodResolver(pillarCreateSchema),
  defaultValues: { name: '', description: '', weight: 0.2 },
});
```

---

## 6. Optimistic Updates

The review queue is the most interaction-heavy part of the app. Users expect instant feedback when they approve, skip, or regenerate posts. Optimistic updates make the UI feel snappy by updating the cache before the server responds.

### Approve (Optimistic)

```typescript
const approveMutation = trpc.review.approve.useMutation({
  onMutate: async ({ postId }) => {
    // Cancel outgoing refetches so they don't overwrite our optimistic update
    await queryClient.cancelQueries({ queryKey: ['review', 'getQueue'] });

    // Snapshot previous state for rollback
    const previous = queryClient.getQueryData(['review', 'getQueue']);

    // Optimistically remove from queue
    queryClient.setQueryData(['review', 'getQueue'], (old: Post[]) =>
      old.filter(p => p.id !== postId)
    );

    return { previous };
  },
  onError: (_err, _vars, context) => {
    // Rollback on error
    if (context?.previous) {
      queryClient.setQueryData(['review', 'getQueue'], context.previous);
    }
    toast.error('Failed to approve post. Please try again.');
  },
  onSettled: () => {
    // Refetch to ensure consistency
    queryClient.invalidateQueries({ queryKey: ['review', 'getQueue'] });
  },
});
```

### Skip (Optimistic)

Same pattern as approve: remove from queue immediately, rollback on error.

### Regenerate (Optimistic)

```typescript
const regenerateMutation = trpc.review.regenerate.useMutation({
  onMutate: async ({ postId }) => {
    await queryClient.cancelQueries({ queryKey: ['review', 'getQueue'] });
    const previous = queryClient.getQueryData(['review', 'getQueue']);

    // Optimistically mark as "regenerating" (show loading state on the card)
    queryClient.setQueryData(['review', 'getQueue'], (old: Post[]) =>
      old.map(p => p.id === postId ? { ...p, _regenerating: true } : p)
    );

    return { previous };
  },
  onSuccess: (newPost, { postId }) => {
    // Replace the old post with the new one in the cache
    queryClient.setQueryData(['review', 'getQueue'], (old: Post[]) =>
      old.map(p => p.id === postId ? newPost : p)
    );
  },
  onError: (_err, _vars, context) => {
    if (context?.previous) {
      queryClient.setQueryData(['review', 'getQueue'], context.previous);
    }
    toast.error('Failed to regenerate post. Please try again.');
  },
});
```

---

## 7. Design System

### Brand Colors

```css
:root {
  /* Primary: LinkedIn Blue */
  --color-primary: #0A66C2;
  --color-primary-hover: #004182;
  --color-primary-light: #D0E8FF;

  /* Success: Green */
  --color-success: #057642;
  --color-success-light: #D4EDDA;

  /* Accent: Purple */
  --color-accent: #8B5CF6;
  --color-accent-hover: #7C3AED;
  --color-accent-light: #EDE9FE;

  /* Danger */
  --color-danger: #DC2626;
  --color-danger-light: #FEE2E2;

  /* Warning */
  --color-warning: #D97706;
  --color-warning-light: #FEF3C7;

  /* Neutrals */
  --color-bg: #FFFFFF;
  --color-bg-secondary: #F9FAFB;
  --color-border: #E5E7EB;
  --color-text: #111827;
  --color-text-secondary: #6B7280;
  --color-text-muted: #9CA3AF;
}
```

### Pillar Colors

Each pillar is assigned a color from a fixed palette for visual consistency across the calendar, queue, and analytics:

| Index | Color | Hex | Usage |
|-------|-------|-----|-------|
| 1 | Blue | `#3B82F6` | First pillar |
| 2 | Emerald | `#10B981` | Second pillar |
| 3 | Amber | `#F59E0B` | Third pillar |
| 4 | Rose | `#F43F5E` | Fourth pillar |
| 5 | Violet | `#8B5CF6` | Fifth pillar |

### Typography

**Font**: Inter (loaded via `next/font/google` for optimal performance).

| Element | Size | Weight | Line Height |
|---------|------|--------|-------------|
| h1 (page title) | 30px / 1.875rem | 700 | 1.2 |
| h2 (section title) | 24px / 1.5rem | 600 | 1.3 |
| h3 (card title) | 18px / 1.125rem | 600 | 1.4 |
| Body | 16px / 1rem | 400 | 1.5 |
| Small / caption | 14px / 0.875rem | 400 | 1.4 |
| Tiny / label | 12px / 0.75rem | 500 | 1.3 |

### Responsive Breakpoints

Mobile-first approach. Breakpoints follow Tailwind's defaults:

| Breakpoint | Min Width | Target |
|-----------|-----------|--------|
| `sm` | 640px | Large phones |
| `md` | 768px | Tablets |
| `lg` | 1024px | Small laptops |
| `xl` | 1280px | Desktops |
| `2xl` | 1536px | Large displays |

**Key responsive behaviors**:
- **Sidebar**: Visible at `lg+`. Hidden with hamburger toggle below `lg`. On mobile, sidebar slides in as an overlay.
- **Queue layout**: Two-column (list + preview) at `lg+`. Single-column with drawer preview below `lg`.
- **Calendar**: Month view at `md+`. Week view forced below `md`.
- **Post editor**: Side-by-side (editor + preview) at `xl+`. Tabbed view below `xl`.

### Dark Mode

Implemented via `next-themes`. All colors use CSS custom properties that are swapped on `[data-theme="dark"]`:

```css
[data-theme="dark"] {
  --color-bg: #0F172A;
  --color-bg-secondary: #1E293B;
  --color-border: #334155;
  --color-text: #F1F5F9;
  --color-text-secondary: #94A3B8;
  --color-text-muted: #64748B;
  --color-primary-light: #1E3A5F;
  --color-success-light: #064E3B;
  --color-accent-light: #2E1065;
  --color-danger-light: #450A0A;
  --color-warning-light: #451A03;
}
```

### Spacing Scale

Tailwind's default scale is used. Key conventions:
- Card padding: `p-4` (16px) on mobile, `p-6` (24px) on desktop.
- Section gap: `gap-6` (24px).
- Page margin: `px-4` on mobile, `px-8` on desktop.
- Component spacing: `space-y-4` for stacked elements.

### Shadows and Borders

- Card: `border border-[--color-border] rounded-lg shadow-sm`.
- Elevated card (modals, dropdowns): `shadow-lg ring-1 ring-black/5`.
- Focus ring: `focus-visible:ring-2 ring-[--color-primary]`.

---

## 8. LinkedIn Post Preview Component

The `PostPreview` component renders a pixel-accurate representation of how a post will look on LinkedIn. This is the most important UI component -- users need to see exactly what their audience will see.

### Specifications

```
Max width: 552px (LinkedIn's feed width)
Background: white card with subtle border
Border radius: 8px
Padding: 16px
```

### Component Structure

```
┌─────────────────────────────────────────────────────────────┐
│  [Avatar]  Name                                    [...]    │
│            Headline                                         │
│            Xh ago • [globe icon]                           │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  Post text content here. This is the first few lines       │
│  that are visible before truncation.                        │
│                                                             │
│  ...see more                                                │
│                                                             │
│  #hashtag1 #hashtag2 #hashtag3                              │
│                                                             │
├─────────────────────────────────────────────────────────────┤
│  [image attachment area - if applicable]                     │
├─────────────────────────────────────────────────────────────┤
│  [like-icon] 12    [comment-icon] 3 comments                │
├─────────────────────────────────────────────────────────────┤
│  [Like]    [Comment]    [Repost]    [Send]                  │
└─────────────────────────────────────────────────────────────┘
```

### Key Rendering Rules

**Avatar and header**:
- Avatar: 48x48px rounded circle.
- Name: 14px, weight 600, `color: --color-text`.
- Headline: 12px, weight 400, `color: --color-text-secondary`. Truncate at 1 line.
- Time: "Xh ago" format. Globe icon for public visibility.
- Three-dot menu icon (non-functional in preview, just visual accuracy).

**Post text**:
- Font: 14px, weight 400, line-height 1.4.
- White space: `pre-wrap` (preserves the author's line breaks exactly).
- "see more" truncation: LinkedIn truncates after approximately 3 lines (~210 characters). Text beyond the truncation point is hidden with a "...see more" link. In the preview, clicking "see more" toggles the full text.
- Hashtags: Rendered in `color: --color-primary` (LinkedIn blue). Clickable appearance but no actual navigation.

**Hashtag highlighting**:
```typescript
function renderPostText(text: string): ReactNode {
  // Split text into segments: regular text and hashtags
  const parts = text.split(/(#\w+)/g);
  return parts.map((part, i) =>
    part.startsWith('#')
      ? <span key={i} className="text-[--color-primary] hover:underline cursor-pointer">{part}</span>
      : <span key={i}>{part}</span>
  );
}
```

**Reaction bar**:
- Shows reaction icons (like, celebrate, support) with a count.
- Shows "X comments" text.
- In preview: uses placeholder or actual analytics data if available.

**Action row**:
- Four buttons: Like, Comment, Repost, Send.
- Each with an icon and label.
- Non-functional in preview (visual accuracy only).

**Media rendering**:
- Image: Renders below the text, full-width within the card. Maintains aspect ratio.
- Carousel: Shows first slide with left/right arrows. Slide counter (1/8).
- Poll: Renders poll options as rounded bars with percentage labels.

### Component Props

```typescript
interface PostPreviewProps {
  content: string;
  hashtags?: string[];
  mediaUrl?: string | null;
  mediaType?: 'image' | 'carousel' | 'poll' | null;
  carouselSlides?: CarouselSlide[];
  pollOptions?: PollOption[];
  userName: string;
  userAvatar: string;
  userHeadline: string;
  publishedAt?: string;         // ISO date, or null for "Just now"
  reactions?: number;
  comments?: number;
  reposts?: number;
  truncated?: boolean;          // default true: show "see more"
  className?: string;
}
```

---

## 9. Key UX Flows

### Flow 1: Onboarding Wizard

```
User signs up
  → Redirect to /onboarding/welcome
  → Fill in name, role, industry → Next
  → /onboarding/questionnaire
  → Answer 6-8 voice preference questions → Next
  → /onboarding/linkedin
  → Click "Connect LinkedIn" → OAuth popup → returns with tokens
  → /onboarding/voice-review
  → Loading state (voice analysis runs in background, 15-30 seconds)
  → Voice profile displayed → User reviews, tweaks if needed → Confirm
  → /onboarding/pillars
  → System suggests 3-5 pillars based on questionnaire → User adjusts → Confirm
  → Redirect to /dashboard
  → First batch of posts generates in background
  → Notification: "Your first posts are ready for review!"
```

**Key UX considerations**:
- Progress is saved after each step. User can close and resume.
- Voice analysis loading shows a branded animation with progress messages ("Analyzing your writing style...", "Identifying your tone...", "Building your voice profile...").
- If LinkedIn OAuth fails, offer "Paste your posts" fallback.

### Flow 2: Daily Review

```
User receives email: "3 posts ready for review"
  → Clicks link → /queue
  → Queue shows 3 posts with LinkedIn previews
  → Reads first post → Looks good → Presses "A" (keyboard shortcut)
    → Post approved with animation → advances to next post
  → Reads second post → Wants a change → Presses "E"
    → Editor opens → makes edit → "Save & Approve"
  → Reads third post → Not great → Presses "R"
    → Regenerate dialog opens → types "Make it more personal" → Submit
    → Loading spinner → new post appears → Approves
  → Queue empty → "All caught up! Your posts will publish on schedule."
```

**Key UX considerations**:
- Keyboard shortcuts displayed in a subtle hint bar at the bottom.
- Transitions between posts are animated (slide or fade).
- Approve shows a brief green checkmark animation.
- Queue count badge updates in the sidebar as posts are processed.

### Flow 3: Quick Edit

```
User views a post in the queue
  → Clicks "Edit"
  → Split view: Tiptap editor (left) + LinkedIn preview (right)
  → Preview updates in real-time as user types
  → Word counter shows current count vs. target range
  → User finishes editing → "Save & Approve"
  → Post approved and scheduled
```

**Key UX considerations**:
- Real-time preview updates create a satisfying WYSIWYG feel.
- Word counter turns red if outside the voice profile's target range.
- "Unsaved changes" warning if user tries to navigate away.

### Flow 4: Regenerate With Feedback

```
User views a post → Clicks "Regenerate"
  → Dialog opens:
    "What should be different?"
    [Text input with placeholder: "e.g., Make it shorter, more personal, use a question hook"]
    [ ] Keep the hook
    [ ] Keep the CTA
    [Cancel] [Regenerate]
  → User types feedback → Clicks Regenerate
  → Post card shows loading skeleton
  → New post appears (1-3 seconds)
  → User reviews → Approves or regenerates again (max 3 total)
  → After 3 regenerations: "You've reached the regeneration limit. Edit manually or skip."
```

**Key UX considerations**:
- Feedback input is optional. Blank feedback means "try again with no guidance."
- Regeneration counter shown: "Regeneration 2/3."
- Previous version is accessible via a "View previous" link.

### Flow 5: Calendar Interaction

```
User opens /calendar
  → Month view shows posts as colored pills on each day
  → Clicks on a day → Expands to show post details
  → Drags a post from Wednesday to Thursday
    → @dnd-kit handles the animation
    → Post's scheduled_at updated
    → Optimistic update; server confirmed in background
  → Clicks an empty slot on Friday → "Generate Post" button
    → Dialog: Select pillar + format
    → Submit → generates post → appears on calendar
  → Toggles to week view for more detail
```

**Key UX considerations**:
- Drag-and-drop provides visual feedback (ghost element follows cursor).
- Drop targets highlight when a valid drop is hovering.
- Past days are grayed out and not drop targets.
- Published posts show a green checkmark; drafts show an orange dot.

---

## 10. Implementation Phases

Aligned with the MVP timeline from the PRD (8-10 weeks).

### Phase 1: Foundation (Week 1-2)

- [ ] Next.js 15 project setup with App Router.
- [ ] Tailwind CSS 4 + shadcn/ui installation and theme configuration.
- [ ] Root layout with providers (TanStack Query, tRPC, Zustand, next-themes).
- [ ] (marketing) route group: Landing page (hero section minimum), pricing page skeleton.
- [ ] (auth) route group: Login and signup pages with Clerk components.
- [ ] (app) route group: AppShell layout (sidebar, header, mobile nav).
- [ ] Dashboard page (placeholder content).
- [ ] tRPC client setup and connection to backend.
- [ ] Basic responsive design and dark mode toggle.

### Phase 2: Onboarding and Voice (Week 3-4)

- [ ] Onboarding wizard: all 5 steps with forms and validation.
- [ ] LinkedIn OAuth flow integration (callback route).
- [ ] Voice profile review UI (VoiceProfileCard, VoiceProfileEditor).
- [ ] Loading states and animations for voice analysis.
- [ ] Content pillars setup page (/settings/pillars).
- [ ] Posting schedule configuration page (/settings/schedule).

### Phase 3: Content and Review (Week 5-6)

- [ ] Review queue page with full functionality (approve, edit, skip, regenerate).
- [ ] PostPreview component (LinkedIn-accurate).
- [ ] PostEditor with Tiptap integration and real-time preview.
- [ ] RegenerateDialog with feedback input.
- [ ] Content calendar with month/week views.
- [ ] Drag-and-drop for calendar rescheduling.
- [ ] Keyboard shortcuts for queue review.
- [ ] Optimistic updates for all queue actions.
- [ ] Bulk actions (select, bulk approve, bulk skip).

### Phase 4: Publishing and Analytics (Week 7-8)

- [ ] LinkedIn settings page (connection status, token health).
- [ ] Post status tracking (draft, approved, scheduled, published, failed).
- [ ] PostStatusBadge component.
- [ ] Analytics overview page with charts.
- [ ] Single post analytics page.
- [ ] OverviewCards, EngagementChart, PillarComparison, TopPostsTable.
- [ ] Billing page with Stripe integration.

### Phase 5: Polish and Launch (Week 9-10)

- [ ] Landing page completion (all sections, responsive, animations).
- [ ] Empty states for all pages (illustration + message + action).
- [ ] Error boundaries and error states.
- [ ] Loading skeletons for all data-dependent sections.
- [ ] Notification bell with in-app notifications list.
- [ ] Email notification preferences page.
- [ ] Performance audit (Core Web Vitals, Lighthouse).
- [ ] Accessibility audit (keyboard navigation, screen reader, color contrast).
- [ ] Mobile testing and responsive bug fixes.
- [ ] Beta launch preparation.
