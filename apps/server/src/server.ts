import './lib/sentry.js'; // Must be first — initializes Sentry before other imports
import express from 'express';
import { createExpressMiddleware } from '@trpc/server/adapters/express';
import { config } from './lib/config.js';
import { logger } from './lib/logger.js';
import { sentryErrorHandler } from './lib/sentry.js';
import { getRedis, closeRedis } from './lib/redis.js';
import { db, closeDb } from './db/client.js';
import { appRouter } from './trpc/routers/index.js';
import { createContext, setContextDeps } from './trpc/context.js';
import { registerWorkers, closeQueues } from './workers/index.js';
import { createHelmetMiddleware, createCorsMiddleware } from './middleware/security.js';
import { createGlobalLimiter, createAuthLimiter, createApiLimiter } from './middleware/rate-limiter.js';
import { createRequestLogger } from './middleware/request-logger.js';
import { createErrorHandler } from './middleware/error-handler.js';
import { registerShutdownHandlers } from './lib/shutdown.js';
import { createHealthRouter } from './routes/health.js';
import { createBullBoardRouter } from './routes/bull-board.js';
import { handleStripeWebhook } from './modules/billing/index.js';

// -- Express App --

const app: ReturnType<typeof express> = express();

// -- Trust proxy (required for rate limiting behind reverse proxy) --

app.set('trust proxy', 1);

// -- Security Headers (Helmet) --

app.use(createHelmetMiddleware());

// -- CORS --

app.use(createCorsMiddleware(config.NODE_ENV));

// -- Request Logger (pino-http with correlation ID) --

app.use(createRequestLogger(config.NODE_ENV));

// -- Global Rate Limiter --

const redis = getRedis();

app.use(createGlobalLimiter({ redis }));

// -- Raw body for webhooks (must come before express.json) --

app.use(
  '/webhooks/stripe',
  express.raw({ type: 'application/json' }),
);

// -- JSON body parser (1MB limit) --

app.use(express.json({ limit: '1mb' }));

// -- Health & Readiness Checks (before tRPC so they're always fast) --

app.use(createHealthRouter({ db, redis }));

// -- BullMQ Dashboard --

app.use(createBullBoardRouter(redis));

// -- Webhook Routes --

app.post('/webhooks/stripe', (req, res) => {
  handleStripeWebhook(req, res).catch((err: unknown) => {
    const message = err instanceof Error ? err.message : 'Unknown error';
    logger.error({ error: message }, 'Stripe webhook handler error');
    if (!res.headersSent) {
      res.status(500).json({ error: 'Webhook processing failed' });
    }
  });
});

app.post('/webhooks/linkedin', express.json(), (req, res) => {
  // TODO: handle LinkedIn webhook events (if registered)
  logger.info('LinkedIn webhook received');
  res.json({ received: true });
});

// -- Auth Rate Limiter (applied to auth-related tRPC procedures via path prefix) --

app.use('/trpc/auth.', createAuthLimiter({ redis }));

// -- API Rate Limiter (applied to all tRPC API calls) --

app.use('/trpc', createApiLimiter({ redis }));

// -- tRPC --

setContextDeps({ db, redis });

app.use(
  '/trpc',
  createExpressMiddleware({
    router: appRouter,
    createContext,
    onError({ error, path }) {
      logger.error(
        { path, code: error.code, message: error.message },
        'tRPC error',
      );
    },
  }),
);

// -- Sentry error handler (must be after routes, before 404/error handler) --

app.use(sentryErrorHandler);

// -- 404 --

app.use((_req, res) => {
  res.status(404).json({ success: false, data: null, error: 'Not found' });
});

// -- Global Error Handler (must be last middleware) --

app.use(createErrorHandler(config.NODE_ENV));

// -- Optional: Run Migrations on Startup --

async function runStartupMigrations(): Promise<void> {
  if (process.env['RUN_MIGRATIONS'] !== 'true') {
    return;
  }

  logger.info('RUN_MIGRATIONS=true — running database migrations on startup');

  const { migrate } = await import('drizzle-orm/node-postgres/migrator');
  const { resolve } = await import('node:path');
  const { fileURLToPath } = await import('node:url');

  const __filename = fileURLToPath(import.meta.url);
  const __dirname = resolve(__filename, '..');
  const migrationsFolder = resolve(__dirname, '../drizzle');

  try {
    await migrate(db, { migrationsFolder });
    logger.info('Startup migrations completed successfully');
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    logger.error({ error: message }, 'Startup migration failed');
    throw new Error(`Startup migration failed: ${message}`);
  }
}

await runStartupMigrations();

// -- Start Server --

const server = app.listen(config.PORT, () => {
  logger.info({ port: config.PORT, env: config.NODE_ENV }, 'Server started');
});

// -- Register BullMQ Workers --

const workers = registerWorkers(redis);

// -- Graceful Shutdown (10s grace period) --

registerShutdownHandlers({
  server,
  workers,
  closeQueues,
  closeRedis,
  closeDb,
});

process.on('unhandledRejection', (reason) => {
  logger.error({ reason: String(reason) }, 'Unhandled promise rejection');
});

process.on('uncaughtException', (error) => {
  logger.error({ error: error.message, stack: error.stack }, 'Uncaught exception');
  process.exit(1);
});

export { app, appRouter };
export type { AppRouter } from './trpc/routers/index.js';
