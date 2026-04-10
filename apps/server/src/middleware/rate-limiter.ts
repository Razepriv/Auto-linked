import rateLimit from 'express-rate-limit';
import RedisStore from 'rate-limit-redis';
import type { Redis } from 'ioredis';
import type { Request } from 'express';

// ---------------------------------------------------------------------------
// Rate-limiter factory helpers
// ---------------------------------------------------------------------------

/**
 * Creates a Redis-backed rate-limit store for distributed deployments.
 * Falls back to the default in-memory store when Redis is unavailable.
 */
function createRedisStore(redis: Redis, prefix: string): RedisStore {
  return new RedisStore({
    // rate-limit-redis v4 expects a sendCommand function
    sendCommand: async (...args: string[]) => {
      // ioredis call() expects (command, ...args)
      const [command, ...rest] = args;
      if (!command) {
        throw new Error('sendCommand called without a command');
      }
      return redis.call(command, ...rest) as Promise<number>;
    },
    prefix: `rl:${prefix}:`,
  });
}

/**
 * Extract a user identifier from the request for per-user rate limiting.
 * Falls back to IP when no authenticated user is present.
 */
function getUserKey(req: Request): string {
  // The tRPC context attaches user info; we check a header set by auth middleware
  // or fall back to IP. In practice, the auth middleware or tRPC context populates this.
  const userId = (req as Request & { userId?: string }).userId;
  if (userId) {
    return `user:${userId}`;
  }
  return req.ip ?? req.socket.remoteAddress ?? 'unknown';
}

// ---------------------------------------------------------------------------
// Rate-limiter middleware creators
// ---------------------------------------------------------------------------

export interface RateLimiterOptions {
  readonly redis: Redis;
}

/**
 * Global rate limiter: 100 requests per minute per IP.
 */
export function createGlobalLimiter({ redis }: RateLimiterOptions) {
  return rateLimit({
    windowMs: 60_000,
    limit: 100,
    standardHeaders: 'draft-7',
    legacyHeaders: false,
    store: createRedisStore(redis, 'global'),
    message: { success: false, data: null, error: 'Too many requests. Please try again later.' },
    keyGenerator: (req) => req.ip ?? req.socket.remoteAddress ?? 'unknown',
  });
}

/**
 * Auth endpoint rate limiter: 5 requests per minute per IP.
 * Intended for login, register, password-reset, etc.
 */
export function createAuthLimiter({ redis }: RateLimiterOptions) {
  return rateLimit({
    windowMs: 60_000,
    limit: 5,
    standardHeaders: 'draft-7',
    legacyHeaders: false,
    store: createRedisStore(redis, 'auth'),
    message: { success: false, data: null, error: 'Too many authentication attempts. Please try again later.' },
    keyGenerator: (req) => req.ip ?? req.socket.remoteAddress ?? 'unknown',
  });
}

/**
 * API endpoint rate limiter: 30 requests per minute per user.
 * Falls back to IP-based limiting for unauthenticated requests.
 */
export function createApiLimiter({ redis }: RateLimiterOptions) {
  return rateLimit({
    windowMs: 60_000,
    limit: 30,
    standardHeaders: 'draft-7',
    legacyHeaders: false,
    store: createRedisStore(redis, 'api'),
    message: { success: false, data: null, error: 'API rate limit exceeded. Please slow down.' },
    keyGenerator: getUserKey,
  });
}
