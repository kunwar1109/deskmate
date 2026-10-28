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
