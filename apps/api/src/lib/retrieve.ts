import { setTimeout as sleep } from 'node:timers/promises';
import type { ObjectId } from 'mongodb';
import { VECTOR_INDEX_NAME } from '../config.js';
import { chunks } from '../db.js';
import { embedQuery } from './embed.js';

export interface RetrievedChunk {
  _id: ObjectId;
  documentId: ObjectId;
  documentTitle: string;
  index: number;
  page?: number;
  text: string;
  score: number; // 0..1, higher is more similar
}

/**
 * Semantic search: embed the question, then ask MongoDB Atlas for the nearest chunk vectors.
 * The workspaceId filter runs inside the vector index, so one tenant can never retrieve another's data.
 */
export async function retrieve(workspaceId: string, question: string, limit = 5): Promise<RetrievedChunk[]> {
  const queryVector = await embedQuery(question);

  return chunks
    .aggregate<RetrievedChunk>([
      {
        $vectorSearch: {
          index: VECTOR_INDEX_NAME,
          path: 'embedding',
          queryVector,
          numCandidates: limit * 20, // approximate search: look at more candidates for better recall
          limit,
          filter: { workspaceId },
        },
      },
      {
        $project: {
          documentId: 1,
          documentTitle: 1,
          index: 1,
          page: 1,
          text: 1,
          score: { $meta: 'vectorSearchScore' },
        },
      },
    ])
    .toArray();
}

/**
 * Atlas Vector Search indexes new vectors a few seconds after they're written. Poll until every chunk of a
 * document shows up in search, so "ready" means a question asked right now can actually find it.
 * `exact: true` checks all of this document's chunks instead of an approximate sample, so the count is reliable.
 */
export async function waitUntilSearchable(
  documentId: ObjectId,
  chunkCount: number,
  probeVector: number[],
  timeoutMs = 60_000,
): Promise<void> {
  const expected = Math.min(chunkCount, 10_000); // $vectorSearch returns at most 10,000 results
  const deadline = Date.now() + timeoutMs;

  while (Date.now() < deadline) {
    const [result] = await chunks
      .aggregate<{ n: number }>([
        {
          $vectorSearch: {
            index: VECTOR_INDEX_NAME,
            path: 'embedding',
            queryVector: probeVector,
            exact: true,
            limit: expected,
            filter: { documentId },
          },
        },
        { $count: 'n' },
      ])
      .toArray();
    if ((result?.n ?? 0) >= expected) return;
    await sleep(1000);
  }
  throw new Error('Timed out waiting for the search index to include the new chunks');
}
