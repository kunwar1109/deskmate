/**
 * Background worker process: runs ingestion jobs (src/ingest-worker.ts).
 * A separate process from the API, so slow embedding work never makes the API sluggish,
 * and in production the two can be scaled and restarted independently.
 * Run with: npm run dev:worker
 */
import { closeDb, connectDb } from './db.js';
import { startIngestWorker } from './ingest-worker.js';
import { flushErrors } from './lib/monitoring.js';

await connectDb();
const worker = startIngestWorker();

for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.on(signal, () => {
    // close() lets the current job finish before exiting, so a restart doesn't cut an ingestion in half.
    void worker.close().then(closeDb).then(flushErrors).then(() => process.exit(0));
  });
}
