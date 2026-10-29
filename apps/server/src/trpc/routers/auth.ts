import { z } from 'zod';
import { eq } from 'drizzle-orm';
import { TRPCError } from '@trpc/server';
import { router, publicProcedure, protectedProcedure } from '../trpc.js';
import { users, linkedinOauthTokens } from '../../db/schema/index.js';
import { encryptToken, decryptToken } from '../../modules/auth/token-encryption.js';
import {
  getAuthorizationUrl,
  validateState,
  exchangeCodeForTokens,
  revokeToken,
  getProfile,
} from '../../modules/linkedin/index.js';
import { logger } from '../../lib/logger.js';

export const authRouter = router({
  /**
   * Sign up a new user account.
   */
  signup: publicProcedure
    .input(
      z.object({
        email: z.string().email(),
        name: z.string().min(1).max(200),
        timezone: z.string().default('UTC'),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      // TODO: implement user creation + session token generation
      throw new TRPCError({ code: 'NOT_IMPLEMENTED', message: 'signup not yet implemented' });
    }),

  /**
   * Log in with email (magic link or OAuth callback).
   */
  login: publicProcedure
    .input(
      z.object({
        email: z.string().email(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      // TODO: implement login flow (magic link send or OAuth)
      throw new TRPCError({ code: 'NOT_IMPLEMENTED', message: 'login not yet implemented' });
    }),

  /**
   * Get the currently authenticated user's profile.
   * Reads the live row from the DB (not the cached JWT context) so that
   * edits made via updateProfile or the LinkedIn OAuth callback show up
   * immediately.
   */
  me: protectedProcedure.query(async ({ ctx }) => {
    const [row] = await ctx.db
      .select({
        id: users.publicId,
        email: users.email,
        name: users.name,
        avatarUrl: users.avatarUrl,
        linkedinId: users.linkedinId,
        linkedinVanityUrl: users.linkedinVanityUrl,
        timezone: users.timezone,
        subscriptionTier: users.subscriptionTier,
        onboardingCompletedAt: users.onboardingCompletedAt,
        createdAt: users.createdAt,
      })
      .from(users)
      .where(eq(users.id, ctx.user.id))
      .limit(1);

    if (!row) {
      throw new TRPCError({
        code: 'NOT_FOUND',
        message: 'User profile not found.',
      });
    }

    return {
      ...row,
      linkedinConnected: row.linkedinId !== null,
    };
  }),

  /**
   * Update the current user's editable profile fields.
   * LinkedIn-sourced identity (linkedinId, avatarUrl) is intentionally
   * excluded — those only change via the OAuth callback.
   */
  updateProfile: protectedProcedure
    .input(
      z.object({
        name: z.string().min(1).max(200).optional(),
        timezone: z.string().min(1).max(64).optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const update: Record<string, unknown> = { updatedAt: new Date() };
      if (input.name !== undefined) update['name'] = input.name;
      if (input.timezone !== undefined) update['timezone'] = input.timezone;

      await ctx.db
        .update(users)
        .set(update)
        .where(eq(users.id, ctx.user.id));

      return { success: true };
    }),

  /**
   * Initiate LinkedIn OAuth connection.
   * Generates a PKCE-protected authorization URL, stores state in Redis,
   * and returns the URL for the client to open.
   */
  linkedinConnect: protectedProcedure
    .input(
      z.object({
        redirectUri: z.string().url().optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      try {
        const { url, state } = await getAuthorizationUrl(
          ctx.user.id,
          input.redirectUri,
        );

        logger.info(
          { userId: ctx.user.id, state },
          'LinkedIn OAuth flow initiated',
        );

        return { authorizationUrl: url, state };
      } catch (error: unknown) {
        const message = error instanceof Error ? error.message : 'Unknown error';
        logger.error(
          { userId: ctx.user.id, error: message },
          'Failed to generate LinkedIn auth URL',
        );
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: 'Failed to initiate LinkedIn connection. Please try again.',
        });
      }
    }),

  /**
   * Handle LinkedIn OAuth callback.
   * Validates the CSRF state, exchanges the authorization code for tokens,
   * encrypts tokens for storage, fetches the user profile, and stores
   * everything in the database.
   */
  linkedinCallback: publicProcedure
    .input(
      z.object({
        code: z.string().min(1),
        state: z.string().min(1),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      // Step 1: Validate state from Redis (also deletes it to prevent replay)
      const stateData = await validateState(input.state);

      if (!stateData) {
        logger.warn(
          { state: input.state },
          'LinkedIn callback with invalid or expired state',
        );
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: 'Invalid or expired OAuth state. Please try connecting again.',
        });
      }

      // Step 2: Exchange authorization code for tokens
      let tokens;
      try {
        tokens = await exchangeCodeForTokens(
          input.code,
          stateData.codeVerifier,
          stateData.redirectUri,
        );
      } catch (error: unknown) {
        const message = error instanceof Error ? error.message : 'Token exchange failed';
        logger.error(
          { userId: stateData.userId, error: message },
          'LinkedIn token exchange failed',
        );
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: 'Failed to exchange authorization code. Please try again.',
        });
      }

      // Step 3: Fetch LinkedIn profile using the new access token
      let profile;
      try {
        profile = await getProfile(tokens.accessToken);
      } catch (error: unknown) {
        const message = error instanceof Error ? error.message : 'Profile fetch failed';
        logger.error(
          { userId: stateData.userId, error: message },
          'Failed to fetch LinkedIn profile',
        );
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: 'Failed to fetch your LinkedIn profile. Please try again.',
        });
      }

      // Step 4: Encrypt tokens for storage
      const accessTokenEnc = await encryptToken(tokens.accessToken);
      const refreshTokenEnc = tokens.refreshToken
        ? await encryptToken(tokens.refreshToken)
        : null;

      const expiresAt = new Date(Date.now() + tokens.expiresIn * 1000);
      const refreshExpiresAt = tokens.refreshExpiresIn
        ? new Date(Date.now() + tokens.refreshExpiresIn * 1000)
        : null;

      const scopes = tokens.scope.split(' ').filter(Boolean);

      // Step 5: Upsert token row (one token per user)
      const existingToken = await ctx.db
        .select({ id: linkedinOauthTokens.id })
        .from(linkedinOauthTokens)
        .where(eq(linkedinOauthTokens.userId, stateData.userId))
        .limit(1);

      if (existingToken.length > 0) {
        await ctx.db
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
          .where(eq(linkedinOauthTokens.userId, stateData.userId));
      } else {
        await ctx.db.insert(linkedinOauthTokens).values({
          userId: stateData.userId,
          accessTokenEnc,
          refreshTokenEnc,
          scopes,
          expiresAt,
          refreshExpiresAt,
        });
      }

      // Step 6: Update user record with LinkedIn identity.
      // Note: LinkedIn's OIDC /userinfo endpoint does not return a vanity URL
      // or headline, so those columns are left untouched here.
      await ctx.db
        .update(users)
        .set({
          linkedinId: profile.sub,
          name: profile.name || undefined,
          avatarUrl: profile.picture || undefined,
          updatedAt: new Date(),
        })
        .where(eq(users.id, stateData.userId));

      logger.info(
        { userId: stateData.userId, linkedinSub: profile.sub },
        'LinkedIn account connected successfully',
      );

      return {
        success: true,
        profile: {
          linkedinId: profile.sub,
          name: profile.name,
          headline: profile.givenName && profile.familyName
            ? `${profile.givenName} ${profile.familyName}`
            : profile.name,
          avatarUrl: profile.picture,
          email: profile.email,
        },
      };
    }),

  /**
   * Disconnect LinkedIn account.
   * Revokes the access token with LinkedIn, deletes the stored token row,
   * and clears the user's LinkedIn identity fields.
   */
  linkedinDisconnect: protectedProcedure.mutation(async ({ ctx }) => {
    // Load existing token
    const [tokenRow] = await ctx.db
      .select()
      .from(linkedinOauthTokens)
      .where(eq(linkedinOauthTokens.userId, ctx.user.id))
      .limit(1);

    if (tokenRow) {
      // Best-effort token revocation with LinkedIn
      try {
        const accessToken = await decryptToken(tokenRow.accessTokenEnc);
        await revokeToken(accessToken);
      } catch (error: unknown) {
        const message = error instanceof Error ? error.message : 'Unknown error';
        logger.warn(
          { userId: ctx.user.id, error: message },
          'Failed to revoke LinkedIn token (continuing with disconnect)',
        );
      }

      // Delete token row
      await ctx.db
        .delete(linkedinOauthTokens)
        .where(eq(linkedinOauthTokens.userId, ctx.user.id));
    }

    // Clear LinkedIn identity from user record
    await ctx.db
      .update(users)
      .set({
        linkedinId: null,
        linkedinVanityUrl: null,
        updatedAt: new Date(),
      })
      .where(eq(users.id, ctx.user.id));

    logger.info({ userId: ctx.user.id }, 'LinkedIn account disconnected');

    return { success: true };
  }),
});
