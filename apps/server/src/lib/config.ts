import 'dotenv/config';
import { z } from 'zod';

const envSchema = z.object({
  DATABASE_URL: z
    .string()
    .min(1, 'DATABASE_URL is required')
    .url('DATABASE_URL must be a valid URL'),

  REDIS_URL: z
    .string()
    .min(1, 'REDIS_URL is required'),

  OAUTH_ENCRYPTION_KEY: z
    .string()
    .min(32, 'OAUTH_ENCRYPTION_KEY must be at least 32 characters (hex-encoded 16+ bytes)'),

  LINKEDIN_CLIENT_ID: z
    .string()
    .min(1, 'LINKEDIN_CLIENT_ID is required'),

  LINKEDIN_CLIENT_SECRET: z
    .string()
    .min(1, 'LINKEDIN_CLIENT_SECRET is required'),

  LINKEDIN_REDIRECT_URI: z
    .string()
    .url('LINKEDIN_REDIRECT_URI must be a valid URL'),

  LLM_API_KEY: z
    .string()
    .min(1, 'LLM_API_KEY is required'),

  LLM_BASE_URL: z
    .string()
    .url()
    .default('https://api.groq.com/openai/v1'),

  LLM_MODEL: z
    .string()
    .default('llama-3.3-70b-versatile'),

  STRIPE_SECRET_KEY: z
    .string()
    .optional()
    .default(''),

  STRIPE_WEBHOOK_SECRET: z
    .string()
    .optional()
    .default(''),

  RESEND_API_KEY: z
    .string()
    .optional()
    .default(''),

  SELF_HOSTED: z
    .string()
    .optional()
    .default('false'),

  PORT: z
    .string()
    .default('4000')
    .transform(Number)
    .pipe(z.number().int().min(1).max(65535)),

  NODE_ENV: z
    .enum(['development', 'production', 'test'])
    .default('development'),
});

function loadConfig() {
  const parsed = envSchema.safeParse(process.env);

  if (!parsed.success) {
    const formatted = parsed.error.issues
      .map((issue) => `  - ${issue.path.join('.')}: ${issue.message}`)
      .join('\n');

    console.error('Invalid environment variables:\n' + formatted);
    process.exit(1);
  }

  return Object.freeze(parsed.data);
}

export type Config = ReturnType<typeof loadConfig>;

export const config = loadConfig();
