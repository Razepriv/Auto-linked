import type { CreateExpressContextOptions } from '@trpc/server/adapters/express';
import type { Database } from '../db/client.js';
import type { Redis } from 'ioredis';
import { eq } from 'drizzle-orm';
import { users } from '../db/schema/users.js';

export interface SessionUser {
  id: number;
  publicId: string;
  email: string;
  name: string;
  subscriptionTier: string;
}

export interface Context {
  db: Database;
  redis: Redis;
  user: SessionUser | null;
  requestId: string;
}

interface ContextDeps {
  db: Database;
  redis: Redis;
}

let contextDeps: ContextDeps | null = null;

export function setContextDeps(deps: ContextDeps): void {
  contextDeps = deps;
}

function generateRequestId(): string {
  return `req_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 9)}`;
}

const PROXY_SECRET = process.env['PROXY_SECRET'] ?? 'dev-proxy-secret';

/**
 * Extracts the authenticated user from trusted proxy headers.
 * The Next.js BFF proxy injects x-user-id/x-user-email after verifying
 * the NextAuth session, and signs the request with x-proxy-secret.
 */
async function getUserFromRequest(
  req: CreateExpressContextOptions['req'],
  db: Database,
): Promise<SessionUser | null> {
  const proxySecret = req.headers['x-proxy-secret'] as string | undefined;
  if (proxySecret !== PROXY_SECRET) {
    return null;
  }

  const userEmail = req.headers['x-user-email'] as string | undefined;
  if (!userEmail) {
    return null;
  }

  const result = await db
    .select({
      id: users.id,
      publicId: users.publicId,
      email: users.email,
      name: users.name,
      subscriptionTier: users.subscriptionTier,
    })
    .from(users)
    .where(eq(users.email, userEmail))
    .limit(1);

  if (result.length === 0) {
    return null;
  }

  return result[0] ?? null;
}

export async function createContext(
  opts: CreateExpressContextOptions,
): Promise<Context> {
  if (contextDeps === null) {
    throw new Error('Context dependencies not initialized. Call setContextDeps() first.');
  }

  const user = await getUserFromRequest(opts.req, contextDeps.db);

  return {
    db: contextDeps.db,
    redis: contextDeps.redis,
    user,
    requestId: generateRequestId(),
  };
}
