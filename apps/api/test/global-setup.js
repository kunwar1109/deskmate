import { MongoMemoryReplSet } from 'mongodb-memory-server';

/**
 * One throwaway MongoDB for the whole test run, never Atlas. A one-member replica set rather than a plain
 * server, because signup uses a transaction and MongoDB only supports those on replica sets.
 * The first run downloads a MongoDB binary (about 100 MB, cached afterwards).
 */
export default async function globalSetup() {
  const replSet = await MongoMemoryReplSet.create({ replSet: { count: 1 } });
  globalThis.__MONGO_REPLSET__ = replSet;
  process.env.MONGODB_URI = replSet.getUri(); // test workers start after this, so they inherit it
}
