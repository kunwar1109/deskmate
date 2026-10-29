// Runs in every test file before any app code is imported, so config.ts validates these values.
// NODE_ENV=test also stops config.ts from loading the real .env (and the real database and keys).
process.env.NODE_ENV = 'test';
process.env.MONGODB_DB = `deskmate_test_${process.env.JEST_WORKER_ID ?? '1'}`; // one database per parallel worker
process.env.REDIS_URL = 'redis://127.0.0.1:1'; // never connected: tests use an in-memory rate-limit store and a fake queue
process.env.GOOGLE_GENERATIVE_AI_API_KEY = 'test-key-never-sent'; // the agent is replaced by a fake in API tests
process.env.JWT_SECRET = 'test-only-secret-that-is-long-enough-for-hs256';
process.env.CLIENT_IP_HEADER = 'x-test-client-ip'; // like Render's cf-connecting-ip (test/api/widget.test.ts)
