import { z } from 'zod';

// Load .env with Node's built-in loader (no dotenv needed). Missing file is fine in production.
try {
  process.loadEnvFile();
} catch {}

const EnvSchema = z.object({
  PORT: z.coerce.number().default(4000),
  MONGODB_URI: z.string().min(1, 'MONGODB_URI is required'),
  MONGODB_DB: z.string().default('deskmate'),
  GOOGLE_GENERATIVE_AI_API_KEY: z.string().min(1, 'GOOGLE_GENERATIVE_AI_API_KEY is required'),
  // Flash-Lite: no hidden "thinking" step, so ~1s answers, and its own free-tier quota, separate from Flash.
  CHAT_MODEL: z.string().default('gemini-flash-lite-latest'),
  // Atlas vector scores are 0..1. Below this, we don't trust retrieval and hand off instead of guessing.
  MIN_RELEVANCE: z.coerce.number().min(0).max(1).default(0.7),
  // Phase 1 has no auth, so every request belongs to this workspace. Phase 2 replaces this with JWT.
  DEV_WORKSPACE_ID: z.string().default('dev-workspace'),
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
