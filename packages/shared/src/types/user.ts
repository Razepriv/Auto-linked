// ---------------------------------------------------------------------------
// User domain types
// ---------------------------------------------------------------------------

/** Onboarding flow steps in sequential order. */
export type OnboardingStep =
  | 'questionnaire'
  | 'pillars'
  | 'linkedin'
  | 'analysis'
  | 'schedule'
  | 'complete';

/** Available subscription plans. */
export type Plan = 'free' | 'pro' | 'team' | 'self-hosted';

/** Core user entity returned by the API. All dates are ISO-8601 strings. */
export interface User {
  readonly id: string;
  readonly email: string;
  readonly name: string;
  readonly avatarUrl: string | null;
  readonly linkedinId: string | null;
  readonly onboardingStep: OnboardingStep;
  readonly plan: Plan;
  readonly timezone: string;
  readonly createdAt: string;
  readonly updatedAt: string;
}

/** Subset of User fields that can be updated by the user themselves. */
export interface UserUpdateInput {
  readonly name?: string;
  readonly avatarUrl?: string | null;
  readonly timezone?: string;
}

/** All valid onboarding steps as an ordered array (useful for progress bars). */
export const ONBOARDING_STEPS: readonly OnboardingStep[] = [
  'questionnaire',
  'pillars',
  'linkedin',
  'analysis',
  'schedule',
  'complete',
] as const;

/** All valid plan identifiers. */
export const PLANS: readonly Plan[] = ['free', 'pro', 'team', 'self-hosted'] as const;
