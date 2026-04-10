// ---------------------------------------------------------------------------
// Plan limits and feature gates
// ---------------------------------------------------------------------------

import type { Plan } from '../types/user.js';

/** Feature limits for each subscription plan. */
export interface PlanLimits {
  readonly postsPerWeek: number;
  readonly imagesPerMonth: number;
  readonly carouselsPerMonth: number;
  readonly analytics: boolean;
  readonly teamMembers: number;
}

export const PLAN_LIMITS: Readonly<Record<Plan, PlanLimits>> = {
  free: {
    postsPerWeek: 3,
    imagesPerMonth: 0,
    carouselsPerMonth: 0,
    analytics: false,
    teamMembers: 1,
  },
  pro: {
    postsPerWeek: Infinity,
    imagesPerMonth: 10,
    carouselsPerMonth: 10,
    analytics: true,
    teamMembers: 1,
  },
  team: {
    postsPerWeek: Infinity,
    imagesPerMonth: 50,
    carouselsPerMonth: 50,
    analytics: true,
    teamMembers: 5,
  },
  'self-hosted': {
    postsPerWeek: Infinity,
    imagesPerMonth: Infinity,
    carouselsPerMonth: Infinity,
    analytics: true,
    teamMembers: Infinity,
  },
} as const;

/** Display names for plans (UI labels). */
export const PLAN_DISPLAY_NAMES: Readonly<Record<Plan, string>> = {
  free: 'Free',
  pro: 'Pro',
  team: 'Team',
  'self-hosted': 'Self-Hosted',
} as const;

/** Whether billing/payments are enabled. False in self-hosted mode. */
export function isBillingEnabled(): boolean {
  return !isSelfHosted();
}

/** Whether this instance is running in self-hosted mode. */
export function isSelfHosted(): boolean {
  return process.env['SELF_HOSTED'] === 'true';
}

/** Check whether a given plan has access to a feature. */
export function getPlanLimits(plan: Plan): PlanLimits {
  return PLAN_LIMITS[plan];
}

/** Check if a plan supports analytics. */
export function hasAnalytics(plan: Plan): boolean {
  return PLAN_LIMITS[plan].analytics;
}
