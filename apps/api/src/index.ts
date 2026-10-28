import { APICallError, RetryError } from 'ai';
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
import { chatRouter } from './routes/chat.js';
import { documentsRouter } from './routes/documents.js';

const app = express();
app.use(express.json({ limit: '100kb' }));
app.use(cookieParser());

app.get('/health', (_req, res) => {
  res.json({ ok: true });
});
app.use('/api/auth', authRouter);
// Everything below needs a logged-in user. Applying requireAuth here means a new route can't forget it.
app.use('/api/documents', requireAuth, documentsRouter);
app.use('/api/chat', requireAuth, chatRouter);

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
    res.status(400).json({ error: err.message });
    return;
  }
  if (err instanceof UnsupportedFileError) {
    res.status(415).json({ error: err.message });
    return;
  }
  // Gemini rate limit. 503, not 429: the client didn't misbehave, our upstream provider is out of quota.
  const providerError = RetryError.isInstance(err) ? err.lastError : err;
  if (APICallError.isInstance(providerError) && providerError.statusCode === 429) {
    console.warn('Gemini rate limit hit:', providerError.message.split('\n')[0]);
    res.status(503).json({ error: 'The AI service is busy right now. Please try again in a minute.' });
    return;
  }
  if (err instanceof DOMException && err.name === 'TimeoutError') {
    res.status(504).json({ error: 'The AI service took too long to respond. Please try again.' });
    return;
  }
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
    server.close(() => void closeDb().then(() => process.exit(0)));
  });
}
