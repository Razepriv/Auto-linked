import { drizzle } from 'drizzle-orm/node-postgres';
import pg from 'pg';
import { config } from '../lib/config.js';
import { logger } from '../lib/logger.js';
import * as schema from './schema/index.js';

const pool = new pg.Pool({
  connectionString: config.DATABASE_URL,
  max: 20,
  idleTimeoutMillis: 30_000,
  connectionTimeoutMillis: 5_000,
});

pool.on('error', (err: Error) => {
  logger.error({ err: err.message }, 'Unexpected database pool error');
});

pool.on('connect', () => {
  logger.debug('New database connection established');
});

export const db = drizzle(pool, { schema });

export type Database = typeof db;

export async function closeDb(): Promise<void> {
  await pool.end();
  logger.info('Database pool closed');
}
