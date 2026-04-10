import * as Sentry from '@sentry/nextjs';

Sentry.init({
  dsn: process.env['SENTRY_DSN'],

  // Only enable when DSN is configured
  enabled: Boolean(process.env['SENTRY_DSN']),

  // Performance monitoring
  tracesSampleRate: process.env['NODE_ENV'] === 'production' ? 0.2 : 1.0,
});
