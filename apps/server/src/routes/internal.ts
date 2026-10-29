import { Router } from 'express';
import { z } from 'zod';
import { eq } from 'drizzle-orm';
import type { Redis } from 'ioredis';
import type { Database } from '../db/client.js';
import { users } from '../db/schema/users.js';
import { linkedinOauthTokens } from '../db/schema/oauth-tokens.js';
import { encryptToken } from '../modules/auth/token-encryption.js';
import { logger } from '../lib/logger.js';

const PROXY_SECRET = process.env['PROXY_SECRET'] ?? 'dev-proxy-secret';

export interface InternalDeps {
  readonly db: Database;
  readonly redis: Redis;
}

/**
 * Payload sent by the Next.js NextAuth jwt callback whenever a user signs in
 * with LinkedIn. Populates the users row with LinkedIn identity and stores
 * encrypted OAuth tokens so publishing can use them immediately — no
 * separate "Connect LinkedIn" click required.
 */
const linkedinSyncSchema = z.object({
  email: z.string().email(),
  name: z.string().min(1),
  linkedinSub: z.string().min(1),
  picture: z.string().url().nullable().optional(),
  accessToken: z.string().min(1),
  refreshToken: z.string().nullable().optional(),
  expiresIn: z.number().int().positive(),
  refreshExpiresIn: z.number().int().positive().nullable().optional(),
  scope: z.string().default(''),
});

export function createInternalRouter({ db }: InternalDeps): Router {
  const router = Router();

  /**
   * Persist LinkedIn identity + encrypted tokens obtained via NextAuth.
   * Authenticated purely by the shared proxy secret — never exposed publicly.
   */
  router.post('/internal/linkedin-sync', (req, res) => {
    void (async () => {
      const proxySecret = req.headers['x-proxy-secret'];
      if (proxySecret !== PROXY_SECRET) {
        res.status(401).json({ error: 'Invalid proxy secret' });
        return;
      }

      const parseResult = linkedinSyncSchema.safeParse(req.body);
      if (!parseResult.success) {
        logger.warn(
          { errors: parseResult.error.flatten() },
          'linkedin-sync: invalid payload',
        );
        res.status(400).json({ error: 'Invalid payload' });
        return;
      }

      const payload = parseResult.data;

      try {
        // 1. Upsert the user row keyed by email, attaching LinkedIn identity.
        const [existing] = await db
          .select({ id: users.id })
          .from(users)
          .where(eq(users.email, payload.email))
          .limit(1);

        let userId: number;
        if (existing) {
          userId = existing.id;
          await db
            .update(users)
            .set({
              name: payload.name,
              linkedinId: payload.linkedinSub,
              avatarUrl: payload.picture ?? undefined,
              updatedAt: new Date(),
            })
            .where(eq(users.id, userId));
        } else {
          const [inserted] = await db
            .insert(users)
            .values({
              email: payload.email,
              name: payload.name,
              linkedinId: payload.linkedinSub,
              avatarUrl: payload.picture ?? undefined,
            })
            .returning({ id: users.id });
          if (!inserted) {
            throw new Error('Failed to insert user row');
          }
          userId = inserted.id;
        }

        // 2. Encrypt tokens and upsert the token row.
        const accessTokenEnc = await encryptToken(payload.accessToken);
        const refreshTokenEnc = payload.refreshToken
          ? await encryptToken(payload.refreshToken)
          : null;

        const expiresAt = new Date(Date.now() + payload.expiresIn * 1000);
        const refreshExpiresAt = payload.refreshExpiresIn
          ? new Date(Date.now() + payload.refreshExpiresIn * 1000)
          : null;
        const scopes = payload.scope.split(' ').filter(Boolean);

        const [existingToken] = await db
          .select({ id: linkedinOauthTokens.id })
          .from(linkedinOauthTokens)
          .where(eq(linkedinOauthTokens.userId, userId))
          .limit(1);

        if (existingToken) {
          await db
            .update(linkedinOauthTokens)
            .set({
              accessTokenEnc,
              refreshTokenEnc,
              scopes,
              expiresAt,
              refreshExpiresAt,
              issuedAt: new Date(),
              lastRefreshedAt: null,
              refreshFailureCount: 0,
              updatedAt: new Date(),
            })
            .where(eq(linkedinOauthTokens.userId, userId));
        } else {
          await db.insert(linkedinOauthTokens).values({
            userId,
            accessTokenEnc,
            refreshTokenEnc,
            scopes,
            expiresAt,
            refreshExpiresAt,
          });
        }

        logger.info(
          { userId, linkedinSub: payload.linkedinSub },
          'LinkedIn identity synced from NextAuth sign-in',
        );

        res.json({ success: true });
      } catch (error: unknown) {
        const message = error instanceof Error ? error.message : 'Unknown error';
        logger.error(
          { email: payload.email, error: message },
          'linkedin-sync failed',
        );
        res.status(500).json({ error: 'Failed to sync LinkedIn identity' });
      }
    })();
  });

  return router;
}
