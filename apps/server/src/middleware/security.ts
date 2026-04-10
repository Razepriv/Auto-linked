import helmet from 'helmet';
import cors from 'cors';
import type { RequestHandler } from 'express';

// ---------------------------------------------------------------------------
// Security middleware
// ---------------------------------------------------------------------------

/**
 * Helmet security headers with CSP, HSTS, and X-Frame-Options.
 */
export function createHelmetMiddleware(): RequestHandler {
  return helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'"],
        styleSrc: ["'self'", "'unsafe-inline'"],
        imgSrc: ["'self'", 'data:', 'https:'],
        connectSrc: ["'self'"],
        fontSrc: ["'self'"],
        objectSrc: ["'none'"],
        frameSrc: ["'none'"],
        baseUri: ["'self'"],
        formAction: ["'self'"],
      },
    },
    hsts: {
      maxAge: 31_536_000, // 1 year
      includeSubDomains: true,
      preload: true,
    },
    frameguard: { action: 'deny' },
    referrerPolicy: { policy: 'strict-origin-when-cross-origin' },
    crossOriginEmbedderPolicy: false, // Disabled — breaks some client-side fetches
  }) as RequestHandler;
}

/**
 * Production-ready CORS configuration.
 *
 * In development, all origins are allowed.
 * In production, origins are read from the `CORS_ORIGINS` env variable
 * (comma-separated) with a fallback to `https://autolinked.app`.
 */
export function createCorsMiddleware(nodeEnv: string): RequestHandler {
  if (nodeEnv !== 'production') {
    return cors({ origin: true, credentials: true, maxAge: 86_400 });
  }

  const rawOrigins = process.env['CORS_ORIGINS'];
  const allowlist: string[] = rawOrigins
    ? rawOrigins.split(',').map((o) => o.trim()).filter(Boolean)
    : ['https://autolinked.app'];

  return cors({
    origin(origin, callback) {
      // Allow requests with no origin (server-to-server, health checks, etc.)
      if (!origin || allowlist.includes(origin)) {
        callback(null, true);
      } else {
        callback(new Error(`Origin ${origin} not allowed by CORS`));
      }
    },
    credentials: true,
    maxAge: 86_400,
  });
}
