import express, { type ErrorRequestHandler } from 'express';
import multer from 'multer';
import { ZodError } from 'zod';
import { env } from './config.js';
import { closeDb, connectDb } from './db.js';
import { UnsupportedFileError } from './lib/extract.js';
import { chatRouter } from './routes/chat.js';
import { documentsRouter } from './routes/documents.js';

const app = express();
app.use(express.json({ limit: '100kb' }));

app.get('/health', (_req, res) => {
  res.json({ ok: true });
});
app.use('/api/documents', documentsRouter);
app.use('/api/chat', chatRouter);

// Express 5 forwards errors from async handlers here automatically.
const errorHandler: ErrorRequestHandler = (err, _req, res, _next) => {
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
