import { pinoHttp } from 'pino-http';
import pino from 'pino';
import crypto from 'node:crypto';
import type { RequestHandler, Request } from 'express';
import type { IncomingMessage, ServerResponse } from 'node:http';

// ---------------------------------------------------------------------------
// Request logger middleware (pino-http)
// ---------------------------------------------------------------------------

/**
 * Creates a pino-http middleware that:
 *  - Logs every request with method, url, status, and duration
 *  - Attaches / generates a correlation ID via X-Request-Id
 *  - Redacts authorization headers and body passwords
 */
export function createRequestLogger(nodeEnv: string): RequestHandler {
  const pinoLogger = pino({
    level: nodeEnv === 'production' ? 'info' : 'debug',
    redact: {
      paths: [
        'req.headers.authorization',
        'req.headers.cookie',
        'req.body.password',
        'req.body.currentPassword',
        'req.body.newPassword',
        'req.body.confirmPassword',
        'req.body.token',
        'req.body.refreshToken',
      ],
      censor: '[REDACTED]',
    },
  });

  const middleware = pinoHttp({
    logger: pinoLogger,
    genReqId: (req: IncomingMessage, _res: ServerResponse) => {
      const existing = req.headers['x-request-id'];
      if (typeof existing === 'string' && existing.length > 0) {
        return existing;
      }
      return crypto.randomUUID();
    },
    customSuccessMessage: (req: IncomingMessage, _res: ServerResponse) => {
      return `${(req as unknown as Request).method} ${(req as unknown as Request).originalUrl} completed`;
    },
    customErrorMessage: (req: IncomingMessage, _res: ServerResponse, _err: Error) => {
      return `${(req as unknown as Request).method} ${(req as unknown as Request).originalUrl} errored`;
    },
    customProps: (req: IncomingMessage) => {
      return {
        correlationId: req.id,
      };
    },
    // Don't log health-check noise
    autoLogging: {
      ignore: (req: IncomingMessage) => {
        return (req as unknown as Request).originalUrl === '/health';
      },
    },
    serializers: {
      req: pino.stdSerializers.req,
      res: pino.stdSerializers.res,
    },
  });

  return middleware as unknown as RequestHandler;
}
