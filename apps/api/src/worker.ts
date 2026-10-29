/**
 * Background worker: takes ingestion jobs off the Redis queue and runs them.
 * A separate process from the API, so slow embedding work never makes the API sluggish,
 * and in production the two can be scaled and restarted independently.
 * Run with: npm run dev:worker
 */
import { UnrecoverableError, Worker } from 'bullmq';
import { ObjectId } from 'mongodb';
import { closeDb, connectDb } from './db.js';
import { ingestDocument, markFailed } from './lib/ingest.js';
import { flushErrors, reportError } from './lib/monitoring.js';
import { INGEST_QUEUE, queueOptions, type IngestJobData } from './queue.js';

await connectDb();

const worker = new Worker<IngestJobData>(
  INGEST_QUEUE,
  async (job) => ingestDocument(new ObjectId(job.data.documentId)),
  {
    ...queueOptions,
    concurrency: 1, // one document at a time keeps us under Gemini's free-tier embedding limits
    // Upstash's free tier counts every Redis command (500K/month), and an idle worker keeps asking Redis
    // "any jobs?". Wait up to 60s per ask instead of 5s, and check for crashed jobs every 5 min instead of 30s.
    drainDelay: 60,
    stalledInterval: 5 * 60_000,
  },
);

worker.on('ready', () => console.log('Ingestion worker waiting for jobs'));

worker.on('completed', (job, result) => {
  console.log(JSON.stringify({ event: 'ingest_done', documentId: job.data.documentId, ...result, attempts: job.attemptsMade }));
});

worker.on('failed', (job, err) => {
  if (!job) return;
  // 'failed' fires on every failed attempt. Only mark the document failed once BullMQ stops retrying.
  const final = err instanceof UnrecoverableError || job.attemptsMade >= (job.opts.attempts ?? 1);
  console.warn(
    JSON.stringify({ event: final ? 'ingest_failed' : 'ingest_retry', documentId: job.data.documentId, attempt: job.attemptsMade, error: err.message }),
  );
  if (final) void markFailed(new ObjectId(job.data.documentId), err.message);
  // An unreadable file is the customer's problem and the document shows why. Giving up after every retry
  // (Gemini down, a bug in a parser) is ours.
  if (final && !(err instanceof UnrecoverableError)) reportError(err, { tags: { stage: 'ingest', documentId: job.data.documentId } });
});

for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.on(signal, () => {
    // close() lets the current job finish before exiting, so a restart doesn't cut an ingestion in half.
    void worker.close().then(closeDb).then(flushErrors).then(() => process.exit(0));
  });
}
