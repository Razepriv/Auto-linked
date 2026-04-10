import type { ErrorRequestHandler, Request, Response, NextFunction } from 'express';
import { logger } from '../lib/logger.js';
import type { ApiResponse } from '@auto-linked/shared';

// ---------------------------------------------------------------------------
// Global Express error handler
// ---------------------------------------------------------------------------

/**
 * Known operational error with an HTTP status code.
 * Throw this from route handlers for controlled error responses.
 */
export class AppError extends Error {
  readonly statusCode: number;
  readonly isOperational: boolean;

  constructor(message: string, statusCode: number = 500) {
    super(message);
    this.name = 'AppError';
    this.statusCode = statusCode;
    this.isOperational = true;
    // Maintain proper prototype chain
    Object.setPrototypeOf(this, AppError.prototype);
  }
}

/**
 * Determine the HTTP status code from an error.
 */
function getStatusCode(err: unknown): number {
  if (err instanceof AppError) {
    return err.statusCode;
  }
  // Express body-parser errors
  if (typeof err === 'object' && err !== null && 'status' in err) {
    const status = (err as { status: unknown }).status;
    if (typeof status === 'number' && status >= 400 && status < 600) {
      return status;
    }
  }
  return 500;
}

/**
 * Derive a safe, user-facing error message.
 * In production, 5xx errors get a generic message to avoid leaking internals.
 */
function getSafeMessage(err: unknown, statusCode: number, nodeEnv: string): string {
  if (err instanceof AppError) {
    return err.message;
  }

  if (statusCode < 500) {
    // 4xx errors are typically safe to surface
    if (err instanceof Error) {
      return err.message;
    }
    return 'Bad request';
  }

  // Never leak 5xx details in production
  if (nodeEnv === 'production') {
    return 'Internal server error';
  }

  // In development, surface the real message for debugging
  if (err instanceof Error) {
    return err.message;
  }
  return 'Internal server error';
}

/**
 * Global Express error-handling middleware.
 *
 * Must be registered AFTER all routes.
 * Express identifies error handlers by their 4-parameter signature.
 */
export function createErrorHandler(nodeEnv: string): ErrorRequestHandler {
  const handler: ErrorRequestHandler = (
    err: unknown,
    req: Request,
    res: Response,
    _next: NextFunction,
  ): void => {
    const statusCode = getStatusCode(err);
    const safeMessage = getSafeMessage(err, statusCode, nodeEnv);

    // Log full error details server-side
    const errorDetails: Record<string, unknown> = {
      method: req.method,
      url: req.originalUrl,
      statusCode,
      requestId: req.headers['x-request-id'] ?? 'unknown',
    };

    if (err instanceof Error) {
      errorDetails['error'] = err.message;
      errorDetails['stack'] = err.stack;
      errorDetails['name'] = err.name;
    } else {
      errorDetails['error'] = String(err);
    }

    if (statusCode >= 500) {
      logger.error(errorDetails, 'Unhandled server error');
    } else {
      logger.warn(errorDetails, 'Client error');
    }

    // Return consistent ApiResponse format
    const body: ApiResponse<null> = {
      success: false,
      data: null,
      error: safeMessage,
    };

    res.status(statusCode).json(body);
  };

  return handler;
}
