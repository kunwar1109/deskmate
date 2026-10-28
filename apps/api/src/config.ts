import { z } from 'zod';

// Load .env with Node's built-in loader (no dotenv needed). Missing file is fine in production.
try {
  process.loadEnvFile();
} catch {}

const EnvSchema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  PORT: z.coerce.number().default(4000),
  MONGODB_URI: z.string().min(1, 'MONGODB_URI is required'),
  MONGODB_DB: z.string().default('deskmate'),
  // Job queue for ingestion. Upstash gives a rediss:// URL (the extra "s" means TLS).
  REDIS_URL: z.string().regex(/^rediss?:\/\//, 'REDIS_URL must start with redis:// or rediss://'),
  GOOGLE_GENERATIVE_AI_API_KEY: z.string().min(1, 'GOOGLE_GENERATIVE_AI_API_KEY is required'),
  // Flash-Lite: no hidden "thinking" step, so ~1s answers, and its own free-tier quota, separate from Flash.
  CHAT_MODEL: z.string().default('gemini-flash-lite-latest'),
  // Atlas vector scores are 0..1. Below this, we don't trust retrieval and hand off instead of guessing.
  MIN_RELEVANCE: z.coerce.number().min(0).max(1).default(0.7),
  // Signs session JWTs. Anyone with this can log in as any user, so it must be long and random.
  JWT_SECRET: z.string().min(32, 'JWT_SECRET must be at least 32 characters'),
});

const parsed = EnvSchema.safeParse(process.env);
if (!parsed.success) {
  console.error('Invalid environment:', z.prettifyError(parsed.error));
  process.exit(1);
}

export const env = parsed.data;

export const EMBEDDING_MODEL = 'gemini-embedding-001';
export const EMBEDDING_DIMENSIONS = 768; // reduced from 3072 to save storage; quality loss is small
export const VECTOR_INDEX_NAME = 'chunks_vector_index';
export const SESSION_COOKIE = 'deskmate_session';
export const SESSION_TTL_SECONDS = 7 * 24 * 60 * 60; // 7 days
