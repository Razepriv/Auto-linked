import type { Server } from 'node:http';
import type { Worker } from 'bullmq';
import { logger } from './logger.js';

// ---------------------------------------------------------------------------
// Graceful shutdown orchestrator
// ---------------------------------------------------------------------------

interface ShutdownDeps {
  readonly server: Server;
  readonly workers: readonly Worker[];
  readonly closeQueues: () => Promise<void>;
  readonly closeRedis: () => Promise<void>;
  readonly closeDb: () => Promise<void>;
}

const GRACE_PERIOD_MS = 10_000;

/**
 * Performs an orderly shutdown:
 *  1. Stop accepting new HTTP connections
 *  2. Close BullMQ workers (finish in-flight jobs)
 *  3. Close BullMQ queues
 *  4. Close Redis connection
 *  5. Close DB connection pool
 *
 * A 10-second grace period enforces a hard exit if any step hangs.
 */
async function performShutdown(signal: string, deps: ShutdownDeps): Promise<void> {
  logger.info({ signal }, 'Shutdown signal received');

  // Hard exit after grace period
  const forceExitTimer = setTimeout(() => {
    logger.error('Graceful shutdown timed out — forcing exit');
    process.exit(1);
  }, GRACE_PERIOD_MS);

  // Don't let the timer keep the process alive if everything closes in time
  forceExitTimer.unref();

  try {
    // 1. Stop accepting new connections
    await new Promise<void>((resolve, reject) => {
      deps.server.close((err) => {
        if (err) {
          reject(err);
        } else {
          resolve();
        }
      });
    });
    logger.info('HTTP server closed');

    // 2. Close workers
    const workerClosePromises = deps.workers.map((w) => w.close());
    await Promise.all(workerClosePromises);
    logger.info('All workers stopped');

    // 3. Close queues
    await deps.closeQueues();

    // 4. Close Redis
    await deps.closeRedis();

    // 5. Close DB pool
    await deps.closeDb();

    logger.info('Graceful shutdown complete');
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    logger.error({ error: message }, 'Error during graceful shutdown');
  } finally {
    clearTimeout(forceExitTimer);
    process.exit(0);
  }
}

/**
 * Register SIGTERM and SIGINT handlers that trigger graceful shutdown.
 *
 * Ensures the shutdown sequence only runs once even if multiple signals arrive.
 */
export function registerShutdownHandlers(deps: ShutdownDeps): void {
  let isShuttingDown = false;

  const handler = (signal: string) => {
    if (isShuttingDown) {
      logger.warn({ signal }, 'Shutdown already in progress, ignoring duplicate signal');
      return;
    }
    isShuttingDown = true;
    void performShutdown(signal, deps);
  };

  process.on('SIGTERM', () => handler('SIGTERM'));
  process.on('SIGINT', () => handler('SIGINT'));
}
