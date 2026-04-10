import { Router } from 'express';
import { sql } from 'drizzle-orm';
import type { Redis } from 'ioredis';
import type { Database } from '../db/client.js';
import { logger } from '../lib/logger.js';

export interface HealthDeps {
  readonly db: Database;
  readonly redis: Redis;
}

export function createHealthRouter({ db, redis }: HealthDeps): Router {
  const router = Router();

  /** Simple liveness probe for load balancers. */
  router.get('/health', (_req, res) => {
    res.json({
      status: 'ok',
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
    });
  });

  /** Readiness probe — checks DB + Redis connectivity. */
  router.get('/ready', async (_req, res) => {
    const checks: Record<string, 'ok' | 'error'> = {
      database: 'error',
      redis: 'error',
    };

    // Check database
    try {
      await db.execute(sql`SELECT 1`);
      checks['database'] = 'ok';
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      logger.error({ err: message }, 'Readiness: database check failed');
    }

    // Check Redis
    try {
      const pong = await redis.ping();
      if (pong === 'PONG') {
        checks['redis'] = 'ok';
      }
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      logger.error({ err: message }, 'Readiness: redis check failed');
    }

    const allHealthy = Object.values(checks).every((v) => v === 'ok');

    res.status(allHealthy ? 200 : 503).json({
      status: allHealthy ? 'ready' : 'degraded',
      checks,
      timestamp: new Date().toISOString(),
    });
  });

  return router;
}
