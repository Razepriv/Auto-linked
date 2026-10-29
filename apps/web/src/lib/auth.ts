import NextAuth from "next-auth";
import LinkedIn from "next-auth/providers/linkedin";
import Resend from "next-auth/providers/resend";
import type { NextAuthConfig } from "next-auth";

/**
 * NextAuth v5 configuration for AutoLinked.
 *
 * Providers:
 *   - LinkedIn OAuth (primary login + account linking)
 *   - Resend magic link (email sign-in)
 *
 * Strategy: JWT sessions (no DB sessions — we store minimal data in the token).
 * The Drizzle adapter handles user/account/verification-token persistence.
 */

export const authConfig: NextAuthConfig = {
  providers: [
    LinkedIn({
      clientId: process.env.LINKEDIN_CLIENT_ID!,
      clientSecret: process.env.LINKEDIN_CLIENT_SECRET!,
      authorization: {
        params: {
          scope: "openid profile email w_member_social",
        },
      },
    }),
    ...(process.env.RESEND_API_KEY
      ? [
          Resend({
            apiKey: process.env.RESEND_API_KEY,
            from: process.env.EMAIL_FROM ?? "AutoLinked <noreply@autolinked.ai>",
          }),
        ]
      : []),
  ],

  pages: {
    signIn: "/login",
    signOut: "/login",
    error: "/login",
    verifyRequest: "/login/verify",
    newUser: "/onboarding",
  },

  session: {
    strategy: "jwt",
    maxAge: 30 * 24 * 60 * 60, // 30 days
  },

  callbacks: {
    async jwt({ token, user, account, profile, trigger }) {
      // On initial sign-in, attach user data to the JWT
      if (user) {
        token.id = user.id;
        token.email = user.email;
        token.name = user.name;
        token.image = user.image;
      }

      // If LinkedIn account was just linked, sync identity + encrypted tokens
      // to the Express backend so publishing can use them without requiring
      // a separate "Connect LinkedIn" click on the profile page.
      if (account?.provider === "linkedin" && account.access_token) {
        token.linkedinConnected = true;

        const email =
          (token.email as string | undefined) ??
          (user?.email as string | undefined) ??
          null;
        const linkedinSub =
          (account.providerAccountId as string | undefined) ??
          ((profile as { sub?: string } | undefined)?.sub ?? null);

        if (email && linkedinSub) {
          const picture =
            (profile as { picture?: string } | undefined)?.picture ??
            (token.image as string | undefined) ??
            null;
          const name =
            (token.name as string | undefined) ??
            (user?.name as string | undefined) ??
            email;

          // Fire-and-forget: don't block the auth flow if the backend is slow.
          const backendUrl =
            process.env.BACKEND_URL ?? "http://localhost:4000";
          const proxySecret =
            process.env.PROXY_SECRET ?? "dev-proxy-secret";

          void fetch(`${backendUrl}/internal/linkedin-sync`, {
            method: "POST",
            headers: {
              "content-type": "application/json",
              "x-proxy-secret": proxySecret,
            },
            body: JSON.stringify({
              email,
              name,
              linkedinSub,
              picture,
              accessToken: account.access_token,
              refreshToken: account.refresh_token ?? null,
              expiresIn:
                typeof account.expires_in === "number"
                  ? account.expires_in
                  : 3600,
              refreshExpiresIn:
                typeof (account as { refresh_token_expires_in?: number })
                  .refresh_token_expires_in === "number"
                  ? (account as { refresh_token_expires_in?: number })
                      .refresh_token_expires_in
                  : null,
              scope: account.scope ?? "",
            }),
          }).catch((err: unknown) => {
            console.error(
              "[auth] linkedin-sync failed:",
              err instanceof Error ? err.message : err,
            );
          });
        }
      }

      // On update trigger (e.g., after onboarding), refresh token data
      if (trigger === "update") {
        // Re-fetch from the server if needed
      }

      return token;
    },

    async session({ session, token }) {
      if (token) {
        session.user.id = token.id as string;
        session.user.email = token.email as string;
        session.user.name = token.name as string;
        session.user.image = token.image as string | undefined;
      }
      return session;
    },

    async redirect({ url, baseUrl }) {
      // After sign-in, redirect to dashboard (or onboarding for new users)
      if (url.startsWith("/")) return `${baseUrl}${url}`;
      if (new URL(url).origin === baseUrl) return url;
      return `${baseUrl}/dashboard`;
    },

    authorized({ auth, request: { nextUrl } }) {
      const isLoggedIn = !!auth?.user;
      const isPublicPath =
        nextUrl.pathname === "/" ||
        nextUrl.pathname.startsWith("/login") ||
        nextUrl.pathname.startsWith("/signup") ||
        nextUrl.pathname.startsWith("/api/auth") ||
        nextUrl.pathname.startsWith("/pricing");

      if (isPublicPath) return true;
      if (!isLoggedIn) return false;
      return true;
    },
  },

  events: {
    async createUser({ user }) {
      // New user created — they'll be redirected to onboarding
      console.info(`[auth] New user created: ${user.email}`);
    },
    async linkAccount({ user, account }) {
      if (account.provider === "linkedin") {
        console.info(`[auth] LinkedIn account linked for user: ${user.email}`);
      }
    },
  },

  trustHost: true,
  debug: process.env.NODE_ENV === "development",
};

export const {
  handlers,
  auth,
  signIn,
  signOut,
} = NextAuth(authConfig);
