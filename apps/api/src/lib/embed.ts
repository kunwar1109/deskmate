import { google } from '@ai-sdk/google';
import { embed, embedMany } from 'ai';
import { EMBEDDING_DIMENSIONS, EMBEDDING_MODEL } from '../config.js';

const model = google.embedding(EMBEDDING_MODEL);

/**
 * Gemini embeddings take a task type. Documents and questions are embedded slightly differently
 * ("asymmetric retrieval"), which measurably improves search quality over embedding both the same way.
 */
export async function embedDocuments(texts: string[]): Promise<number[][]> {
  const { embeddings } = await embedMany({
    model,
    values: texts,
    maxParallelCalls: 2, // stay friendly with free-tier rate limits
    providerOptions: {
      google: { outputDimensionality: EMBEDDING_DIMENSIONS, taskType: 'RETRIEVAL_DOCUMENT' },
    },
  });
  return embeddings;
}

export async function embedQuery(text: string): Promise<number[]> {
  const { embedding } = await embed({
    model,
    value: text,
    providerOptions: {
      google: { outputDimensionality: EMBEDDING_DIMENSIONS, taskType: 'RETRIEVAL_QUERY' },
    },
  });
  return embedding;
}
