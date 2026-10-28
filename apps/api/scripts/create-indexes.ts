/**
 * One-time setup: creates the collections, normal indexes and the Atlas Vector Search index.
 * Run with: npm run db:setup
 */
import { EMBEDDING_DIMENSIONS, VECTOR_INDEX_NAME } from '../src/config.js';
import { chunks, closeDb, connectDb, db, documents } from '../src/db.js';

await connectDb();

const existing = new Set((await db.listCollections({}, { nameOnly: true }).toArray()).map((c) => c.name));
for (const name of ['documents', 'chunks']) {
  if (!existing.has(name)) await db.createCollection(name);
}

await documents.createIndex({ workspaceId: 1, createdAt: -1 });
await chunks.createIndex({ documentId: 1 });
console.log('Regular indexes ready.');

const searchIndexes = await chunks.listSearchIndexes(VECTOR_INDEX_NAME).toArray();
if (searchIndexes.length === 0) {
  await chunks.createSearchIndex({
    name: VECTOR_INDEX_NAME,
    type: 'vectorSearch',
    definition: {
      fields: [
        { type: 'vector', path: 'embedding', numDimensions: EMBEDDING_DIMENSIONS, similarity: 'cosine' },
        { type: 'filter', path: 'workspaceId' },
        { type: 'filter', path: 'documentId' },
      ],
    },
  });
  console.log(`Creating vector index "${VECTOR_INDEX_NAME}"...`);
} else {
  console.log(`Vector index "${VECTOR_INDEX_NAME}" already exists.`);
}

// Atlas builds search indexes in the background. Wait until it can be queried.
for (let attempt = 0; attempt < 60; attempt++) {
  const [index] = (await chunks.listSearchIndexes(VECTOR_INDEX_NAME).toArray()) as { queryable?: boolean }[];
  if (index?.queryable) {
    console.log('Vector index is ready.');
    break;
  }
  if (attempt === 59) console.log('Index is still building. Check Atlas > Search & Vector Search in a minute.');
  await new Promise((r) => setTimeout(r, 5000));
}

await closeDb();
