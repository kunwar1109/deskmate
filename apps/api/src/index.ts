import { createApp } from './app.js';
import { env } from './config.js';
import { closeDb, connectDb } from './db.js';
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

for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.on(signal, () => {
    // io.close() disconnects sockets too; otherwise their open connections keep the server from closing.
    void io.close(() => void Promise.all([closeDb(), ingestQueue.close(), closeRateLimiter(), flushErrors()]).then(() => process.exit(0)));
  });
}
