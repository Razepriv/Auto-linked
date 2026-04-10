import { Router } from 'express';
import type { Request, Response, NextFunction } from 'express';
import { createBullBoard } from '@bull-board/api';
import { BullMQAdapter } from '@bull-board/api/bullMQAdapter';
import { ExpressAdapter } from '@bull-board/express';
import type { Redis } from 'ioredis';
import { QUEUE_NAMES, getQueue } from '../workers/index.js';
import { logger } from '../lib/logger.js';

/**
 * Basic-auth middleware protecting the dashboard.
 * Requires ADMIN_PASSWORD env var to be set; returns 403 otherwise.
 */
function basicAuth(req: Request, res: Response, next: NextFunction): void {
  const adminPassword = process.env['ADMIN_PASSWORD'];

  if (!adminPassword) {
    logger.warn('ADMIN_PASSWORD not set — bull-board access denied');
    res.status(403).json({ error: 'Dashboard disabled: ADMIN_PASSWORD not configured' });
    return;
  }

  const authHeader = req.headers['authorization'];
  if (!authHeader?.startsWith('Basic ')) {
    res.setHeader('WWW-Authenticate', 'Basic realm="Bull Board"');
    res.status(401).json({ error: 'Authentication required' });
    return;
  }

  const base64Credentials = authHeader.slice('Basic '.length);
  const decoded = Buffer.from(base64Credentials, 'base64').toString('utf-8');
  const [username, password] = decoded.split(':');

  if (username === 'admin' && password === adminPassword) {
    next();
    return;
  }

  res.setHeader('WWW-Authenticate', 'Basic realm="Bull Board"');
  res.status(401).json({ error: 'Invalid credentials' });
}

export function createBullBoardRouter(connection: Redis): Router {
  const router = Router();

  // Ensure all queues are instantiated so the dashboard can show them
  const queueNames = Object.values(QUEUE_NAMES);
  const queues = queueNames.map((name) => getQueue(name, connection));

  const serverAdapter = new ExpressAdapter();
  serverAdapter.setBasePath('/admin/queues');

  createBullBoard({
    queues: queues.map((q) => new BullMQAdapter(q)),
    serverAdapter,
  });

  router.use('/admin/queues', basicAuth, serverAdapter.getRouter());

  logger.info(
    { queues: queueNames },
    'Bull Board mounted at /admin/queues',
  );

  return router;
}
