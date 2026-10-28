import { MAX_UPLOAD_BYTES } from '@deskmate/shared/documents';
import cookieParser from 'cookie-parser';
import { fileURLToPath } from 'node:url';
import express, { type ErrorRequestHandler } from 'express';
import multer from 'multer';
import { ZodError } from 'zod';
import { env } from './config.js';
import { closeDb, connectDb } from './db.js';
import { requireAuth } from './lib/auth.js';
import { HttpError, RateLimitError } from './lib/errors.js';
import { UnsupportedFileError } from './lib/extract.js';
import { closeRateLimiter } from './lib/rate-limit.js';
import { authRouter } from './routes/auth.js';
import { conversationsRouter } from './routes/conversations.js';
import { documentsRouter } from './routes/documents.js';
import { publicRouter } from './routes/public.js';
import { realtimeRouter } from './routes/realtime.js';
import { widgetRouter } from './routes/widget.js';
import { ingestQueue } from './queue.js';
import { initRealtime } from './realtime.js';

const app = express();
// Behind a load balancer, req.socket's address is the proxy's. Trusting exactly N hops makes req.ip the real
// client from X-Forwarded-For; trusting more would let clients fake their IP and dodge rate limits.
app.set('trust proxy', env.TRUST_PROXY_HOPS);
app.use(express.json({ limit: '100kb' }));
app.use(cookieParser());

app.get('/health', (_req, res) => {
  res.json({ ok: true });
});

// The embeddable widget, built by apps/widget. Served by the API so the snippet is one URL, and the widget
// can default to calling the API it came from.
const WIDGET_SCRIPT = fileURLToPath(new URL('../../widget/dist/widget.js', import.meta.url));
app.get('/widget.js', (_req, res) => {
  res.sendFile(
    WIDGET_SCRIPT,
    {
      maxAge: '5m', // short: the filename never changes, so a long cache would delay fixes for every site
      // Sites that isolate themselves (Cross-Origin-Embedder-Policy) only load cross-site files that opt in.
      headers: { 'Cross-Origin-Resource-Policy': 'cross-origin' },
    },
    (err) => {
      if (err && !res.headersSent) res.status(404).json({ error: 'Widget not built. Run: npm run build -w apps/widget' });
    },
  );
});
app.use('/api/auth', authRouter);
// Public widget API: called from customers' websites, no login. Its own CORS, key and rate-limit checks.
app.use('/api/public/w/:widgetKey', publicRouter);
// Everything below needs a logged-in user. Applying requireAuth here means a new route can't forget it.
app.use('/api/documents', requireAuth, documentsRouter);
app.use('/api/conversations', requireAuth, conversationsRouter);
app.use('/api/widget', requireAuth, widgetRouter);
app.use('/api/realtime', requireAuth, realtimeRouter);

// Express 5 forwards errors from async handlers here automatically.
const errorHandler: ErrorRequestHandler = (err, _req, res, _next) => {
  if (err instanceof HttpError) {
    if (err instanceof RateLimitError) res.setHeader('Retry-After', String(err.retryAfterSeconds));
    res.status(err.status).json({ error: err.message });
    return;
  }
  if (err instanceof ZodError) {
    res.status(400).json({ error: 'Invalid request', issues: err.issues.map((i) => i.message) });
    return;
  }
  if (err instanceof multer.MulterError) {
    // 413 Payload Too Large is the precise status for an oversized upload; other multer errors are bad input.
    const tooLarge = err.code === 'LIMIT_FILE_SIZE';
    res
      .status(tooLarge ? 413 : 400)
      .json({ error: tooLarge ? `File is larger than the ${MAX_UPLOAD_BYTES / (1024 * 1024)} MB limit` : err.message });
    return;
  }
  if (err instanceof UnsupportedFileError) {
    res.status(415).json({ error: err.message });
    return;
  }
  // AI failures (Gemini 429s, timeouts) happen mid-stream, after "200 OK" is sent, so they're handled
  // in lib/ai-errors.ts and reach the client inside the stream, not here.
  console.error(err);
  res.status(500).json({ error: 'Something went wrong' });
};
app.use(errorHandler);

await connectDb();
const server = app.listen(env.PORT, () => {
  console.log(`Deskmate API on http://localhost:${env.PORT}`);
});
// Socket.io shares the HTTP server and port: it handles /socket.io/ requests before Express sees them.
const io = initRealtime(server);

for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.on(signal, () => {
    // io.close() disconnects sockets too; otherwise their open connections keep the server from closing.
    void io.close(() => void Promise.all([closeDb(), ingestQueue.close(), closeRateLimiter()]).then(() => process.exit(0)));
  });
}
