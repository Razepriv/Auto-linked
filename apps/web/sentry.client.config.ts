import * as Sentry from '@sentry/nextjs';

Sentry.init({
  dsn: process.env['NEXT_PUBLIC_SENTRY_DSN'],

  // Only enable when DSN is configured
  enabled: Boolean(process.env['NEXT_PUBLIC_SENTRY_DSN']),

  // Performance monitoring
  tracesSampleRate: process.env['NODE_ENV'] === 'production' ? 0.2 : 1.0,

  // Session replay for debugging production issues
  replaysSessionSampleRate: 0.1,
  replaysOnErrorSampleRate: 1.0,

  integrations: [
    Sentry.replayIntegration(),
  ],

  // Scrub sensitive data before sending
  beforeSend(event) {
    if (event.request?.cookies) {
      event.request.cookies = {};
    }
    return event;
  },
});
