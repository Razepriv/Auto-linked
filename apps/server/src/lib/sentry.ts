import * as Sentry from '@sentry/node';
import type { Request, Response, NextFunction } from 'express';
import { logger } from './logger.js';

const dsn = process.env['SENTRY_DSN'];

if (dsn) {
  Sentry.init({
    dsn,
    environment: process.env['NODE_ENV'] ?? 'development',
    tracesSampleRate: process.env['NODE_ENV'] === 'production' ? 0.2 : 1.0,
    beforeSend(event) {
      // Strip sensitive data from event
      if (event.request?.cookies) {
        event.request.cookies = {};
      }
      return event;
    },
  });

  logger.info('Sentry initialized');
} else {
  logger.warn('SENTRY_DSN not set — Sentry error tracking disabled');
}

/** Tag the current Sentry scope with request context. */
export function setSentryContext(data: { userId?: string; requestId?: string }): void {
  if (!dsn) return;

  if (data.userId) {
    Sentry.setUser({ id: data.userId });
  }
  if (data.requestId) {
    Sentry.setTag('requestId', data.requestId);
  }
}

/** Express error handler that reports to Sentry, then passes to next handler. */
export function sentryErrorHandler(
  err: Error,
  _req: Request,
  _res: Response,
  next: NextFunction,
): void {
  if (dsn) {
    Sentry.captureException(err);
  }
  next(err);
}

export { Sentry };
