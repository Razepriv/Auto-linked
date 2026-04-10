import 'dotenv/config';
import { drizzle } from 'drizzle-orm/node-postgres';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import pg from 'pg';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function runMigrations(): Promise<void> {
  const databaseUrl = process.env['DATABASE_URL'];

  if (!databaseUrl) {
    throw new Error('DATABASE_URL environment variable is required');
  }

  const pool = new pg.Pool({
    connectionString: databaseUrl,
    max: 1,
  });

  const db = drizzle(pool);

  const migrationsFolder = path.resolve(__dirname, '../../drizzle');

  console.info(`Running migrations from ${migrationsFolder}...`);

  try {
    await migrate(db, { migrationsFolder });
    console.info('Migrations completed successfully.');
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`Migration failed: ${message}`);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

runMigrations().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`Unexpected migration error: ${message}`);
  process.exit(1);
});
