import { initTRPC, TRPCError } from '@trpc/server';
import { z } from 'zod';
import type { Context } from './context.js';
import { logger } from '../lib/logger.js';

const t = initTRPC.context<Context>().create({
  errorFormatter({ shape, error }) {
    return {
      ...shape,
      data: {
        ...shape.data,
        zodError:
          error.cause instanceof z.ZodError ? error.cause.flatten() : null,
      },
    };
  },
});

// -- Middleware --

const loggerMiddleware = t.middleware(async ({ path, type, ctx, next }) => {
  const start = Date.now();

  const result = await next();

  const durationMs = Date.now() - start;
  const meta = {
    path,
    type,
    durationMs,
    requestId: ctx.requestId,
    userId: ctx.user?.id ?? null,
  };

  if (result.ok) {
    logger.info(meta, 'tRPC request completed');
  } else {
    logger.error({ ...meta, error: result.error.message }, 'tRPC request failed');
  }

  return result;
});

const authMiddleware = t.middleware(async ({ ctx, next }) => {
  if (!ctx.user) {
    throw new TRPCError({
      code: 'UNAUTHORIZED',
      message: 'Authentication required',
    });
  }

  return next({
    ctx: {
      ...ctx,
      user: ctx.user,
    },
  });
});

const rateLimitMiddleware = t.middleware(async ({ ctx, path, next }) => {
  const key = ctx.user
    ? `ratelimit:user:${ctx.user.id}:${path}`
    : `ratelimit:anon:${ctx.requestId}:${path}`;

  const windowSeconds = 60;
  const maxRequests = ctx.user ? 100 : 20;

  const current = await ctx.redis.incr(key);
  if (current === 1) {
    await ctx.redis.expire(key, windowSeconds);
  }

  if (current > maxRequests) {
    throw new TRPCError({
      code: 'TOO_MANY_REQUESTS',
      message: `Rate limit exceeded. Max ${maxRequests} requests per ${windowSeconds}s.`,
    });
  }

  return next();
});

// -- Routers & Procedures --

export const router = t.router;
export const mergeRouters = t.mergeRouters;

export const publicProcedure = t.procedure
  .use(loggerMiddleware)
  .use(rateLimitMiddleware);

export const protectedProcedure = t.procedure
  .use(loggerMiddleware)
  .use(rateLimitMiddleware)
  .use(authMiddleware);
