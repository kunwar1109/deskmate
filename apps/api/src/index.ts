import { MAX_UPLOAD_BYTES } from '@deskmate/shared/documents';
import cookieParser from 'cookie-parser';
import express, { type ErrorRequestHandler } from 'express';
import multer from 'multer';
import { ZodError } from 'zod';
import { env } from './config.js';
import { closeDb, connectDb } from './db.js';
import { requireAuth } from './lib/auth.js';
import { HttpError } from './lib/errors.js';
import { UnsupportedFileError } from './lib/extract.js';
import { authRouter } from './routes/auth.js';
import { conversationsRouter } from './routes/conversations.js';
import { documentsRouter } from './routes/documents.js';
import { ingestQueue } from './queue.js';

const app = express();
app.use(express.json({ limit: '100kb' }));
app.use(cookieParser());

app.get('/health', (_req, res) => {
  res.json({ ok: true });
});
app.use('/api/auth', authRouter);
// Everything below needs a logged-in user. Applying requireAuth here means a new route can't forget it.
app.use('/api/documents', requireAuth, documentsRouter);
app.use('/api/conversations', requireAuth, conversationsRouter);

// Express 5 forwards errors from async handlers here automatically.
const errorHandler: ErrorRequestHandler = (err, _req, res, _next) => {
  if (err instanceof HttpError) {
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

for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.on(signal, () => {
    server.close(() => void Promise.all([closeDb(), ingestQueue.close()]).then(() => process.exit(0)));
  });
}
