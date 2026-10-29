import { router } from '../trpc.js';
import { authRouter } from './auth.js';
import { voiceRouter } from './voice.js';
import { pillarsRouter } from './pillars.js';
import { postsRouter } from './posts.js';
import { reviewRouter } from './review.js';
import { analyticsRouter } from './analytics.js';
import { billingRouter } from './billing.js';
import { onboardingRouter } from './onboarding.js';
import { settingsRouter } from './settings.js';

export const appRouter = router({
  auth: authRouter,
  voice: voiceRouter,
  pillars: pillarsRouter,
  posts: postsRouter,
  review: reviewRouter,
  analytics: analyticsRouter,
  billing: billingRouter,
  onboarding: onboardingRouter,
  settings: settingsRouter,
});

export type AppRouter = typeof appRouter;
