import { Queue } from 'bullmq';
import { env } from './config.js';

/**
 * Ingestion runs in a background worker (src/worker.ts), not inside the upload request:
 * a big PDF can take minutes to embed, and free-tier rate limits mean it may need retries.
 * The API only adds a job to this queue; Redis holds the job until the worker picks it up.
 */
export const INGEST_QUEUE = 'ingest';

export interface IngestJobData {
  documentId: string;
}

// BullMQ opens its own connections from these options. maxRetriesPerRequest must be null for workers:
// their long "wait for a job" call must not be cut off by ioredis' per-command retry limit.
export const redisConnection = { url: env.REDIS_URL, maxRetriesPerRequest: null };

// Shared by the Queue (API side) and the Worker: both must use the same prefix to see the same jobs.
export const queueOptions = { connection: redisConnection, prefix: env.QUEUE_PREFIX };

export const ingestQueue = new Queue<IngestJobData>(INGEST_QUEUE, {
  ...queueOptions,
  defaultJobOptions: {
    attempts: 5,
    backoff: { type: 'exponential', delay: 10_000 }, // waits 10s, 20s, 40s, 80s: outlasts per-minute rate limits
    // Keep Redis small. The document's status in MongoDB is the record users see, not the job.
    removeOnComplete: 100,
    removeOnFail: 500,
  },
});
