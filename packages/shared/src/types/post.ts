// ---------------------------------------------------------------------------
// Post domain types
// ---------------------------------------------------------------------------

/** Lifecycle status of a LinkedIn post. */
export type PostStatus =
  | 'draft'
  | 'approved'
  | 'scheduled'
  | 'publishing'
  | 'published'
  | 'failed'
  | 'skipped';

/** Visual format of a LinkedIn post. */
export type PostFormat = 'text' | 'image' | 'carousel' | 'poll';

/** Core post entity. All dates are ISO-8601 strings. */
export interface Post {
  readonly id: string;
  readonly userId: string;
  readonly pillarId: string | null;
  readonly content: string;
  readonly hook: string | null;
  readonly hashtags: readonly string[];
  readonly format: PostFormat;
  readonly mediaUrl: string | null;
  readonly status: PostStatus;
  readonly strategyNote: string | null;
  readonly scheduledAt: string | null;
  readonly publishedAt: string | null;
  readonly linkedinPostId: string | null;
  readonly version: number;
  readonly qualityScore: number | null;
  readonly createdAt: string;
  readonly updatedAt: string;
}

// PostCreateInput and PostUpdateInput are defined in validators/post.ts via Zod inference.
// Import them from the validators module to avoid duplication.

/** All valid post statuses as an array. */
export const POST_STATUSES: readonly PostStatus[] = [
  'draft',
  'approved',
  'scheduled',
  'publishing',
  'published',
  'failed',
  'skipped',
] as const;

/** All valid post formats as an array. */
export const POST_FORMATS: readonly PostFormat[] = [
  'text',
  'image',
  'carousel',
  'poll',
] as const;
