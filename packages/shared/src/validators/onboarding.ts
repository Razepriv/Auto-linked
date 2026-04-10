// ---------------------------------------------------------------------------
// Onboarding step Zod validation schemas
// ---------------------------------------------------------------------------

import { z } from 'zod';

// ---- Step 1: Questionnaire -------------------------------------------------

export const questionnaireSchema = z.object({
  /** What industry / niche does the user operate in? */
  industry: z
    .string()
    .min(1, 'Industry is required')
    .max(100, 'Industry must be at most 100 characters'),
  /** The user's current job title / role. */
  jobTitle: z
    .string()
    .min(1, 'Job title is required')
    .max(100, 'Job title must be at most 100 characters'),
  /** What is their primary goal on LinkedIn? */
  linkedinGoal: z.enum([
    'thought_leadership',
    'lead_generation',
    'personal_branding',
    'hiring',
    'networking',
    'other',
  ]),
  /** Free-text elaboration on their goal. */
  goalDescription: z
    .string()
    .max(500, 'Goal description must be at most 500 characters')
    .default(''),
  /** Target audience description. */
  targetAudience: z
    .string()
    .min(1, 'Target audience is required')
    .max(300, 'Target audience must be at most 300 characters'),
  /** How frequently they currently post (self-reported). */
  currentPostingFrequency: z.enum([
    'never',
    'rarely',
    'monthly',
    'weekly',
    'daily',
  ]),
  /** Topics they are comfortable writing about. */
  comfortTopics: z
    .array(z.string().min(1).max(100))
    .min(1, 'Select at least one topic')
    .max(10, 'At most 10 topics'),
});

export type QuestionnaireInput = z.infer<typeof questionnaireSchema>;

// ---- Step 2: Pillars -------------------------------------------------------

export const pillarsStepSchema = z.object({
  /** At least 2 content pillars are required to proceed. */
  pillars: z
    .array(
      z.object({
        name: z.string().min(1, 'Pillar name is required').max(60),
        description: z.string().min(1, 'Description is required').max(500),
        targetPercentage: z.number().int().min(0).max(100),
      }),
    )
    .min(2, 'At least 2 content pillars are required')
    .max(8, 'At most 8 content pillars'),
});

export type PillarsStepInput = z.infer<typeof pillarsStepSchema>;

// ---- Step 3: LinkedIn connection -------------------------------------------

export const linkedinStepSchema = z.object({
  /** OAuth authorization code from LinkedIn redirect. */
  authorizationCode: z.string().min(1, 'Authorization code is required'),
  /** The redirect URI used during the OAuth flow. */
  redirectUri: z.string().url('Invalid redirect URI'),
});

export type LinkedInStepInput = z.infer<typeof linkedinStepSchema>;

// ---- Step 4: Analysis (voice profile generation) ---------------------------
// This step is triggered server-side; the client only signals readiness.

export const analysisStepSchema = z.object({
  /** Whether the user wants to include their existing posts in analysis. */
  analyzeExistingPosts: z.boolean().default(true),
  /** Optionally paste sample posts if they have few existing ones. */
  samplePosts: z
    .array(z.string().min(10, 'Sample post must be at least 10 characters').max(3000))
    .max(10, 'At most 10 sample posts')
    .default([]),
});

export type AnalysisStepInput = z.infer<typeof analysisStepSchema>;

// ---- Step 5: Schedule setup ------------------------------------------------

export const scheduleStepSchema = z.object({
  /** Preferred posting timezone (IANA format). */
  timezone: z.string().min(1, 'Timezone is required'),
  /** Preferred posting days (0 = Sunday, 6 = Saturday). */
  postingDays: z
    .array(z.number().int().min(0).max(6))
    .min(1, 'Select at least one posting day')
    .max(7),
  /** Preferred posting times (HH:mm format in the user's timezone). */
  postingTimes: z
    .array(
      z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Time must be in HH:mm format'),
    )
    .min(1, 'Select at least one posting time')
    .max(5, 'At most 5 posting times per day'),
  /** Number of posts per week the user wants to target. */
  postsPerWeek: z
    .number()
    .int('Must be a whole number')
    .min(1, 'At least 1 post per week')
    .max(21, 'At most 21 posts per week'),
});

export type ScheduleStepInput = z.infer<typeof scheduleStepSchema>;

// ---- Union type for any onboarding step ------------------------------------

export const onboardingStepDataSchema = z.discriminatedUnion('step', [
  z.object({ step: z.literal('questionnaire'), data: questionnaireSchema }),
  z.object({ step: z.literal('pillars'), data: pillarsStepSchema }),
  z.object({ step: z.literal('linkedin'), data: linkedinStepSchema }),
  z.object({ step: z.literal('analysis'), data: analysisStepSchema }),
  z.object({ step: z.literal('schedule'), data: scheduleStepSchema }),
]);

export type OnboardingStepData = z.infer<typeof onboardingStepDataSchema>;
