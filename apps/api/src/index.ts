import { createApp } from './app.js';
import { env } from './config.js';
import { closeDb, connectDb } from './db.js';
import { startIngestWorker } from './ingest-worker.js';
import { flushErrors } from './lib/monitoring.js';
import { closeRateLimiter } from './lib/rate-limit.js';
import { ingestQueue } from './queue.js';
import { initRealtime } from './realtime.js';

await connectDb();
const server = createApp().listen(env.PORT, () => {
  console.log(`Deskmate API on http://localhost:${env.PORT}`);
});
// Socket.io shares the HTTP server and port: it handles /socket.io/ requests before Express sees them.
const io = initRealtime(server);
// Hosts without background workers (Render's free plan) get one process that does both jobs.
const worker = env.WORKER_IN_API ? startIngestWorker() : undefined;

for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.on(signal, () => {
    // io.close() disconnects sockets too; otherwise their open connections keep the server from closing.
    // The worker closes first: it lets the current job finish, and that job still needs the database.
    void io.close(
      () =>
        void (worker?.close() ?? Promise.resolve())
          .then(() => Promise.all([closeDb(), ingestQueue.close(), closeRateLimiter(), flushErrors()]))
          .then(() => process.exit(0)),
    );
  });
}
