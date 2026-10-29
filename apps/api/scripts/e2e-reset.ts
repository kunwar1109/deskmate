/**
 * Empties the E2E database before a Playwright run, so every run starts from the same state.
 * deleteMany (not drop) keeps the collections and their indexes, including the Atlas vector index,
 * which takes a while to rebuild. Refuses any database not named *_e2e: it can never wipe dev data.
 * Run by e2e/global-setup.ts via: npm run e2e:prepare -w apps/api
 */
import { env } from '../src/config.js';
import { closeDb, connectDb, db } from '../src/db.js';

if (!env.MONGODB_DB.endsWith('_e2e')) {
  console.error(`Refusing to empty "${env.MONGODB_DB}": only databases ending in _e2e can be reset.`);
  process.exit(1);
}

await connectDb();
for (const collection of await db.collections()) {
  await collection.deleteMany({});
}
console.log(`Emptied ${env.MONGODB_DB}.`);
await closeDb();
